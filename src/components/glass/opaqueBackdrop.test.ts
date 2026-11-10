import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchesOpaqueBackdrop, proveOpaqueBackdrop, type BackdropBounds } from './opaqueBackdrop'
import { installLensOptics, liquidGlassStyle, opticalSamplingPadding } from './optics'

const bounds = {left: 100, top: 100, width: 80, height: 40}
const padding = opticalSamplingPadding(liquidGlassStyle('lens'))
const rectangle = (element: HTMLElement, value: BackdropBounds) => vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({...value, right: value.left + value.width, bottom: value.top + value.height, x: value.left, y: value.top, toJSON() { return value }}) as DOMRect)
function scene() {
  document.body.style.backgroundColor = '#fef7ff'
  rectangle(document.body, {left: 0, top: 0, width: 1024, height: 768})
  const parent = document.createElement('div'), lens = document.createElement('span')
  parent.appendChild(lens); document.body.appendChild(parent)
  rectangle(parent, {left: 40, top: 40, width: 400, height: 300})
  return {parent, lens, proof: () => proveOpaqueBackdrop(lens, () => bounds, padding)}
}
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren()
  document.body.removeAttribute('style'); document.documentElement.removeAttribute('style')
})

describe('opaque backdrop evidence for one paint', () => {
  it('includes the opaque document behind transparent ancestors, with full optical reach', () => {
    const {lens, proof} = scene(), result = proof()
    expect(result).toBeDefined()
    expect(matchesOpaqueBackdrop(result, lens, bounds.width, bounds.height, padding)).toBe(true)
    expect(matchesOpaqueBackdrop(result, lens, bounds.width + 1, bounds.height, padding)).toBe(false)
    expect(matchesOpaqueBackdrop(result, document.body, bounds.width, bounds.height, padding)).toBe(false)
    expect(matchesOpaqueBackdrop(result, lens, bounds.width, bounds.height, padding + 1)).toBe(false)
  })
  it.each([
    ['opacity', '.65'], ['filter', 'opacity(1)'], ['backdrop-filter', 'blur(1px)'],
    ['clip-path', 'inset(0)'], ['mask-image', 'linear-gradient(white,white)'],
    ['mix-blend-mode', 'multiply'], ['transform', 'matrix(2,0,0,2,0,0)'],
    ['rotate', '10deg'], ['will-change', 'filter'], ['will-change', 'opacity'],
  ])('rejects an intervening %s=%s even with an opaque body', (property, value) => {
    const {parent, proof} = scene(); parent.style.setProperty(property, value)
    // jsdom's CSS parser does not implement backdrop-filter. Model the
    // computed browser value at that boundary rather than silently dropping it.
    if (property === 'backdrop-filter') {
      const computed = window.getComputedStyle.bind(window)
      vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
        const style = computed(element)
        if (element === parent) Object.defineProperty(style, 'backdropFilter', {value})
        return style
      })
    }
    expect(proof()).toBeUndefined()
  })
  it('accepts an identity opacity root only when its own opaque background covers the reach', () => {
    const {parent, proof} = scene(); parent.style.willChange = 'opacity'
    parent.style.backgroundColor = '#ffffff'
    expect(proof()).toBeDefined()
    parent.style.backgroundColor = 'rgba(255,255,255,.999)'
    expect(proof()).toBeUndefined()
  })
  it('rejects transparent body, cropped capture and viewport edges rather than painting lost alpha', () => {
    const {parent, lens, proof} = scene()
    document.body.style.backgroundColor = 'rgba(255,255,255,.999)'
    expect(proof()).toBeUndefined()
    document.body.style.backgroundColor = '#ffffff'
    expect(proveOpaqueBackdrop(lens, () => ({...bounds, left: 1}), padding)).toBeUndefined()
    expect(proveOpaqueBackdrop(lens, () => ({...bounds, top: 760}), padding)).toBeUndefined()
    parent.style.overflow = 'hidden'
    expect(proof()).toBeDefined()
    rectangle(parent, {...bounds, width: bounds.width + padding / 2})
    expect(proof()).toBeUndefined()
  })
  it('does not infer opacity for rounded or active animated capture boundaries', () => {
    const {parent, proof} = scene(); parent.style.overflow = 'hidden'; parent.style.borderRadius = '100px'
    expect(proof()).toBeUndefined()
    parent.style.borderRadius = '0'
    Object.defineProperty(parent, 'getAnimations', {configurable: true, value: () => [{playState: 'running', pending: false}]})
    expect(proof()).toBeUndefined()
    Object.defineProperty(parent, 'getAnimations', {configurable: true, value: () => [{playState: 'finished', pending: false}]})
    expect(proof()).toBeDefined()
  })
  it('rechecks scroll clips and source alpha every time instead of retaining a stale proof', () => {
    const {parent, proof} = scene(); parent.style.overflow = 'auto'
    expect(proof()).toBeDefined()
    parent.style.opacity = '.5'; expect(proof()).toBeUndefined()
    parent.style.opacity = '1'; expect(proof()).toBeDefined()
    document.body.style.backgroundColor = 'transparent'; expect(proof()).toBeUndefined()
  })
  it('keeps disconnected panes and invalid sampling bounds on the general graph without measuring', () => {
    const lens = document.createElement('span'), read = vi.fn(() => bounds)
    expect(proveOpaqueBackdrop(lens, read, padding)).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
    scene()
    document.body.appendChild(lens)
    expect(proveOpaqueBackdrop(lens, () => ({...bounds, width: NaN}), padding)).toBeUndefined()
    expect(proveOpaqueBackdrop(lens, read, -1)).toBeUndefined()
  })
})

describe('opaque graph selection and fallback', () => {
  it('requires matching evidence, backdrop target and lens role; transparent content retains its complete graph', () => {
    const {lens, proof} = scene()
    vi.stubGlobal('CanvasRenderingContext2D', class {})
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({data: new Uint8ClampedArray(width * height * 4)}), putImageData() {},
    }) as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,opaque')
    const size = {width: bounds.width, height: bounds.height}
    const controller = installLensOptics(lens, {role: 'lens', target: 'backdrop', size, borderRadius: 20})
    const filter = document.querySelector('filter')!, generalNodes = filter.children.length
    try {
      controller.update(.5, size, proof())
      expect(filter.dataset.opticsOpaqueBackdrop).toBe('true')
      expect(filter.children.length).toBeLessThan(generalNodes - 10)
      expect(filter.querySelectorAll('feDisplacementMap')).toHaveLength(6)
      controller.update(.8, size)
      expect(filter.dataset.opticsOpaqueBackdrop).toBe('false')
      expect(filter.children.length).toBe(generalNodes)
      controller.configure({target: 'content'})
      controller.update(.5, size, proof())
      expect(filter.dataset.opticsOpaqueBackdrop).toBe('false')
      controller.configure({role: 'lensContent', target: 'backdrop'})
      controller.update(.5, size, proof())
      expect(filter.dataset.opticsOpaqueBackdrop).toBe('false')
      expect(filter.querySelectorAll('feDisplacementMap')).toHaveLength(6)
    } finally { controller.destroy() }
  })
})
