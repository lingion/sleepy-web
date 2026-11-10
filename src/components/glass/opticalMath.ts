/** GPL-3.0. Scalar port of Android 77b878fd liquid_glass.agsl (255–317, 468–649).
 * The same rounded-box, bevel, dispersion and rim equations appear in
 * FlClash-main/shaders/liquid_glass.frag. This is geometry, not a GPU shader.
 */
import type { GlassStyle, RGBA } from './styles'

export type Vec2 = readonly [number, number]
export type CornerRadii = readonly [number, number, number, number]
export interface OpticalShape {
  width: number
  height: number
  borderRadius: number | CornerRadii
  /** Optional upstream uCurves, 12 float4s, TL/TR/BR/BL. Omitted means circular edges. */
  cornerCurves?: readonly number[]
  pixelSize?: number
  samplingPadding?: number
}
export const OPTICAL_CONSTANTS = Object.freeze({
  luma: [.2126, .7152, .0722] as const,
  line: .67, lineCap: .298, cornerGap: .03, endShade: 3,
  partReach: 10, partHold: 7, rimTail: 4.5,
})
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function octantInset(point: Vec2, a: number, curve: readonly number[], center: Vec2): number {
  const dx = point[0] - center[0], dy = point[1] - center[1]
  if ((curve[1] - center[0]) * dy < (curve[2] - center[1]) * dx) return curve[3] - Math.hypot(dx, dy)
  const n = curve[0], sx = Math.max(point[0], 0) / a, sy = Math.max(point[1], 0) / a
  const major = Math.max(sx, sy, 1e-4)
  const norm = major * (1 + (Math.min(sx, sy) / major) ** n) ** (1 / n)
  const slope = Math.hypot((sx / norm) ** (n - 1), (sy / norm) ** (n - 1))
  return a * (1 - norm) / Math.max(slope, 1e-4)
}

export function roundedBoxGeometry(shape: OpticalShape, point: Vec2) {
  const { width, height } = shape
  const px = point[0] - width / 2, py = point[1] - height / 2
  const corner = py < 0 ? px < 0 ? 0 : 1 : px < 0 ? 3 : 2
  const radius = Math.max(0, Math.min(typeof shape.borderRadius === 'number' ? shape.borderRadius : shape.borderRadius[corner], width / 2, height / 2))
  const qx = Math.abs(px) - width / 2 + radius, qy = Math.abs(py) - height / 2 + radius
  const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
  const length = qx > 0 && qy > 0 ? Math.hypot(qx, qy) : 1
  const normal: Vec2 = [
    (qx > 0 && qy > 0 ? qx / length : qx > qy ? 1 : 0) * (px < 0 ? -1 : 1),
    (qx > 0 && qy > 0 ? qy / length : qx > qy ? 0 : 1) * (py < 0 ? -1 : 1),
  ]
  const inset = Math.max(-distance, 0)
  let edge = inset, edgeDistance = distance
  if (shape.cornerCurves) {
    if (shape.cornerCurves.length !== 48) throw new Error('cornerCurves requires the 48 upstream uCurves values')
    const values = shape.cornerCurves.slice(corner * 12, corner * 12 + 12)
    const c = width / 2 - height / 2, ax = Math.abs(px), ay = Math.abs(py)
    const curvedInset = values[0] < 2 ? Math.min(width / 2 - ax, height / 2 - ay)
      : ay + c >= ax
        ? octantInset([ax, ay + c], width / 2, values.slice(0, 4), [values[8], values[9]])
        : octantInset([ay, ax - c], height / 2, values.slice(4, 8), [values[10], values[11]])
    edgeDistance = -curvedInset
    edge = Math.max(curvedInset, 0)
  }
  return { distance, inset, normal, edge, edgeDistance }
}

export function sampleGlassOptics(shape: OpticalShape, point: Vec2, style: GlassStyle) {
  const geometry = roundedBoxGeometry(shape, point)
  const { inset, normal, edge } = geometry
  const halfMinor = Math.min(shape.width, shape.height) / 2
  const bevel = Math.max(Math.min(style.bevel, halfMinor * .5), 1e-3)
  const rise = 1 - clamp01(inset / bevel)
  const lens = style.refraction < 0
  const depth = lens
    ? -style.refraction * smoothstep(0, bevel, inset) * (1 - smoothstep(bevel, halfMinor, inset))
    : -Math.min(style.refraction, halfMinor) * (1 - Math.sqrt(Math.max(0, 1 - rise * rise)))
  const shift: Vec2 = [normal[0] * depth, normal[1] * depth]
  const partAmount = style.dispersion > 0 && inset < 10
    ? .5 * style.dispersion * (.6 + .4 * Math.abs(normal[1]) * Math.max(1 - inset / 7, 0)) * (1 - smoothstep(7, 10, inset)) : 0
  const part: Vec2 = [normal[1] * partAmount, normal[0] * partAmount]
  const rise2 = normal[1] ** 2, rise4 = rise2 ** 2, rise16 = rise4 ** 4
  const facing = lens ? smoothstep(.65, .95, Math.abs(normal[1]))
    : rise2 * (1 - style.rimFocus) + .5 * rise2 * Math.abs(normal[1]) * (1 + rise16) * style.rimFocus
  const band = clamp01(1 - Math.max(edge - .67, 0) / Math.max(style.rimWidth, 1e-3))
  const tail = clamp01(1 - Math.max(inset - .67, 0) / 4.5)
  const shine = Math.min(style.rim * facing * (band * (1 - style.rimTail) + tail * style.rimTail), 1)
  const endScale = 1 - style.endShade * Math.abs(normal[0]) * Math.exp(-inset / 3)
  const across = Math.abs(normal[0]) ** 3
  const darken = style.hairline * (1 - across) + (style.hairlineSide ?? style.hairline) * across
  const line = style.hairline > 0 || (style.hairlineSide ?? style.hairline) > 0
    ? clamp01((.67 - edge) / (shape.pixelSize ?? 1) + .5) : 0
  return {
    // Avoid copying and extending the geometry object for every scalar sample.
    distance: geometry.distance, inset, normal, edge, edgeDistance: geometry.edgeDistance,
    bevel, rise, shift, part, frost: style.blur + style.rimBlur * rise * rise,
    shine, endScale, line, darken,
    lightGain: 1 - (1 - style.rimAdded) * shine,
  }
}
export type OpticalSample = ReturnType<typeof sampleGlassOptics>

/** Allocation-free map sampler. The public scalar implementation above remains
 * the reference for custom curves and for checking these same equations.
 * The returned object is scratch storage, valid until the next sample call.
 */
export function createOpticalSampler(shape: OpticalShape, style: GlassStyle) {
  const halfWidth = shape.width / 2, halfHeight = shape.height / 2, halfMinor = Math.min(halfWidth, halfHeight)
  const radii = typeof shape.borderRadius === 'number' ? [shape.borderRadius, shape.borderRadius, shape.borderRadius, shape.borderRadius] : shape.borderRadius
  const radius = radii.map(value => Math.max(0, Math.min(value, halfWidth, halfHeight)))
  const bevel = Math.max(Math.min(style.bevel, halfMinor * .5), 1e-3), lens = style.refraction < 0
  const depthScale = -Math.min(style.refraction, halfMinor), rimWidth = Math.max(style.rimWidth, 1e-3)
  const hairlineSide = style.hairlineSide ?? style.hairline, hasLine = style.hairline > 0 || hairlineSide > 0
  const sample = { edgeDistance: 0, shiftX: 0, shiftY: 0, partX: 0, partY: 0, rise: 0, endScale: 1, shine: 0, darken: 0, line: 0 }
  if (shape.cornerCurves) return (x: number, y: number) => {
    const value = sampleGlassOptics(shape, [x, y], style)
    sample.edgeDistance = value.edgeDistance; sample.shiftX = value.shift[0]; sample.shiftY = value.shift[1]
    sample.partX = value.part[0]; sample.partY = value.part[1]; sample.rise = value.rise
    sample.endScale = value.endScale; sample.shine = value.shine; sample.darken = value.darken; sample.line = value.line
    return sample
  }
  return (x: number, y: number) => {
    const px = x - halfWidth, py = y - halfHeight
    const r = radius[py < 0 ? px < 0 ? 0 : 1 : px < 0 ? 3 : 2]
    const qx = Math.abs(px) - halfWidth + r, qy = Math.abs(py) - halfHeight + r
    const ax = Math.max(qx, 0), ay = Math.max(qy, 0)
    const length = ax > 0 && ay > 0 ? Math.hypot(ax, ay) : Math.max(ax, ay)
    const distance = length + Math.min(Math.max(qx, qy), 0) - r, inset = Math.max(-distance, 0)
    const nx = (qx > 0 && qy > 0 ? qx / length : qx > qy ? 1 : 0) * (px < 0 ? -1 : 1)
    const ny = (qx > 0 && qy > 0 ? qy / length : qx > qy ? 0 : 1) * (py < 0 ? -1 : 1)
    const rise = 1 - clamp01(inset / bevel)
    const depth = lens ? -style.refraction * smoothstep(0, bevel, inset) * (1 - smoothstep(bevel, halfMinor, inset))
      : depthScale * (1 - Math.sqrt(Math.max(0, 1 - rise * rise)))
    const part = style.dispersion > 0 && inset < 10
      ? .5 * style.dispersion * (.6 + .4 * Math.abs(ny) * Math.max(1 - inset / 7, 0)) * (1 - smoothstep(7, 10, inset)) : 0
    let shine = 0
    if (style.rim !== 0) {
      const rise2 = ny ** 2, rise4 = rise2 ** 2, rise16 = rise4 ** 4
      const facing = lens ? smoothstep(.65, .95, Math.abs(ny))
        : rise2 * (1 - style.rimFocus) + .5 * rise2 * Math.abs(ny) * (1 + rise16) * style.rimFocus
      const band = clamp01(1 - Math.max(inset - .67, 0) / rimWidth)
      const tail = clamp01(1 - Math.max(inset - .67, 0) / 4.5)
      shine = Math.min(style.rim * facing * (band * (1 - style.rimTail) + tail * style.rimTail), 1)
    }
    const across = Math.abs(nx) ** 3
    sample.edgeDistance = distance; sample.shiftX = nx * depth; sample.shiftY = ny * depth
    sample.partX = ny * part; sample.partY = nx * part; sample.rise = rise
    sample.endScale = style.endShade === 0 ? 1 : 1 - style.endShade * Math.abs(nx) * Math.exp(-inset / 3)
    sample.shine = shine; sample.darken = style.hairline * (1 - across) + hairlineSide * across
    sample.line = hasLine ? clamp01((.67 - inset) / (shape.pixelSize ?? 1) + .5) : 0
    return sample
  }
}

/** Inputs/outputs are premultiplied, matching the shader's texture contract. */
export function combineGlassChannels(red: RGBA, green: RGBA, blue: RGBA): RGBA {
  return [red[0], green[1], blue[2], Math.max(red[3], green[3], blue[3])]
}

const luma = (color: readonly number[]) => color[0] * .2126 + color[1] * .7152 + color[2] * .0722
export function shadeGlassSample(
  base: RGBA, under: RGBA, optics: OpticalSample, style: GlassStyle,
  behindLuma?: number,
): RGBA {
  const alpha = base[3]
  const straight = base.slice(0, 3).map(c => c / Math.max(alpha, 1e-4))
  const gray = luma(straight)
  const clash = behindLuma === undefined || style.contrast === 0 ? 0
    : clamp01((Math.sign(style.contrast) * (luma(style.tint) - behindLuma) - .3) / .5)
  const cover = style.tint[3] + (1 - style.tint[3]) * clash * Math.abs(style.contrast)
  let coverage = alpha * (1 - cover) + cover
  const color = straight.map((value, i) => {
    const saturated = (gray + (value - gray) * style.saturation) * style.brightness * optics.endScale
    let glass = saturated * alpha * (1 - cover) + style.tint[i] * cover
    glass = glass * optics.lightGain + coverage * optics.shine
    if (optics.line > 0) {
      const dark = Math.max(under[i] - .298 * under[3], .22 * under[i])
      glass = glass * (1 - optics.line) + (under[i] * (1 - optics.darken) + dark * optics.darken) * optics.line
    }
    return glass
  })
  coverage = coverage * (1 - optics.line) + under[3] * optics.line
  return [Math.max(0, Math.min(color[0], coverage)), Math.max(0, Math.min(color[1], coverage)), Math.max(0, Math.min(color[2], coverage)), coverage]
}
