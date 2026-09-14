/**
 * 自定义主题派生引擎 — CustomSchemeDeriver.kt 1:1 (色相旋转模板法)。
 *
 * 以默认淡紫模板(THEME_PRESETS.default light/dark = Android LightScheme/DarkScheme)
 * 为结构基底:
 *  1. 有色相的模板角色 → 保留其 HSV 的 S/V 结构, 色相 H 替换为该角色族种子色相;
 *  2. primary/secondary/tertiary 三族各自同族同色相, 深浅由模板角色间明度差保证;
 *  3. 表面族(background/surface/surfaceVariant/surfaceContainer 系/onSurfaceVariant/
 *     outline/outlineVariant/onBackground/onSurface)不取种子饱和度 — 用
 *     surfaceHue + surfaceChroma(低饱和中性), 明度 V 照抄模板角色;
 *  4. error 族/scrim 是语义色, 固定照抄模板;
 *  5. onPrimary/onSecondary/onTertiary 按派生底色亮度自适应(深底白字浅底黑字)。
 */

import type { SchemeColors } from './themes'
import { THEME_PRESETS } from './themes'
import type { CustomTheme } from '../data/customThemeStore'

/** 表面 chroma 限幅上限 — 超过后表面不再"中性", 视觉变彩色背景 */
export const SURFACE_CHROMA_MAX = 48

type Rgb = [number, number, number] // 0-1

// ── 纯 HSV/RGB 转换 (Kotlin 同源, 无第三方依赖) ──

/** RGB(0-1)→HSV [h 0-360, s 0-1, v 0-1]; 无色相(s≈0)时 h=0 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.min(1, Math.max(0, Math.max(r, g, b)))
  const min = Math.min(1, Math.max(0, Math.min(r, g, b)))
  const d = max - min
  const s = max <= 0 ? 0 : d / max
  if (d < 1e-6) return [0, clamp01(s), max]
  let h: number
  if (max === r) h = 60 * (((g - b) / d) % 6)
  else if (max === g) h = 60 * ((b - r) / d + 2)
  else h = 60 * ((r - g) / d + 4)
  if (h < 0) h += 360
  return [h, clamp01(s), max]
}

/** HSV → RGB 0-255 整数 (h 0-360, s/v 0-1; 越界输入收敛后计算) */
export function hsvToRgb255(h: number, s: number, v: number): Rgb {
  const hh = normalizeHue(h)
  const ss = clamp01(s)
  const vv = clamp01(v)
  const c = vv * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = vv - c
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hh < 60) [r1, g1, b1] = [c, x, 0]
  else if (hh < 120) [r1, g1, b1] = [x, c, 0]
  else if (hh < 180) [r1, g1, b1] = [0, c, x]
  else if (hh < 240) [r1, g1, b1] = [0, x, c]
  else if (hh < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  return [
    Math.round(clamp01(r1 + m) * 255),
    Math.round(clamp01(g1 + m) * 255),
    Math.round(clamp01(b1 + m) * 255),
  ]
}

/** 色相归一化到 [0,360): 负值/超 360/NaN 均收敛 */
export function normalizeHue(h: number): number {
  if (!Number.isFinite(h)) return 0
  const m = h % 360
  return m < 0 ? m + 360 : m
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase()
}

/** HSV → "#RRGGBB" (编辑器 hexAtHue 同源) */
export function hexAtHue(hue: number, saturation: number, value: number): string {
  const [r, g, b] = hsvToRgb255(hue, saturation, value)
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

/** "#RRGGBB" / "#AARRGGBB" → RGB 0-1; 失败返回 null(容错, 不抛) */
export function parseHex(hex: string): Rgb | null {
  const s = hex.trim()
  if (s.length !== 7 && s.length !== 9) return null
  if (!s.startsWith('#')) return null
  const body = s.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(body)) return null
  const value = parseInt(body, 16)
  const rgb = body.length === 6 ? value : value & 0xffffff
  return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255]
}

function rgbOfHex(hex: string): Rgb | null {
  return parseHex(hex)
}

/** 种子 hex 的色相; 解析失败/无色相 → 模板同角色色相兜底 (hueOfSeed 同构) */
function hueOfSeed(hex: string, fallbackHex: string): number {
  const rgb = rgbOfHex(hex)
  if (rgb) {
    const [h, s] = rgbToHsv(...rgb)
    if (s >= 1e-4) return h
  }
  const fb = rgbOfHex(fallbackHex)
  if (!fb) return 0
  const [h, s] = rgbToHsv(...fb)
  return s < 0.02 ? 0 : h
}

// ── 角色派生 ──

/** 模板 hex → 保留 S/V 结构换色相; 模板本身中性(S<0.02) → 照抄(避免浮点噪声) */
function deriveChromatic(templateHex: string, seedHue: number): string {
  const rgb = rgbOfHex(templateHex)
  if (!rgb) return templateHex
  const [, s, v] = rgbToHsv(...rgb)
  if (s < 0.02) return templateHex
  return hexAtHue(seedHue, s, v)
}

/** 表面族: 模板明度 V + surfaceHue/surfaceChroma 低饱和中性 */
function deriveSurface(templateHex: string, surfaceHue: number, surfaceChroma: number): string {
  const rgb = rgbOfHex(templateHex)
  if (!rgb) return templateHex
  const [, , v] = rgbToHsv(...rgb)
  return hexAtHue(surfaceHue, clamp01(Math.min(48, Math.max(0, surfaceChroma)) / 100), v)
}

/** on* 文字色按派生底色亮度自适应: 深底白字, 浅底黑字 */
function adaptOn(derivedHex: string): string {
  const rgb = rgbOfHex(derivedHex)
  if (!rgb) return '#FFFFFF'
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
  return lum < 0.5 ? '#FFFFFF' : '#000000'
}

const SURFACE_ROLES = [
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh',
  'surfaceContainerHighest', 'outline', 'outlineVariant',
] as const

/** 派生整套 SchemeColors — CustomSchemeDeriver.derive 同构 */
export function deriveCustomScheme(theme: CustomTheme, isDark: boolean): SchemeColors {
  const template = isDark ? THEME_PRESETS.default.dark : THEME_PRESETS.default.light
  const primaryHue = hueOfSeed(theme.primary, template.primary)
  const secondaryHue = hueOfSeed(theme.secondary, template.secondary)
  const tertiaryHue = hueOfSeed(theme.tertiary, template.tertiary)
  const surfaceHue = normalizeHue(theme.surfaceHue)
  const surfaceChroma = Math.min(SURFACE_CHROMA_MAX, Math.max(0, theme.surfaceChroma))

  const derivedPrimary = deriveChromatic(template.primary, primaryHue)
  const derivedSecondary = deriveChromatic(template.secondary, secondaryHue)
  const derivedTertiary = deriveChromatic(template.tertiary, tertiaryHue)

  const out: Record<string, string> = {
    primary: derivedPrimary,
    onPrimary: adaptOn(derivedPrimary),
    primaryContainer: deriveChromatic(template.primaryContainer, primaryHue),
    onPrimaryContainer: deriveChromatic(template.onPrimaryContainer, primaryHue),

    secondary: derivedSecondary,
    onSecondary: adaptOn(derivedSecondary),
    secondaryContainer: deriveChromatic(template.secondaryContainer, secondaryHue),
    onSecondaryContainer: deriveChromatic(template.onSecondaryContainer, secondaryHue),

    tertiary: derivedTertiary,
    onTertiary: adaptOn(derivedTertiary),
    tertiaryContainer: deriveChromatic(template.tertiaryContainer, tertiaryHue),
    onTertiaryContainer: deriveChromatic(template.onTertiaryContainer, tertiaryHue),

    scrim: template.scrim,
    error: template.error,
    onError: template.onError,
    errorContainer: template.errorContainer,
    onErrorContainer: template.onErrorContainer,
  }
  for (const role of SURFACE_ROLES) {
    out[role] = deriveSurface(template[role], surfaceHue, surfaceChroma)
  }
  return out as unknown as SchemeColors
}

/** 表面倾向的预览 hex(编辑器展示用)— 浅色端 V=0.92 反推 (surfacePreviewHex 同构) */
export function surfacePreviewHex(hue: number, chroma: number): string {
  return hexAtHue(hue, Math.min(48, Math.max(0, chroma)) / 100, 0.92)
}
