/**
 * GPL-3.0. Derived from Sleepy Android 77b878fd, LiquidGlassStyle.kt,
 * cross-checked against FlClash-main/lib/ui/liquid_glass.dart:79–329.
 * Lengths use logical pixels (Android dp); colors are straight sRGB, 0..1.
 */
export type RGBA = readonly [number, number, number, number]
export type GlassStyleRole = 'regular' | 'tinted' | 'pill' | 'menu' | 'alert' | 'lens' | 'lensContent'
export interface GlassTheme {
  surfaceContainerHighest?: RGBA
  surfaceBright?: RGBA
  color?: RGBA
}
export interface GlassStyle {
  tint: RGBA
  contrast: number
  blur: number
  haze: number
  hazeBlur: number
  refraction: number
  bevel: number
  saturation: number
  brightness: number
  rim: number
  rimWidth: number
  rimTail: number
  rimFocus: number
  rimAdded: number
  endShade: number
  dispersion: number
  rimBlur: number
  hairline: number
  hairlineSide: number | null
}

const transparent: RGBA = [0, 0, 0, 0]
export const GLASS_STYLE_DEFAULTS: Readonly<GlassStyle> = Object.freeze({
  tint: Object.freeze(transparent), contrast: 0, blur: 2.5, haze: 0, hazeBlur: 0,
  refraction: 60, bevel: 20, saturation: 1.5, brightness: 1,
  rim: .6, rimWidth: 1.3, rimTail: 0, rimFocus: 0, rimAdded: 0,
  endShade: 0, dispersion: 0, rimBlur: 0, hairline: 0, hairlineSide: null,
})

function withAlpha(color: RGBA | undefined, alpha: number, name: string): RGBA {
  if (!color) throw new Error(`Liquid glass requires the theme's ${name} color`)
  return [color[0], color[1], color[2], alpha]
}

export function liquidGlassStyle(role: GlassStyleRole, theme: GlassTheme & { dark?: boolean } = {}): GlassStyle {
  const dark = theme.dark ?? false
  let values: Partial<GlassStyle>
  switch (role) {
    case 'regular':
      values = {
        tint: dark ? withAlpha(theme.surfaceContainerHighest, .62, 'surfaceContainerHighest') : [253 / 255, 253 / 255, 253 / 255, 138 / 255],
        contrast: dark ? -.4 : .4, saturation: dark ? 2.84 : 2.08,
        rim: .28, rimWidth: 1.2, rimTail: .17, rimFocus: 1, rimAdded: .38,
        hairline: dark ? 0 : .25, hairlineSide: .75,
      }
      break
    case 'pill':
      values = {
        tint: dark ? withAlpha(theme.surfaceContainerHighest, .48, 'surfaceContainerHighest') : [244 / 255, 244 / 255, 244 / 255, 147 / 255],
        contrast: dark ? -.4 : .4, blur: 0, haze: .72, hazeBlur: 15.6,
        saturation: dark ? 1.925 : 2.1, rim: dark ? .35 : .6, hairline: dark ? 0 : .35,
      }
      break
    case 'menu':
    case 'alert':
      values = {
        tint: dark ? withAlpha(theme.surfaceContainerHighest, .63, 'surfaceContainerHighest') : withAlpha(theme.surfaceBright, .55, 'surfaceBright'),
        contrast: dark ? -.53 : 0, blur: role === 'alert' ? 16 : 12,
        saturation: dark ? 1.75 : 2, brightness: dark ? 1.8 : 1.1, rim: 0,
      }
      break
    case 'tinted':
      values = {
        tint: withAlpha(theme.color, .82, 'color'), saturation: 1.2,
        rim: dark ? .14 : .2, rimWidth: 1.2, rimTail: .17, rimFocus: 1, rimAdded: .38,
        hairline: dark ? 0 : .34, hairlineSide: dark ? .73 : .5,
      }
      break
    case 'lens':
      values = {
        tint: transparent, blur: 0, refraction: -4.3, bevel: 5.5, saturation: 1,
        brightness: dark ? 1.33 : 1, rim: dark ? .3 : .6, rimWidth: 1.1,
        endShade: .045, dispersion: 6.5, rimBlur: 1.5, hairline: .42,
      }
      break
    case 'lensContent':
      values = {
        tint: transparent, blur: 0, refraction: 14, bevel: 11.2, saturation: 1,
        brightness: dark ? 1.33 : 1, rim: 0, dispersion: 3.6, rimBlur: 2.5,
      }
      break
    default:
      throw new Error(`Unknown glass style: ${String(role)}`)
  }
  return { ...GLASS_STYLE_DEFAULTS, ...values }
}

export function scaleGlassStyle(style: GlassStyle, lift: number): GlassStyle {
  const t = Number.isFinite(lift) ? Math.max(0, Math.min(1, lift)) : 0
  return {
    ...style, tint: [style.tint[0], style.tint[1], style.tint[2], style.tint[3] * t],
    contrast: style.contrast * t, blur: style.blur * t, haze: style.haze * t,
    refraction: style.refraction * t, saturation: 1 + (style.saturation - 1) * t,
    brightness: 1 + (style.brightness - 1) * t, rim: style.rim * t,
    endShade: style.endShade * t, dispersion: style.dispersion * t,
    rimBlur: style.rimBlur * t, hairline: style.hairline * t,
    hairlineSide: style.hairlineSide === null ? null : style.hairlineSide * t,
  }
}

export function lerpGlassStyle(a: GlassStyle, b: GlassStyle, t: number): GlassStyle {
  const result = { ...a }
  for (const key of Object.keys(a) as (keyof GlassStyle)[]) {
    if (key === 'tint') continue
    const av = key === 'hairlineSide' ? a.hairlineSide ?? a.hairline : a[key]
    const bv = key === 'hairlineSide' ? b.hairlineSide ?? b.hairline : b[key]
    result[key] = av === bv ? av : av * (1 - t) + bv * t
  }
  result.tint = a.tint.map((channel, i) => Math.max(0, Math.min(1, channel * (1 - t) + b.tint[i] * t))) as unknown as RGBA
  return result
}

/** The upstream standard-quality fallback; never silently selected for Web. */
export function standardGlassStyle(style: GlassStyle): GlassStyle {
  return style.haze === 0 && style.dispersion === 0 ? style : {
    ...style, blur: style.haze > 0 ? style.hazeBlur : style.blur,
    haze: 0, hazeBlur: 0, dispersion: 0,
  }
}
