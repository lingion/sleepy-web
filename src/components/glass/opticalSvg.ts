import type { OpticalMaps } from './opticalMaps'
import type { GlassStyle } from './styles'

const NS = 'http://www.w3.org/2000/svg'
const alphaOnly = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
const opaque = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1'
const imageCache = new WeakMap<OpticalMaps, readonly string[]>()
function encodedMaps(maps: OpticalMaps): readonly string[] {
  const cached = imageCache.get(maps)
  if (cached) return cached
  const canvas = document.createElement('canvas'); canvas.width = maps.width; canvas.height = maps.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable for optical maps')
  // feImage is color managed. A packed data pixel such as (255,0,107)
  // does not retain its numerical R/G/B after an sRGB -> display conversion.
  // Transport each scalar on the neutral axis, then assemble vectors in SVG.
  const sources: readonly (readonly [Uint8ClampedArray, number])[] = [
    ...maps.displacement.flatMap(buffer => [[buffer, 0], [buffer, 1]] as const),
    [maps.lighting, 0], [maps.lighting, 1], [maps.lighting, 2],
    [maps.masks, 0], [maps.masks, 1], [maps.masks, 2],
  ]
  const data = ctx.createImageData(maps.width, maps.height)
  const urls = sources.map(([buffer, channel]) => {
    for (let i = 0; i < buffer.length; i += 4) {
      data.data[i] = data.data[i + 1] = data.data[i + 2] = buffer[i + channel]
      data.data[i + 3] = 255
    }
    ctx.putImageData(data, 0, 0)
    return canvas.toDataURL('image/png')
  })
  imageCache.set(maps, urls)
  return urls
}
const set = (node: Element, name: string, value: string | number) => {
  if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value))
}

/**
 * SVG adaptation, not AGSL equivalence. Gaussian endpoints approximate the
 * spatial Vogel frost; adaptive backdrop-luma tint is left to a native shader.
 * Channel arithmetic stays premultiplied and restores max(Ra, Ga, Ba).
 */
// immutableStyle is supplied only for a static material definition. Omission
// retains the general graph, including all branches needed by moving lenses.
export function createOpticalSvg(filter: SVGFilterElement, immutableStyle?: GlassStyle) {
  const split = immutableStyle?.dispersion !== 0, rimBlur = immutableStyle?.rimBlur !== 0
  const hasHaze = immutableStyle?.haze !== 0, hasBlur = immutableStyle?.blur !== 0
  const hasEnd = immutableStyle?.endShade !== 0, hasRim = immutableStyle?.rim !== 0
  const hasLine = !immutableStyle || immutableStyle.hairline !== 0 || (immutableStyle.hairlineSide ?? immutableStyle.hairline) !== 0
  let serial = 0
  const add = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(NS, tag)
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value))
    filter.appendChild(el)
    return el
  }
  const named = (tag: string, attrs: Record<string, string | number>) => {
    const result = `optical-${++serial}`
    add(tag, { ...attrs, result })
    return result
  }
  const composite = (a: string, b: string, k2 = 1, k3 = 1) => named('feComposite', { in: a, in2: b, operator: 'arithmetic', k2, k3 })
  const alpha = (input: string) => named('feColorMatrix', { in: input, values: alphaOnly })
  const mask = (input: string, by: string, operator = 'in') => named('feComposite', { in: input, in2: by, operator })
  const multiply = (a: string, b: string) => named('feComposite', { in: a, in2: b, operator: 'arithmetic', k1: 1 })
  const maximum = (a: string, b: string) => composite(composite(a, b, 1, -1), b)
  const restoreAlpha = (input: string, coverage: string) => composite(input, composite(alpha(input), coverage, 1, -1), 1, -1)
  const imageNames = ['map-x-0', 'map-y-0', 'map-x-1', 'map-y-1', 'map-x-2', 'map-y-2', 'map-end-scale', 'map-shine', 'map-darken', 'map-shape', 'map-line', 'map-frost']
  const imageIndices = imageNames.map((_, i) => i).filter(i => i < 6 ? split || i === 2 || i === 3
    : i === 6 ? hasEnd : i === 7 ? hasRim : i === 8 || i === 10 ? hasLine : i === 11 ? rimBlur : true)
  const images = imageIndices.map(i => add('feImage', { result: imageNames[i], preserveAspectRatio: 'none', x: 0, y: 0 }))
  const activeChannels = split ? [0, 1, 2] : [1]
  const normalizedMaps = new Map(activeChannels.map(i => {
    const x = named('feColorMatrix', { in: `map-x-${i}`, values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1' })
    const y = named('feColorMatrix', { in: `map-y-${i}`, values: '0 0 0 0 0  1 0 0 0 0  0 0 0 0 0  0 0 0 0 1' })
    add('feComposite', { in: x, in2: y, operator: 'arithmetic', k2: 1, k3: 1, result: `map-${i}` })
    const transfer = add('feComponentTransfer', { in: `map-${i}`, result: `displacement-${i}` })
    // Byte 128 maps to exactly 0.5, removing the half-byte central drift.
    for (const channel of ['R', 'G']) {
      const fn = document.createElementNS(NS, `feFunc${channel}`)
      fn.setAttribute('type', 'linear'); fn.setAttribute('slope', String(255 / 254)); fn.setAttribute('intercept', String(-1 / 254))
      transfer.appendChild(fn)
    }
    return [i, `displacement-${i}`] as const
  }))
  const offsetMixes = immutableStyle ? [] : activeChannels.map(i => add('feComposite', { in: normalizedMaps.get(i)!, in2: normalizedMaps.get(1)!, operator: 'arithmetic', result: `offset-${i}` }))
  const offsetAlpha = immutableStyle ? undefined : add('feFlood', { 'flood-color': 'black', 'flood-opacity': 0, result: 'offset-alpha' })
  const displacementMaps = new Map(activeChannels.map(i => [i, immutableStyle ? normalizedMaps.get(i)! : composite(`offset-${i}`, 'offset-alpha')]))
  const scalar = (input: string, channel: number, asAlpha = false, invert = false) => {
    const rows = asAlpha ? Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]) : Array.from({ length: 4 }, (_, i) => [0, 0, 0, 0, i === 3 ? 1 : 0])
    for (const row of asAlpha ? [rows[3]] : rows.slice(0, 3)) {
      row[channel] = invert ? -1 : 1; row[4] = invert ? 1 : 0
    }
    return named('feColorMatrix', { in: input, values: rows.flat().join(' ') })
  }
  const shapeMask = scalar('map-shape', 0, true), lineMask = hasLine ? scalar('map-line', 0, true) : '', frostMask = rimBlur ? scalar('map-frost', 0, true) : ''
  const dynamicScalar = (input: string, result: string) => add('feColorMatrix', { in: input, result })
  const endNode = hasEnd ? dynamicScalar('map-end-scale', 'end-scale') : undefined
  const shineNode = hasRim ? dynamicScalar('map-shine', 'shine') : undefined
  const darkNode = hasLine ? dynamicScalar('map-darken', 'darken') : undefined, undarkNode = hasLine ? dynamicScalar('map-darken', 'undarken') : undefined
  const endScale = 'end-scale', shine = 'shine', darken = 'darken', undarken = 'undarken'
  const gain = hasRim ? add('feColorMatrix', { in: 'map-shine', result: 'rim-gain' }) : undefined
  const frost = hasBlur ? add('feGaussianBlur', { in: 'SourceGraphic', edgeMode: 'duplicate', result: 'frost' }) : undefined
  const rimFrost = rimBlur ? add('feGaussianBlur', { in: 'SourceGraphic', edgeMode: 'duplicate', result: 'rim-frost' }) : undefined
  const haze = hasHaze ? add('feGaussianBlur', { in: 'SourceGraphic', edgeMode: 'duplicate', result: 'haze' }) : undefined
  const displacements: SVGElement[] = []
  const warp = (input: string, channel: number) => {
    const result = `optical-${++serial}`
    displacements.push(add('feDisplacementMap', { in: input, in2: displacementMaps.get(channel)!, xChannelSelector: 'R', yChannelSelector: 'G', result }))
    return result
  }
  const sample = (channel: number) => {
    const clear = warp(frost ? 'frost' : 'SourceGraphic', channel)
    return rimBlur ? composite(mask(clear, frostMask, 'out'), mask(warp('rim-frost', channel), frostMask)) : clear
  }
  let rgb: string
  if (split) {
    const channels = activeChannels.map(channel => {
      const mixed = sample(channel), rows = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0])
      rows[channel][channel] = 1; rows[3][3] = 1
      return { color: named('feColorMatrix', { in: mixed, values: rows.flat().join(' ') }), alpha: alpha(mixed) }
    })
    const maxAlpha = maximum(maximum(channels[0].alpha, channels[1].alpha), channels[2].alpha)
    rgb = restoreAlpha(composite(composite(channels[0].color, channels[1].color), channels[2].color), maxAlpha)
  } else rgb = sample(1)
  const hazeMix = haze ? add('feComposite', { in: rgb, in2: warp('haze', 1), operator: 'arithmetic', result: 'haze-mix' }) : undefined
  const saturation = add('feColorMatrix', { in: hazeMix ? 'haze-mix' : rgb, type: 'saturate', result: 'saturated' })
  const brightness = add('feComponentTransfer', { in: 'saturated', result: 'brightened' })
  const brightnessChannels = ['R', 'G', 'B'].map(channel => {
    const fn = document.createElementNS(NS, `feFunc${channel}`); fn.setAttribute('type', 'linear'); brightness.appendChild(fn); return fn
  })
  const shaded = hasEnd ? 'shaded' : 'brightened'
  if (hasEnd) add('feComposite', { in: 'brightened', in2: endScale, operator: 'arithmetic', k1: 1, result: shaded })
  const tint = add('feFlood', { result: 'tint' })
  const tinted = 'tinted'
  add('feComposite', { in: 'tint', in2: shaded, operator: 'over', result: tinted })
  const litAlpha = hasRim ? restoreAlpha(composite(multiply(tinted, 'rim-gain'), mask(shine, tinted)), alpha(tinted)) : tinted

  // Compute the upstream max(under - .298 * alpha, .22 * under) in straight
  // color, then reapply SourceAlpha. A transparent backdrop never turns black.
  let lined = litAlpha
  if (hasLine) {
    const under = named('feColorMatrix', { in: 'SourceGraphic', values: opaque })
    const darker = (slope: number, intercept: number) => {
      const result = `optical-${++serial}`, transfer = add('feComponentTransfer', { in: under, result })
      for (const channel of ['R', 'G', 'B']) {
        const fn = document.createElementNS(NS, `feFunc${channel}`)
        fn.setAttribute('type', 'linear'); fn.setAttribute('slope', String(slope)); fn.setAttribute('intercept', String(intercept)); transfer.appendChild(fn)
      }
      return result
    }
    const dark = named('feBlend', { in: darker(1, -.298), in2: darker(.22, 0), mode: 'lighten' })
    const hairline = mask(composite(multiply(under, undarken), multiply(dark, darken)), 'SourceAlpha')
    lined = composite(mask(litAlpha, lineMask, 'out'), mask(hairline, lineMask))
  }
  const output = add('feComposite', { in: lined, in2: shapeMask, operator: 'in', result: 'glass' })
  let uploaded: OpticalMaps | undefined

  return {
    output,
    update(maps: OpticalMaps, style: GlassStyle, width: number, height: number, base: GlassStyle = style, amount = 1) {
      const urls = uploaded === maps ? undefined : encodedMaps(maps)
      for (let i = 0; i < images.length; i++) {
        set(images[i], 'width', width); set(images[i], 'height', height)
        if (urls) set(images[i], 'href', urls[imageIndices[i]])
      }
      uploaded = maps
      const halfMinor = Math.min(width, height) / 2
      const shiftAmount = base.refraction > 0 ? Math.min(base.refraction * amount, halfMinor) / Math.min(base.refraction, halfMinor) : amount
      offsetMixes.forEach(node => {
        set(node, 'k2', amount); set(node, 'k3', shiftAmount - amount); set(node, 'k4', .5 * (1 - shiftAmount))
      })
      if (offsetAlpha) set(offsetAlpha, 'flood-opacity', .5 * (1 - shiftAmount))
      const scalarMatrix = (channel: number, slope: number, intercept: number) => {
        const row = [0, 0, 0, 0, intercept]; row[channel] = slope
        return [...row, ...row, ...row, 0, 0, 0, 0, 1].join(' ')
      }
      if (endNode) set(endNode, 'values', scalarMatrix(0, amount, 1 - amount))
      if (shineNode) set(shineNode, 'values', scalarMatrix(0, amount, 0))
      if (darkNode) set(darkNode, 'values', scalarMatrix(0, amount, 0))
      if (undarkNode) set(undarkNode, 'values', scalarMatrix(0, -amount, 1))
      displacements.forEach(node => set(node, 'scale', maps.displacementScale))
      if (frost) set(frost, 'stdDeviation', style.blur)
      if (rimFrost) set(rimFrost, 'stdDeviation', style.blur + style.rimBlur)
      if (haze) set(haze, 'stdDeviation', style.hazeBlur)
      if (hazeMix) { set(hazeMix, 'k2', 1 - style.haze); set(hazeMix, 'k3', style.haze) }
      set(saturation, 'values', style.saturation); brightnessChannels.forEach(fn => set(fn, 'slope', style.brightness))
      set(tint, 'flood-color', `rgb(${style.tint.slice(0, 3).map(c => c * 255).join(' ')})`); set(tint, 'flood-opacity', style.tint[3])
      const g = -(1 - style.rimAdded) * amount
      if (gain) set(gain, 'values', `${g} 0 0 0 1  ${g} 0 0 0 1  ${g} 0 0 0 1  0 0 0 0 1`)
    },
  }
}
