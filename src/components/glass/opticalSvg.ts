import type { OpticalMaps } from './opticalMaps'
import type { GlassStyle } from './styles'

const NS = 'http://www.w3.org/2000/svg'
const alphaOnly = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
const opaque = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1'
const imageCache = new WeakMap<OpticalMaps, string[]>()
function encodedMaps(maps: OpticalMaps, indices: readonly number[]): readonly string[] {
  const urls = imageCache.get(maps) ?? []
  if (indices.every(index => urls[index])) return urls
  const canvas = document.createElement('canvas'); canvas.width = maps.width; canvas.height = maps.height
  // These are CPU-generated scalar maps, immediately read back by toDataURL.
  // Avoid a GPU-backed upload/readback round trip for every grayscale plane.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
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
  for (const index of indices) {
    if (urls[index]) continue
    const [buffer, channel] = sources[index]
    for (let i = 0; i < buffer.length; i += 4) {
      data.data[i] = data.data[i + 1] = data.data[i + 2] = buffer[i + channel]
      data.data[i + 3] = 255
    }
    ctx.putImageData(data, 0, 0)
    urls[index] = canvas.toDataURL('image/png')
  }
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
// A material's zero-valued branches stay zero throughout scaleGlassStyle.
// Dynamic graphs still retain the offset/alpha mixes needed for every lift.
// Omission of immutableStyle retains the general reference graph.
export function createOpticalSvg(filter: SVGFilterElement, immutableStyle?: GlassStyle, dynamic = !immutableStyle, opaqueBackdrop = false) {
  const split = immutableStyle?.dispersion !== 0, rimBlur = immutableStyle?.rimBlur !== 0
  const hasHaze = immutableStyle?.haze !== 0, hasBlur = immutableStyle?.blur !== 0
  const hasEnd = immutableStyle?.endShade !== 0, hasRim = immutableStyle?.rim !== 0
  const hasLine = !immutableStyle || immutableStyle.hairline !== 0 || (immutableStyle.hairlineSide ?? immutableStyle.hairline) !== 0
  const hasSaturation = immutableStyle?.saturation !== 1, hasBrightness = immutableStyle?.brightness !== 1
  const hasTint = immutableStyle?.tint[3] !== 0
  // At rimAdded=0, C * (1-shine) + shine * alpha is precisely white
  // composited atop C. This preserves alpha without re-evaluating C five times.
  const rimAtop = hasRim && immutableStyle?.rimAdded === 0
  // Nonpositive refraction has no lift-dependent halfMinor clamp. Keep its
  // byte-128 neutral correction immutable and scale the displacement itself.
  // Generated displacement bytes are 1..255, so this correction stays in
  // [0,1]; moving lift past the matrix does not change its clamping behavior.
  const linearOffsets = dynamic && !!immutableStyle && immutableStyle.refraction <= 0
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
  // Native plus has exactly the same clamped premultiplied sum as arithmetic
  // (0,1,1,0), including alpha. Keep subtraction on the reference arithmetic
  // path, but do not make the browser validate every ordinary addition.
  const composite = (a: string, b: string, k2 = 1, k3 = 1) => named('feComposite', { in: a, in2: b,
    ...(immutableStyle && k2 === 1 && k3 === 1 ? {operator: 'lighter'} : {operator: 'arithmetic', k2, k3}) })
  const blend = (a: string, b: string, mode: string) => named('feBlend', { in: a, in2: b, mode })
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
    if (linearOffsets) {
      const axes = [0, 1].map(axis => {
        const rows = Array.from({length: 4}, () => [0, 0, 0, 0, 0])
        rows[axis][0] = 255 / 254; rows[axis][4] = -1 / 254; rows[3][4] = 1
        add('feColorMatrix', { in: `map-${axis ? 'y' : 'x'}-${i}`, values: rows.flat().join(' '), result: `axis-${axis}-${i}` })
        return `axis-${axis}-${i}`
      })
      // Opaque, disjoint R/G planes: lighten equals addition without an
      // arithmetic composite. The neutral gray PNG transport stays intact.
      add('feBlend', { in: axes[0], in2: axes[1], mode: 'lighten', result: `displacement-${i}` })
      return [i, `displacement-${i}`] as const
    }
    const x = named('feColorMatrix', { in: `map-x-${i}`, values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1' })
    const y = named('feColorMatrix', { in: `map-y-${i}`, values: '0 0 0 0 0  1 0 0 0 0  0 0 0 0 0  0 0 0 0 1' })
    add(immutableStyle ? 'feBlend' : 'feComposite', { in: x, in2: y, ...(immutableStyle ? {mode: 'lighten'} : {operator: 'arithmetic', k2: 1, k3: 1}), result: `map-${i}` })
    const transfer = add('feComponentTransfer', { in: `map-${i}`, result: `displacement-${i}` })
    // Byte 128 maps to exactly 0.5, removing the half-byte central drift.
    for (const channel of ['R', 'G']) {
      const fn = document.createElementNS(NS, `feFunc${channel}`)
      fn.setAttribute('type', 'linear'); fn.setAttribute('slope', String(255 / 254)); fn.setAttribute('intercept', String(-1 / 254))
      transfer.appendChild(fn)
    }
    return [i, `displacement-${i}`] as const
  }))
  const offsetMixes = dynamic && !linearOffsets ? activeChannels.map(i => add('feComposite', { in: normalizedMaps.get(i)!, in2: normalizedMaps.get(1)!, operator: 'arithmetic', result: `offset-${i}` })) : []
  const offsetAlpha = dynamic && !linearOffsets ? add('feFlood', { 'flood-color': 'black', 'flood-opacity': 0, result: 'offset-alpha' }) : undefined
  const displacementMaps = new Map(activeChannels.map(i => [i, offsetAlpha ? composite(`offset-${i}`, 'offset-alpha') : normalizedMaps.get(i)!]))
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
  const darkNode = hasLine ? dynamicScalar('map-darken', 'darken') : undefined, undarkNode = hasLine && !opaqueBackdrop && !immutableStyle ? dynamicScalar('map-darken', 'undarken') : undefined
  const endScale = 'end-scale', shine = 'shine', darken = 'darken', undarken = 'undarken'
  const gain = hasRim && !rimAtop ? add('feColorMatrix', { in: 'map-shine', result: 'rim-gain' }) : undefined
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
    if (!rimBlur) return clear
    const blurred = mask(warp('rim-frost', channel), frostMask)
    // With both samples opaque, over gives C*(1-f) + B*f and alpha=1.
    // The general path keeps its alpha lerp for transparent glyphs/backdrops.
    return opaqueBackdrop ? mask(blurred, clear, 'over') : composite(mask(clear, frostMask, 'out'), blurred)
  }
  let rgb: string
  if (split) {
    const channels = activeChannels.map(channel => {
      const mixed = sample(channel), rows = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0])
      rows[channel][channel] = 1; rows[3][3] = 1
      return { color: named('feColorMatrix', { in: mixed, values: rows.flat().join(' ') }), alpha: opaqueBackdrop ? '' : immutableStyle
        ? named('feColorMatrix', { in: mixed, values: '0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1' }) : alpha(mixed) }
    })
    // Lighten on opaque grayscale computes max(alpha) with each input used
    // once. Alpha itself is not composited with lighten's source-over rule.
    // For disjoint color channels, screen adds premultiplied RGB exactly.
    // Its alpha is a union, still >= max(alpha), which restoreAlpha replaces.
    // Fully opaque inputs can use the simpler lighten blend for both stages.
    const join = immutableStyle ? (a: string, b: string) => blend(a, b, opaqueBackdrop ? 'lighten' : 'screen') : composite
    const joined = join(join(channels[0].color, channels[1].color), channels[2].color)
    if (opaqueBackdrop) rgb = joined
    else {
      const maxAlpha = immutableStyle
        ? scalar(named('feBlend', { in: named('feBlend', { in: channels[0].alpha, in2: channels[1].alpha, mode: 'lighten' }), in2: channels[2].alpha, mode: 'lighten' }), 0, true)
        : maximum(maximum(channels[0].alpha, channels[1].alpha), channels[2].alpha)
      rgb = restoreAlpha(joined, maxAlpha)
    }
  } else rgb = sample(1)
  const hazeMix = haze ? add('feComposite', { in: rgb, in2: warp('haze', 1), operator: 'arithmetic', result: 'haze-mix' }) : undefined
  const input = hazeMix ? 'haze-mix' : rgb
  const saturation = hasSaturation ? add('feColorMatrix', { in: input, type: 'saturate', result: 'saturated' }) : undefined
  const brightness = hasBrightness ? add('feComponentTransfer', { in: saturation ? 'saturated' : input, result: 'brightened' }) : undefined
  const brightnessChannels = brightness ? ['R', 'G', 'B'].map(channel => {
    const fn = document.createElementNS(NS, `feFunc${channel}`); fn.setAttribute('type', 'linear'); brightness.appendChild(fn); return fn
  }) : []
  const adjusted = brightness ? 'brightened' : saturation ? 'saturated' : input
  const shaded = hasEnd ? 'shaded' : adjusted
  if (hasEnd) {
    if (opaqueBackdrop) add('feBlend', {in: adjusted, in2: endScale, mode: 'multiply', result: shaded})
    // Black with alpha (1-E) atop C yields premultiplied C*E and preserves
    // C's alpha. Unlike multiply blending this also holds at transparent edges.
    else if (immutableStyle) add('feComposite', {in: endScale, in2: adjusted, operator: 'atop', result: shaded})
    else add('feComposite', {in: adjusted, in2: endScale, operator: 'arithmetic', k1: 1, result: shaded})
  }
  const tint = hasTint ? add('feFlood', { result: 'tint' }) : undefined
  const tinted = tint ? 'tinted' : shaded
  if (tint) add('feComposite', { in: 'tint', in2: shaded, operator: 'over', result: tinted })
  const litAlpha = rimAtop ? mask(shine, tinted, 'atop')
    : hasRim ? restoreAlpha(composite(multiply(tinted, 'rim-gain'), mask(shine, tinted)), alpha(tinted)) : tinted

  // Compute the upstream max(under - .298 * alpha, .22 * under) in straight
  // color, then reapply SourceAlpha. A transparent backdrop never turns black.
  let lined = litAlpha
  if (hasLine) {
    const under = opaqueBackdrop ? 'SourceGraphic' : named('feColorMatrix', { in: 'SourceGraphic', values: opaque })
    const darker = (slope: number, intercept: number) => {
      const result = `optical-${++serial}`, transfer = add('feComponentTransfer', { in: under, result })
      for (const channel of ['R', 'G', 'B']) {
        const fn = document.createElementNS(NS, `feFunc${channel}`)
        fn.setAttribute('type', 'linear'); fn.setAttribute('slope', String(slope)); fn.setAttribute('intercept', String(intercept)); transfer.appendChild(fn)
      }
      return result
    }
    const dark = named('feBlend', { in: darker(1, -.298), in2: darker(.22, 0), mode: 'lighten' })
    // D*d atop SourceGraphic gives D*d*A + C*(1-d), alpha=A. This folds
    // the straight-color lerp and SourceAlpha mask for every source alpha.
    const hairline = opaqueBackdrop ? mask(mask(dark, darken), under, 'over')
      : immutableStyle ? mask(mask(dark, darken), 'SourceGraphic', 'atop')
      : mask(composite(multiply(under, undarken), multiply(dark, darken)), 'SourceAlpha')
    lined = opaqueBackdrop ? mask(mask(hairline, lineMask), litAlpha, 'over')
      : composite(mask(litAlpha, lineMask, 'out'), mask(hairline, lineMask))
  }
  const output = add('feComposite', { in: lined, in2: shapeMask, operator: 'in', result: 'glass' })
  let uploaded: OpticalMaps | undefined

  return {
    output,
    update(maps: OpticalMaps, style: GlassStyle, width: number, height: number, base: GlassStyle = style, amount = 1) {
      const urls = uploaded === maps ? undefined : encodedMaps(maps, imageIndices)
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
      if (endNode) set(endNode, 'values', immutableStyle && !opaqueBackdrop
        ? `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${-amount} 0 0 0 ${amount}`
        : scalarMatrix(0, amount, 1 - amount))
      if (shineNode) set(shineNode, 'values', rimAtop ? `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${amount} 0 0 0 0` : scalarMatrix(0, amount, 0))
      if (darkNode) set(darkNode, 'values', immutableStyle || opaqueBackdrop ? `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${amount} 0 0 0 0` : scalarMatrix(0, amount, 0))
      if (undarkNode) set(undarkNode, 'values', scalarMatrix(0, -amount, 1))
      displacements.forEach(node => set(node, 'scale', maps.displacementScale * (linearOffsets ? amount : 1)))
      if (frost) set(frost, 'stdDeviation', style.blur)
      if (rimFrost) set(rimFrost, 'stdDeviation', style.blur + style.rimBlur)
      if (haze) set(haze, 'stdDeviation', style.hazeBlur)
      if (hazeMix) { set(hazeMix, 'k2', 1 - style.haze); set(hazeMix, 'k3', style.haze) }
      if (saturation) set(saturation, 'values', style.saturation)
      brightnessChannels.forEach(fn => set(fn, 'slope', style.brightness))
      if (tint) { set(tint, 'flood-color', `rgb(${style.tint.slice(0, 3).map(c => c * 255).join(' ')})`); set(tint, 'flood-opacity', style.tint[3]) }
      const g = -(1 - style.rimAdded) * amount
      if (gain) set(gain, 'values', `${g} 0 0 0 1  ${g} 0 0 0 1  ${g} 0 0 0 1  0 0 0 0 1`)
    },
  }
}
