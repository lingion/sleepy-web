import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpticalSvg } from './opticalSvg'
import { renderOpticalMaps } from './opticalMaps'
import { liquidGlassStyle, scaleGlassStyle, type RGBA } from './styles'
import { installLensOptics } from './optics'
import {sampleGlassOptics} from './opticalMath'

const bounded = (value: number) => Math.max(0, Math.min(1, value))
const premult = (rgba: number[]) => { const alpha = bounded(rgba[3]); return rgba.slice(0, 3).map(v => Math.min(alpha, Math.max(0, v))).concat(alpha) as unknown as RGBA }
const straight = (rgba: RGBA) => rgba.slice(0, 3).map(v => rgba[3] ? v / rgba[3] : 0).concat(rgba[3])
const fromStraight = (rgba: number[]) => { const a = bounded(rgba[3]); return rgba.slice(0, 3).map(v => bounded(v) * a).concat(a) as unknown as RGBA }

/** Independent per-pixel SVG evaluation: matrices/transfers use straight RGB;
 * arithmetic compositing uses premultiplied RGB with the SVG zero defaults.
 * Blurs are identity only because these fixtures have a uniform input field.
 */
function evaluate(filter: SVGFilterElement, images: ReadonlyMap<string, RGBA>, source: RGBA) {
  const values = new Map<string, RGBA>([['SourceGraphic', source], ['SourceAlpha', [0, 0, 0, source[3]]]])
  const offsets: RGBA[] = []
  let last = source
  for (const node of Array.from(filter.children)) {
    const attr = (name: string) => node.getAttribute(name) ?? ''
    const num = (name: string, fallback = 0) => node.hasAttribute(name) ? Number(attr(name)) : fallback
    const a = values.get(attr('in')) ?? last, b = values.get(attr('in2')) ?? last
    let result: RGBA
    switch (node.tagName) {
      case 'feImage': result = images.get(attr('result'))!; break
      case 'feGaussianBlur': result = a; break
      case 'feDisplacementMap': offsets.push(b); result = a; break
      case 'feFlood': {
        const rgb = attr('flood-color').match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
        result = fromStraight([...rgb.map(v => v / 255), num('flood-opacity', 1)]); break
      }
      case 'feColorMatrix': {
        const c = straight(a)
        if (attr('type') === 'saturate') {
          const s = num('values', 1), gray = .213 * c[0] + .715 * c[1] + .072 * c[2]
          result = fromStraight(c.slice(0, 3).map(v => gray + s * (v - gray)).concat(c[3]))
        } else {
          const matrix = attr('values').trim().split(/\s+/).map(Number)
          result = fromStraight(Array.from({length: 4}, (_, row) => c.reduce((sum, value, i) => sum + value * matrix[row * 5 + i], matrix[row * 5 + 4])))
        }
        break
      }
      case 'feComponentTransfer': {
        const c = straight(a)
        for (const fn of Array.from(node.children)) {
          const channel = 'RGBA'.indexOf(fn.tagName.slice(-1))
          c[channel] = c[channel] * Number(fn.getAttribute('slope') ?? 1) + Number(fn.getAttribute('intercept') ?? 0)
        }
        result = fromStraight(c); break
      }
      case 'feComposite': {
        switch (attr('operator')) {
          case 'arithmetic': result = premult(a.map((value, i) => num('k1') * value * b[i] + num('k2') * value + num('k3') * b[i] + num('k4'))); break
          case 'in': result = a.map(v => v * b[3]) as unknown as RGBA; break
          case 'out': result = a.map(v => v * (1 - b[3])) as unknown as RGBA; break
          case 'over': result = a.map((v, i) => v + b[i] * (1 - a[3])) as unknown as RGBA; break
          default: throw new Error(`Unimplemented composite: ${attr('operator')}`)
        }
        break
      }
      case 'feBlend': result = premult(a.map((v, i) => i === 3 ? v + b[i] - v * b[i] : Math.max(v, b[i]))); break
      default: throw new Error(`Unimplemented SVG primitive: ${node.tagName}`)
    }
    if (attr('result')) values.set(attr('result'), result)
    last = result
  }
  return { color: last, values, offsets }
}

function canvasBoundary() {
  let encodes = 0
  let pixels = new Uint8ClampedArray()
  const uploaded = new Map<string, Uint8ClampedArray>()
  vi.stubGlobal('CanvasRenderingContext2D', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(data: ImageData) { pixels = data.data.slice() },
  }) as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
    const url = `data:image/png;base64,test${++encodes}`
    uploaded.set(url, pixels)
    return url
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  return Object.assign(() => encodes, {
    uploaded,
    imagesAt(filter: SVGFilterElement, index: number, convert = false) {
      return new Map(Array.from(filter.querySelectorAll('feImage')).map(image => {
        const pixel = Array.from(uploaded.get(image.getAttribute('href')!)!.slice(index, index + 4)).map(v => v / 255)
        // A neutral-preserving channel-mixing probe, not a display ICC model.
        // Packed colored data changes; neutral scalar data stays unchanged.
        const [r, g, b, a] = pixel
        const value = convert ? [.82 * r + .18 * g, .04 * r + .96 * g, .02 * r + .07 * g + .91 * b, a] : pixel
        return [image.getAttribute('result')!, value as unknown as RGBA]
      }))
    },
  })
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); document.documentElement.removeAttribute('style') })

describe('independent SVG pixel arithmetic', () => {
  it.each((['regular', 'tinted', 'menu', 'alert', 'pill'] as const).flatMap(role => [false, true].map(dark => ({role, dark}))))('specializes $role dark=$dark without changing source arithmetic', ({role, dark}) => {
    const canvas = canvasBoundary(), theme = {dark, surfaceContainerHighest: [.25, .3, .35, 1] as const, surfaceBright: [1, .98, .97, 1] as const, color: [.2, .4, .8, 1] as const}
    const style = liquidGlassStyle(role, theme), shape = {width: 48, height: 48, borderRadius: 24}
    const maps = renderOpticalMaps(shape, style)
    const full = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    const compact = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    createOpticalSvg(full).update(maps, style, 48, 48)
    createOpticalSvg(compact, style).update(maps, style, 48, 48)
    expect(compact.children.length).toBeLessThan(full.children.length / 2)
    expect(compact.querySelectorAll('feDisplacementMap')).toHaveLength(style.haze ? 2 : 1)
    expect(compact.querySelectorAll('feGaussianBlur')).toHaveLength(Number(style.blur > 0) + Number(style.haze > 0))
    expect(compact.querySelector('[result="rim-frost"]')).toBeNull()
    expect(compact.querySelector('[result="haze-mix"]') !== null).toBe(style.haze > 0)
    for (const point of [[24, 24], [24, 1], [1, 24], [8, 8], [0, 0]]) {
      const i = (point[1] * maps.width + point[0]) * 4
      for (const source of [[1, 1, 1, 1], [.3, .5, .7, 1], [.1, .2, .3, .4], [0, 0, 0, 0]] as const) {
        const reference = evaluate(full, canvas.imagesAt(full, i), source)
        const optimized = evaluate(compact, canvas.imagesAt(compact, i), source)
        reference.color.forEach((value, n) => expect(optimized.color[n], `${role} ${point} ${source}`).toBeCloseTo(value, 10))
        // The surviving single channel uses the original green offset.
        expect(optimized.offsets[0]).toEqual(reference.offsets[2])
      }
    }
  })

  it.each([0, .2, .5, .921, 1])('passes a uniform white field at lift %s without a gray body', lift => {
    const canvas = canvasBoundary()
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    const graph = createOpticalSvg(filter), base = liquidGlassStyle('lens')
    const maps = renderOpticalMaps({width: 100, height: 50, borderRadius: 25}, base)
    graph.update(maps, scaleGlassStyle(base, lift), 100, 50, base, lift)
    const i = (25 * maps.width + 50) * 4
    const images = canvas.imagesAt(filter, i)
    const evaluated = evaluate(filter, images, [1, 1, 1, 1])
    expect(evaluated.color).toEqual([1, 1, 1, 1])
    for (const offset of evaluated.offsets) {
      expect(offset[3]).toBe(1)
      expect(offset[0]).toBeCloseTo(.5, 10)
      expect(offset[1]).toBeCloseTo(.5, 10)
    }
  })

  it.each(([[243 / 255, 243 / 255, 243 / 255, 1], [244 / 255, 244 / 255, 245 / 255, 1], [.1, .2, .3, .4]] as RGBA[]).map(source => ({source})))(
    'passes the center track color $source unchanged at lift .921', ({source}) => {
      const canvas = canvasBoundary()
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter'), graph = createOpticalSvg(filter)
      const base = liquidGlassStyle('lens'), maps = renderOpticalMaps({width: 100, height: 50, borderRadius: 25}, base)
      graph.update(maps, scaleGlassStyle(base, .921), 100, 50, base, .921)
      const i = (25 * maps.width + 50) * 4
      const images = canvas.imagesAt(filter, i)
      const {color, values} = evaluate(filter, images, source)
      for (const stage of ['frost', 'rim-frost', 'haze-mix', 'saturated', 'brightened', 'glass']) {
        const pixel = values.get(stage)!
        source.forEach((channel, n) => expect(pixel[n], stage).toBeCloseTo(channel, 10))
      }
      source.forEach((channel, n) => expect(color[n]).toBeCloseTo(channel, 10))
    },
  )

  it.each(['lens', 'lensContent'] as const)('preserves zero alpha with %s on a transparent field', role => {
    const canvas = canvasBoundary()
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter'), graph = createOpticalSvg(filter)
    const base = liquidGlassStyle(role), maps = renderOpticalMaps({width: 100, height: 50, borderRadius: 25}, base)
    graph.update(maps, base, 100, 50)
    const images = canvas.imagesAt(filter, 0)
    expect(evaluate(filter, images, [0, 0, 0, 0]).color).toEqual([0, 0, 0, 0])
  })

  it.each([false, true])('keeps source edge offsets after decoded-image channel mixing: %s', convert => {
    const canvas = canvasBoundary()
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter'), graph = createOpticalSvg(filter)
    const base = liquidGlassStyle('lens'), shape = {width: 100, height: 50, borderRadius: 25}, maps = renderOpticalMaps(shape, base)
    const lift = .921, style = scaleGlassStyle(base, lift), point = [50.5, 1.5] as const
    graph.update(maps, style, 100, 50, base, lift)
    const i = (1 * maps.width + 50) * 4
    const images = canvas.imagesAt(filter, i, convert)
    const {offsets} = evaluate(filter, images, [1, 1, 1, 1]), optics = sampleGlassOptics(shape, point, style)
    for (let channel = 0; channel < 3; channel++) {
      const map = offsets[channel * 2]
      expect(map[3]).toBe(1)
      for (let axis = 0; axis < 2; axis++) {
        const actual = (map[axis] / map[3] - .5) * maps.displacementScale
        expect(actual).toBeCloseTo(optics.shift[axis] + (1 - channel) * optics.part[axis], 1)
      }
    }
  })

  it('uploads every scalar as opaque neutral gray so image color conversion cannot mix data channels', () => {
    const canvas = canvasBoundary(), filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    const graph = createOpticalSvg(filter), style = liquidGlassStyle('lens')
    graph.update(renderOpticalMaps({width: 100, height: 50, borderRadius: 25}, style), style, 100, 50)
    for (const pixels of canvas.uploaded.values()) for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i + 1], 'green must equal red').toBe(pixels[i])
      expect(pixels[i + 2], 'blue must equal red').toBe(pixels[i])
      expect(pixels[i + 3]).toBe(255)
    }
  })

  it('keeps end-scale and the white center at one after neutral-preserving image color conversion', () => {
    const canvas = canvasBoundary(), filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
    const graph = createOpticalSvg(filter), style = liquidGlassStyle('lens')
    const maps = renderOpticalMaps({width: 150, height: 65, borderRadius: 32}, style)
    graph.update(maps, style, 150, 65)
    const i = (32 * maps.width + 75) * 4
    const {color, values} = evaluate(filter, canvas.imagesAt(filter, i, true), [1, 1, 1, 1])
    expect(values.get('end-scale')).toEqual([1, 1, 1, 1])
    color.forEach(channel => expect(channel).toBeCloseTo(1, 10))
  })

  it('never creates a declared control in its resource tree and encodes no PNG on a lift-only update', async () => {
    const count = canvasBoundary(), element = document.createElement('div')
    Object.defineProperties(element, { offsetWidth: {value: 102}, offsetHeight: {value: 52} })
    element.dataset.glassRole = 'lens'; element.style.borderRadius = '26px'; document.body.appendChild(element)
    const optics = installLensOptics(element, {role: 'lens'})
    const initial = count()
    for (let n = 0; n <= 60; n++) optics.update(n / 60)
    await Promise.resolve()
    expect(document.querySelectorAll('svg [data-glass-role]')).toHaveLength(0)
    expect(document.querySelectorAll('svg filter')).toHaveLength(1)
    expect(count()).toBe(initial)
    expect(optics.ready).toBe(true)
    optics.destroy()
    expect(document.querySelector('svg filter')).toBeNull()
  })

  it('reads only the declared tint, resolves a CSS variable, and expands the sampling region', () => {
    canvasBoundary()
    const element = document.createElement('button')
    element.dataset.glassRole = 'regular'; element.dataset.glassTint = 'var(--test-accent)'
    element.style.setProperty('--test-accent', '#123456'); element.style.backgroundColor = '#ff0000'
    Object.defineProperties(element, {offsetWidth: {value: 108}, offsetHeight: {value: 48}})
    document.body.appendChild(element)
    const optics = installLensOptics(element)
    const filter = document.querySelector('filter')!
    expect(filter.dataset.opticsRole).toBe('tinted')
    expect(filter.querySelector('feFlood[result="tint"]')?.getAttribute('flood-color')).toBe('rgb(18 52 86)')
    expect(filter.querySelector('feFlood[result="tint"]')?.getAttribute('flood-opacity')).toBe('0.82')
    expect(Number(filter.getAttribute('x'))).toBeLessThan(0)
    expect(Number(filter.getAttribute('width'))).toBeGreaterThan(108)
    optics.destroy()
  })
})
