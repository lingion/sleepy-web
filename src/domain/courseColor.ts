/**
 * 课程底色单一事实来源 — CourseColorUtil.kt 320 行 1:1 移植
 * 三层结构: 常量层 / 纯逻辑层 / 适配层
 *
 * 决策树 (所有入口 100% 同源):
 *   ① 用户自定义颜色 (color 非空且非哨兵) → 直接返回
 *   ② colorless=true → 中性灰 (surfaceVariant)
 *   ③ 否则 → 黄金角 137.508° 基于 groupId 撒 hue, 同门课永远同色
 */

import type { Course } from '../data/types'

/** 黄金角 — 相邻 id 色差最大化 (13 门课最少差 ~27°) */
const GOLDEN_ANGLE = 137.508

/** Kotlin Float = IEEE-754 float32; fround 把每步运算钳到 float32 精度复刻 Android 端语义 */
const f32 = Math.fround

/** 哨兵色 — 标记「未设置颜色」, 与主题默认紫完全相同 */
export const SENTINEL_COLOR = '#FF6750A4'

/** 亮色模式饱和度 (柔和粉彩) */
const S_LIGHT = 0.55
/** 暗色模式饱和度 (沉稳低饱和) */
const S_DARK = 0.4
/** 亮色模式亮度 */
const L_LIGHT = 0.82
/** 暗色模式亮度 */
const L_DARK = 0.28

// ---- Java String.hashCode (Kotlin 与 JVM 一致) ------------------------

/**
 * Java/Kotlin String.hashCode — s[0]*31^(n-1) + ... + s[n-1], int 溢出回绕。
 * stableHue 依赖此函数与 Android 端产出完全一致的色相。
 */
export function javaStringHashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  }
  return h
}

// ---- 纯逻辑层 ---------------------------------------------------------

/**
 * 基于课程组 ID 计算稳定色相 (0°~360°)。种子必须是 groupId, 不是自增 id。
 * Android 端 = Kotlin Float 全程运算: ((groupId.hashCode().toLong() * 137.508f) % 360f + 360f) % 360f
 * (CourseColorUtil.kt:53-54) — toLong→float 转换、乘法、每次 %/+/− 全部按 float32 舍入。
 * 这里逐级 fround 复刻, 与 JVM float 语义位级一致 (JVM 基准锚定: 高等数学=256°, 大学英语=24°,
 * 数据结构与算法分析=216°, g1=120.90625°, math-2024=112°, phy=185°, zzz=264°, grp-7=0°)。
 */
export function stableHue(groupId: string): number {
  const base = f32(javaStringHashCode(groupId))
  const prod = f32(base * f32(GOLDEN_ANGLE))
  const m = f32(prod % 360)
  return f32(f32(m + 360) % 360)
}

/** 判定是否有用户自定义颜色: color 非空且非哨兵值 */
export function hasCustomColor(course: Course): boolean {
  return !!course.color.trim() && course.color.toUpperCase() !== SENTINEL_COLOR.toUpperCase()
}

/** BT.601 加权亮度 (0~1) — 纯函数 */
export function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb
  return 0.299 * (r / 255) + 0.587 * (g / 255) + 0.114 * (b / 255)
}

/**
 * 按背景亮度自适应文字色 (决策 D5-13):
 *   深色底 → 白; 浅色底+暗主题 → 黑; 浅色底+亮主题 → onSurface
 */
export function textColorOn(
  bg: [number, number, number],
  isDark: boolean,
  onSurface: [number, number, number]
): [number, number, number] {
  if (luminance(bg) < 0.5) return [255, 255, 255]
  if (isDark) return [0, 0, 0]
  return onSurface
}

// ---- HSL / hex 转换 ---------------------------------------------------

/** HSL → [r, g, b] 0-255 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) {
    r = c; g = x; b = 0
  } else if (h < 120) {
    r = x; g = c; b = 0
  } else if (h < 180) {
    r = 0; g = c; b = x
  } else if (h < 240) {
    r = 0; g = x; b = c
  } else if (h < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }
  const to255 = (v: number) => Math.round(Math.min(255, Math.max(0, (v + m) * 255)))
  return [to255(r), to255(g), to255(b)]
}

/** [r,g,b] → "#rrggbb" (小写, 与 Android Color.parseColor 消费端兼容) */
export function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/**
 * "#RRGGBB" / "#AARRGGBB" (Android ARGB) → [r,g,b]; 失败 null。
 * 对齐 Android Color.parseColor 行为: 不接受 3 位 #RGB (解析失败 → 调用方回落 neutralColor);
 * 8 位 alpha 段在 web CSS 渲染形态下忽略 (Android 会保留半透明, 平台渲染差异)。
 */
export function parseHex(hex: string): [number, number, number] | null {
  const s = hex.trim().replace('#', '')
  let r: number
  let g: number
  let b: number
  if (s.length === 6) {
    r = parseInt(s.slice(0, 2), 16)
    g = parseInt(s.slice(2, 4), 16)
    b = parseInt(s.slice(4, 6), 16)
  } else if (s.length === 8) {
    // Android ARGB 形态 #AARRGGBB — alpha 段忽略
    r = parseInt(s.slice(2, 4), 16)
    g = parseInt(s.slice(4, 6), 16)
    b = parseInt(s.slice(6, 8), 16)
  } else {
    return null
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return [r, g, b]
}

/** RGB → HSL (h 0-360, s 0-1, l 0-1) */
export function rgbToHsl(rgb: [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return [h, s, l]
}

// ---- 冲突卡派生色 (ConflictCard.kt 1:1) --------------------------------

/** Compose Color.lerp 等价 — sRGB 每通道线性插值, 钳 0..255 */
function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const ch = (x: number, y: number) => Math.min(255, Math.max(0, Math.round(x + (y - x) * t)))
  return [ch(a[0], b[0]), ch(a[1], b[1]), ch(a[2], b[2])]
}

/**
 * 冲突卡描边色 — 由课色自派生: 亮色压暗 / 暗色提亮,
 * 与自身填充、网格底、相邻课色都有对比 (ConflictCard.kt:133-137)。
 */
export function conflictBorderColor(base: [number, number, number]): [number, number, number] {
  return luminance(base) > 0.5 ? lerpRgb(base, [0, 0, 0], 0.35) : lerpRgb(base, [255, 255, 255], 0.45)
}

/**
 * FOLD 折角 flap 色 = 顶层课色压暗 28% (翻面朝里的物理意象),
 * 与缺角处露出的底卡色形成明度差 (ConflictCard.kt:142)。
 */
export function foldFlapColor(topColor: [number, number, number]): [number, number, number] {
  return lerpRgb(topColor, [0, 0, 0], 0.28)
}

// ---- 取色入口 ---------------------------------------------------------

/**
 * pickCourseColor — 三层决策树取色, 返回 hex。
 * @param neutralColor colorless 灰底 (surfaceVariant)
 */
export function pickCourseColor(
  course: Course,
  isDark: boolean,
  neutralColor: string,
  colorless = false
): string {
  if (hasCustomColor(course)) {
    const parsed = parseHex(course.color)
    if (parsed) return rgbToHex(parsed)
  }
  if (colorless) return neutralColor
  const hue = stableHue(course.groupId)
  const s = isDark ? S_DARK : S_LIGHT
  const l = isDark ? L_DARK : L_LIGHT
  return rgbToHex(hslToRgb(hue, s, l))
}

/**
 * pickCourseColorWithGroupRows — issue#22 三态取色入口。
 * GROUP=组色 / AUTO=按行序 golden angle 推进 / CUSTOM=用户色。
 */
export function pickCourseColorWithGroupRows(
  row: Course,
  groupRows: Course[],
  isDark: boolean,
  neutralColor: string,
  colorless = false
): string {
  switch (row.colorMode) {
    case 2: {
      // CUSTOM
      const parsed = parseHex(row.color)
      return parsed ? rgbToHex(parsed) : neutralColor
    }
    case 1: {
      // AUTO
      if (colorless) return neutralColor
      const hue = goldenAngleForRow(row, groupRows, groupSourceColorHex(groupRows))
      const s = isDark ? S_DARK : S_LIGHT
      const l = isDark ? L_DARK : L_LIGHT
      return rgbToHex(hslToRgb(hue, s, l))
    }
    default: {
      // GROUP(0) 或未知
      if (hasCustomColor(row)) {
        const parsed = parseHex(row.color)
        if (parsed) return rgbToHex(parsed)
      }
      if (colorless) return neutralColor
      const hue = stableHue(row.groupId)
      const s = isDark ? S_DARK : S_LIGHT
      const l = isDark ? L_DARK : L_LIGHT
      return rgbToHex(hslToRgb(hue, s, l))
    }
  }
}

/** 组色源 — 同 groupId 内 colorMode=GROUP 中 id 最小的行的 color */
export function groupSourceColorHex(groupRows: Course[]): string {
  const groupOnly = groupRows.filter((r) => r.colorMode === 0)
  const pool = groupOnly.length > 0 ? groupOnly : groupRows
  if (pool.length === 0) return ''
  const source = pool.reduce((a, b) => (a.id <= b.id ? a : b))
  return source.color
}

// ---- GoldenAngleColor (issue#22 AUTO 模式) ------------------------------

/**
 * 自动色 — golden angle 137.508° 在色环上按 row 序号推进, 确定性重算。
 * 不落库: 仅用 row.id + 同组行 id 顺序 + 组色源色相。
 * 与 stableHue 同理全程 fround, 复刻 Kotlin Float 语义 (GoldenAngleColor.forRow:298-304)。
 */
export function goldenAngleForRow(row: Course, groupRows: Course[], sourceHex: string): number {
  const baseHue = f32(parseHexHue(sourceHex))
  const sorted = [...groupRows].sort((a, b) => a.id - b.id)
  const idx = sorted.findIndex((r) => r.id === row.id)
  const safeIdx = idx < 0 ? 0 : idx
  const step = f32(f32(safeIdx) * f32(GOLDEN_ANGLE))
  const sum = f32(baseHue + step)
  const m = f32(sum % 360)
  return f32(f32(m + 360) % 360)
}

function parseHexHue(hex: string): number {
  if (!hex || !hex.trim()) return 0
  const parsed = parseHex(hex)
  if (!parsed) return 0
  const [h] = rgbToHsl(parsed)
  return h
}
