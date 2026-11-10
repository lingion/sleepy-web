import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {installLensOptics,lensNormals, liquidGlassStyle, scaleGlassStyle, standardGlassStyle, sampleGlassOptics, renderOpticalMaps, opticalSamplingPadding, combineGlassChannels, shadeGlassSample, resolveGlassRole, type LensOpticsController, type LensOpticsOptions} from './optics'
import {cachedOpticalMaps} from './opticalMaps'

describe('FLClash raised lens regression', () => {
  it('has no invented central magnification gradient once the inset reaches halfMinor', () => {
    const data = lensNormals(80, 40, 18)
    const at = (x: number, y: number) => Array.from(data.slice((y * 80 + x) * 4, (y * 80 + x) * 4 + 2))
    expect(at(28, 19)).toEqual([128, 128])
    expect(at(51, 19)).toEqual([128, 128])
  })

  it('reads outward at the bevel of a raised lens, as negative refraction requires', () => {
    const data = lensNormals(80, 40, 18)
    expect(data[(20 * 80 + 5) * 4]).toBeLessThan(128)
    expect(data[(20 * 80 + 74) * 4]).toBeGreaterThan(128)
  })
})

describe('static material definition ownership', () => {
  const controllers: LensOpticsController[] = []
  let encodes = 0
  let resizeCallbacks: (() => void)[] = []
  beforeEach(() => {
    encodes = 0; resizeCallbacks = []
    vi.stubGlobal('CanvasRenderingContext2D', class {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (w: number, h: number) => ({data: new Uint8ClampedArray(w * h * 4)}), putImageData() {},
    }) as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;base64,shared${++encodes}`)
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resizeCallbacks.push(callback) } observe() {} disconnect() {} })
    document.documentElement.style.setProperty('--md-surface-container-highest', '#444444')
    document.documentElement.style.setProperty('--md-surface-bright', '#ffffff')
    document.documentElement.style.setProperty('--md-primary', '#123456')
  })
  afterEach(() => {
    for (const controller of controllers.splice(0)) controller.destroy()
    document.body.replaceChildren(); document.documentElement.removeAttribute('style'); delete document.documentElement.dataset.mode
    vi.restoreAllMocks(); vi.unstubAllGlobals()
  })
  const pane = (options: LensOpticsOptions = {}, tint?: string) => {
    const element = document.createElement('button'), size = {width: 48, height: 48}
    Object.defineProperties(element, {offsetWidth: {configurable: true, get: () => size.width}, offsetHeight: {configurable: true, get: () => size.height}})
    for (const corner of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] as const) element.style[corner] = '24px'
    if (tint) element.dataset.glassTint = tint
    document.body.appendChild(element)
    const controller = installLensOptics(element, {role: 'regular', ...options})
    controllers.push(controller)
    return {element, controller, size, url: () => element.style.getPropertyValue('--glass-optics-filter')}
  }
  it.each(['regular', 'tinted', 'pill', 'menu', 'alert'] as const)('shares identical %s definitions and releases only the final reference', role => {
    const first = pane({role}), initialEncodes = encodes
    const nodes = document.querySelectorAll('filter > *').length
    const others = Array.from({length: 10}, () => pane({role}))
    expect(document.querySelectorAll('filter')).toHaveLength(1)
    expect(document.querySelectorAll('filter > *')).toHaveLength(nodes)
    expect(encodes).toBe(initialEncodes)
    expect(others.every(other => other.url() === first.url())).toBe(true)
    first.controller.destroy(); first.controller.destroy()
    expect(document.querySelectorAll('filter')).toHaveLength(1)
    expect(others[0].controller.ready).toBe(true)
    others.forEach(other => other.controller.destroy())
    expect(document.querySelectorAll('filter')).toHaveLength(0)
    expect(document.querySelectorAll('body > svg')).toHaveLength(0)
  })
  it('separates exact unbucketed shape, role, dark, explicit tint and style keys', () => {
    const base = liquidGlassStyle('regular')
    const cases = [pane(), pane({size: {width: 48.1, height: 48}}), pane({size: {width: 48.2, height: 48}}),
      pane({borderRadius: 23}), pane({role: 'pill'}), pane({dark: true, style: base}),
      pane({style: {...base, refraction: 59}}), pane({samplingPadding: 100}),
      pane({}, '#123456'), pane({}, '#654321')]
    expect(new Set(cases.map(value => value.url())).size).toBe(cases.length)
    expect(document.querySelectorAll('filter')).toHaveLength(cases.length)
    expect(pane({}, '#123456').url()).toBe(cases[8].url())
  })
  it('switches configuration without mutating the old consumers and rejoins an existing definition', () => {
    const first = pane(), second = pane(), oldUrl = second.url()
    const original = document.querySelector('filter')!, markup = original.innerHTML
    first.controller.configure({borderRadius: 20})
    expect(first.url()).not.toBe(oldUrl); expect(second.url()).toBe(oldUrl)
    expect(original.innerHTML).toBe(markup)
    expect(document.querySelectorAll('filter')).toHaveLength(2)
    first.controller.configure({borderRadius: 24})
    expect(first.url()).toBe(oldUrl)
    expect(document.querySelectorAll('filter')).toHaveLength(1)
    first.controller.configure({target: 'content'})
    expect(first.element.style.getPropertyValue('--glass-content-optics-filter')).toBe(oldUrl)
    first.controller.configure({target: 'backdrop'})
    expect(first.element.style.getPropertyValue('--glass-content-optics-filter')).toBe('')
  })
  it('uses regular glass for a disabled unselected tinted action and restores its tint when enabled', async () => {
    const action = pane({role: 'tinted'}, '#6750a4')
    const enabledTint = action.element.style.getPropertyValue('--glass-style-tint')
    action.element.disabled = true
    await Promise.resolve(); await Promise.resolve()
    expect(action.element.style.getPropertyValue('--glass-style-tint')).toBe('rgba(253, 253, 253, 0.5411764705882353)')
    action.element.disabled = false
    await Promise.resolve(); await Promise.resolve()
    expect(action.element.style.getPropertyValue('--glass-style-tint')).toBe(enabledTint)
  })
  it('retains selected tint when disabled and observes accessible disabled-state changes', async () => {
    const action = pane({}, '#6750a4')
    const selectedTint = action.element.style.getPropertyValue('--glass-style-tint')
    action.element.dataset.glassSelected = 'true'
    action.element.setAttribute('aria-disabled', 'true')
    await Promise.resolve(); await Promise.resolve()
    expect(action.element.style.getPropertyValue('--glass-style-tint')).toBe(selectedTint)
    action.element.dataset.glassSelected = 'false'
    await Promise.resolve(); await Promise.resolve()
    expect(action.element.style.getPropertyValue('--glass-style-tint')).toBe('rgba(253, 253, 253, 0.5411764705882353)')
    action.element.removeAttribute('aria-disabled')
    await Promise.resolve(); await Promise.resolve()
    expect(action.element.style.getPropertyValue('--glass-style-tint')).toBe(selectedTint)
  })
  it('moves root-theme consumers together while retaining an explicitly light consumer', async () => {
    const first = pane(), second = pane(), pinned = pane({dark: false}), lightUrl = pinned.url()
    document.documentElement.dataset.mode = 'dark'
    await Promise.resolve(); await Promise.resolve()
    expect(first.url()).toBe(second.url()); expect(first.url()).not.toBe(lightUrl)
    expect(pinned.url()).toBe(lightUrl)
    expect(document.querySelectorAll('filter')).toHaveLength(2)
    document.documentElement.style.setProperty('--md-surface-container-highest', '#555555')
    const oldDarkUrl = first.url()
    await Promise.resolve(); await Promise.resolve()
    expect(first.url()).toBe(second.url()); expect(first.url()).not.toBe(oldDarkUrl)
    expect(document.querySelectorAll('filter')).toHaveLength(2)
    pinned.controller.destroy()
    expect(document.querySelectorAll('filter')).toHaveLength(1)
  })
  it.each(['lens', 'lensContent'] as const)('keeps each %s graph private during lift and resize updates', role => {
    const first = pane({role}), second = pane({role}), secondUrl = second.url()
    const id = secondUrl.match(/#([^"\)]+)/)![1], original = document.getElementById(id)!.innerHTML
    const before = encodes
    first.controller.update(.8)
    expect(encodes).toBe(before)
    expect(first.url()).not.toBe(secondUrl)
    expect(document.querySelectorAll('filter')).toHaveLength(2)
    first.size.width = 60; resizeCallbacks[0](); first.controller.update(.9)
    expect(second.url()).toBe(secondUrl)
    expect(document.getElementById(id)!.innerHTML).toBe(original)
    first.controller.destroy()
    expect(document.querySelectorAll('filter')).toHaveLength(1)
  })
  it('uses caller-measured sizes without layout reads, keeps exact SVG extents and invalidates theme state', async () => {
    const lens = pane({role: 'lens'}), size = {width: 103, height: 51}
    const computed = vi.spyOn(window, 'getComputedStyle')
    const width = vi.spyOn(lens.element, 'offsetWidth', 'get')
    const height = vi.spyOn(lens.element, 'offsetHeight', 'get')
    for (let frame = 0; frame < 10; frame++) lens.controller.update(frame / 10, size)
    expect(width).not.toHaveBeenCalled(); expect(height).not.toHaveBeenCalled(); expect(computed).not.toHaveBeenCalled()
    const filter = document.querySelector('filter')!
    expect(filter.querySelector('feImage')!.getAttribute('width')).toBe('103')
    expect(filter.querySelector('feImage')!.getAttribute('height')).toBe('51')
    expect(filter.querySelector('[result="brightened"]')).toBeNull()
    document.documentElement.dataset.mode = 'dark'
    await Promise.resolve(); await Promise.resolve()
    expect(filter.querySelector('[result="brightened"] feFuncR')!.getAttribute('slope')).toBe(String(1 + .33 * .9))
    expect(computed).toHaveBeenCalled()
  })
  it('recompiles private zero branches when explicit material configuration enables them', () => {
    const first = pane({role: 'lensContent'}), second = pane({role: 'lensContent'})
    const filters = document.querySelectorAll('filter'), firstUrl = first.url(), original = filters[1].innerHTML
    expect(filters[0].querySelector('[result="shine"]')).toBeNull()
    const base = liquidGlassStyle('lensContent')
    first.controller.configure({style: {...base, blur: 1, haze: .5, hazeBlur: 4, rim: .2, hairline: .3, endShade: .1}})
    first.controller.update(1)
    for (const result of ['shine', 'frost', 'haze', 'end-scale', 'darken']) expect(filters[0].querySelector(`[result="${result}"]`)).not.toBeNull()
    expect(filters[0].querySelector('[result="frost"]')!.getAttribute('stdDeviation')).toBe('1')
    expect(first.url()).toBe(firstUrl); expect(filters[1].innerHTML).toBe(original)
    first.controller.configure({style: base})
    expect(filters[0].querySelector('[result="shine"]')).toBeNull()
    expect(filters[0].querySelectorAll('feDisplacementMap')).toHaveLength(6)
    expect(second.controller.ready).toBe(true)
  })
  it('does not allocate definitions for zero-sized or hidden panes and acquires one when shown', async () => {
    const zero = pane({size: {width: 0, height: 48}})
    const hiddenElement = document.createElement('div'); hiddenElement.hidden = true
    Object.defineProperties(hiddenElement, {offsetWidth: {value: 48}, offsetHeight: {value: 48}})
    document.body.appendChild(hiddenElement)
    const hidden = installLensOptics(hiddenElement); controllers.push(hidden)
    expect(document.querySelectorAll('filter')).toHaveLength(0)
    expect(encodes).toBe(0); expect(zero.controller.ready).toBe(false); expect(hidden.ready).toBe(false)
    hiddenElement.hidden = false
    await Promise.resolve(); await Promise.resolve()
    expect(hidden.ready).toBe(true); expect(document.querySelectorAll('filter')).toHaveLength(1)
    zero.controller.configure({size: {width: 48, height: 48}, borderRadius: 0})
    expect(zero.controller.ready).toBe(true)
    zero.controller.configure({size: {width: 0, height: 48}})
    expect(zero.controller.ready).toBe(false)
    expect(zero.url()).toBe(''); expect(hidden.ready).toBe(true)
  })
  it('recompiles independent graphs when rim addition or refraction sign changes the algebra', () => {
    const lens = pane({role: 'lens'}), style = liquidGlassStyle('lens')
    const filter = document.querySelector('filter')!
    expect(filter.querySelector('[result="rim-gain"]')).toBeNull()
    expect(filter.querySelector('[result="axis-0-0"]')).not.toBeNull()
    lens.controller.configure({style: {...style, rimAdded: .3, refraction: 4.3}})
    expect(filter.querySelector('[result="rim-gain"]')).not.toBeNull()
    expect(filter.querySelector('[result="axis-0-0"]')).toBeNull()
    lens.controller.configure({style})
    expect(filter.querySelector('[result="rim-gain"]')).toBeNull()
    expect(filter.querySelector('[result="axis-0-0"]')).not.toBeNull()
  })
})

describe('Android 77b878fd and FLClash source style values', () => {
  const theme = {surfaceContainerHighest: [68 / 255, 85 / 255, 102 / 255, 1] as const, surfaceBright: [1, .98, .97, 1] as const, color: [.2, .4, .8, 1] as const}
  it.each([false, true])('keeps distinct regular/pill/menu/alert/tinted and lens roles, dark=%s', dark => {
    const regular = liquidGlassStyle('regular', {...theme, dark})
    expect(regular).toMatchObject({refraction: 60, bevel: 20, blur: 2.5, contrast: dark ? -.4 : .4, saturation: dark ? 2.84 : 2.08, rim: .28, rimWidth: 1.2, rimTail: .17, rimFocus: 1, rimAdded: .38, hairlineSide: .75})
    expect(regular.tint).toEqual(dark ? [...theme.surfaceContainerHighest.slice(0, 3), .62] : [253 / 255, 253 / 255, 253 / 255, 138 / 255])
    expect(liquidGlassStyle('pill', {...theme, dark})).toMatchObject({blur: 0, haze: .72, hazeBlur: 15.6, saturation: dark ? 1.925 : 2.1, rim: dark ? .35 : .6})
    expect(liquidGlassStyle('menu', {...theme, dark})).toMatchObject({blur: 12, brightness: dark ? 1.8 : 1.1, saturation: dark ? 1.75 : 2, rim: 0})
    expect(liquidGlassStyle('alert', {...theme, dark})).toEqual({...liquidGlassStyle('menu', {...theme, dark}), blur: 16})
    expect(liquidGlassStyle('tinted', {...theme, dark})).toMatchObject({tint: [.2, .4, .8, .82], saturation: 1.2, rim: dark ? .14 : .2, hairline: dark ? 0 : .34, hairlineSide: dark ? .73 : .5})
    expect(liquidGlassStyle('lens', {dark})).toMatchObject({refraction: -4.3, bevel: 5.5, dispersion: 6.5, rimBlur: 1.5, brightness: dark ? 1.33 : 1, rim: dark ? .3 : .6})
    expect(liquidGlassStyle('lensContent', {dark})).toMatchObject({refraction: 14, bevel: 11.2, dispersion: 3.6, rimBlur: 2.5, rim: 0})
  })

  it('scales the material from air, clamping overshoot and preserving bevel/haze width', () => {
    const style = liquidGlassStyle('lens', {dark: true}), half = scaleGlassStyle(style, .5)
    expect(half).toMatchObject({refraction: -2.15, bevel: 5.5, dispersion: 3.25, brightness: 1.165, rimBlur: .75, hairline: .21})
    expect(scaleGlassStyle(style, 1.08)).toEqual(style)
    expect(scaleGlassStyle(style, -1)).toMatchObject({refraction: -0, dispersion: 0, brightness: 1, hairline: 0})
    const standard = standardGlassStyle(liquidGlassStyle('pill'))
    expect(standard).toMatchObject({blur: 15.6, haze: 0, hazeBlur: 0, dispersion: 0})
  })

  it('requires actual theme colors instead of inventing a dark surface or menu surfaceBright', () => {
    expect(() => liquidGlassStyle('regular', {dark: true})).toThrow('surfaceContainerHighest')
    expect(() => liquidGlassStyle('menu')).toThrow('surfaceBright')
    expect(() => liquidGlassStyle('tinted')).toThrow('color')
  })
})

describe('source optical equations and sampling bounds', () => {
  const shape = {width: 100, height: 50, borderRadius: 25}
  it('follows the rounded-box normals and the two signed refraction profiles', () => {
    const lens = liquidGlassStyle('lens'), content = liquidGlassStyle('lensContent')
    expect(sampleGlassOptics(shape, [0, 25], lens).shift).toEqual([-0, 0])
    expect(sampleGlassOptics(shape, [5.5, 25], lens).shift[0]).toBeCloseTo(-4.3)
    expect(sampleGlassOptics(shape, [94.5, 25], lens).shift[0]).toBeCloseTo(4.3)
    expect(sampleGlassOptics(shape, [0, 25], content).shift[0]).toBe(14)
    expect(sampleGlassOptics(shape, [11.2, 25], content).shift[0]).toBe(0)
    expect(sampleGlassOptics(shape, [50, 25], lens).shift).toEqual([0, 0])
  })

  it('separates RGB only within the source 10-dp band, along normal.yx', () => {
    const style = liquidGlassStyle('lens')
    expect(sampleGlassOptics(shape, [50, 0], style).part).toEqual([-3.25, 0])
    expect(sampleGlassOptics(shape, [0, 25], style).part).toEqual([0, -1.95])
    expect(Math.hypot(...sampleGlassOptics(shape, [50, 10], style).part)).toBe(0)
    const maps = renderOpticalMaps(shape, style), i = (25 * maps.width + 50) * 4
    expect(maps.displacement[0].slice(i, i + 4)).toEqual(maps.displacement[2].slice(i, i + 4))
  })

  it('keeps the native padded reach rather than clamping the channels to the pane rectangle', () => {
    const style = liquidGlassStyle('lens')
    expect(opticalSamplingPadding(style)).toBeCloseTo(17.3)
    const maps = renderOpticalMaps(shape, style)
    expect(maps.displacement[0][(25 * maps.width) * 4 + 1]).toBeLessThan(128)
    expect(maps.displacement[2][(25 * maps.width) * 4 + 1]).toBeGreaterThan(128)
    const top = sampleGlassOptics(shape, [50, 1], style), side = sampleGlassOptics(shape, [1, 25], style)
    expect(top.shine).toBeGreaterThan(0)
    expect(side.shine).toBe(0)
  })

  it('combines independent channel alpha by maximum and leaves a transparent source transparent', () => {
    const combined = combineGlassChannels([.2, 0, 0, .3], [0, .4, 0, .7], [0, 0, .1, .2])
    expect(combined).toEqual([.2, .4, .1, .7])
    const style = liquidGlassStyle('lens'), optics = sampleGlassOptics(shape, [1, 25], style)
    expect(shadeGlassSample([0, 0, 0, 0], [0, 0, 0, 0], optics, style)).toEqual([0, 0, 0, 0])
  })

  it('reuses geometry maps inside a two-dp bucket without sharing different role optics', () => {
    const style = liquidGlassStyle('lens')
    const first = cachedOpticalMaps({...shape, width: 100.1}, style)
    expect(cachedOpticalMaps({...shape, width: 100.4}, style)).toBe(first)
    expect(cachedOpticalMaps(shape, liquidGlassStyle('lensContent'))).not.toBe(first)
  })

  it('chooses explicit role attributes and lens classes, never generic HTML semantics', () => {
    const element = document.createElement('button')
    expect(resolveGlassRole(element)).toBe('regular')
    element.className = 'glass-content-warp'; expect(resolveGlassRole(element)).toBe('lensContent')
    element.dataset.glassRole = 'pill'; expect(resolveGlassRole(element)).toBe('pill')
  })
})
