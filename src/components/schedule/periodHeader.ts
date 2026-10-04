export type PeriodHeaderLayout = 'legacy' | 'three_line'
export type PeriodHeaderStyle = 'arabic' | 'chinese' | 'financial' | 'circled' | 'roman'

const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六']
const financial = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '拾壹', '拾贰', '拾叁', '拾肆', '拾伍', '拾陆']
const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯']

export function normalizePeriodHeaderLayout(value: unknown): PeriodHeaderLayout {
  return value === 'three_line' || value === 'horizontal' || value === 'vertical' ? 'three_line' : 'legacy'
}

export function normalizePeriodHeaderStyle(value: unknown): PeriodHeaderStyle {
  return value === 'chinese' || value === 'financial' || value === 'circled' || value === 'roman' ? value : 'arabic'
}

export function periodLabel(node: number, style: PeriodHeaderStyle): string {
  if (style === 'chinese') return chinese[node - 1] ?? String(node)
  if (style === 'financial') return financial[node - 1] ?? String(node)
  if (style === 'circled') return circled[node - 1] ?? String(node)
  if (style === 'roman') return roman(node)
  return String(node)
}

function roman(number: number): string {
  const compact = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ']
  if (number > 0 && number <= 12) return compact[number]
  if (number < 1 || number > 39) return String(number)
  let out = ''
  for (const [value, glyph] of [[10, 'Ⅹ'], [9, 'Ⅸ'], [5, 'Ⅴ'], [4, 'Ⅳ'], [1, 'Ⅰ']] as const) {
    while (number >= value) { out += glyph; number -= value }
  }
  return out
}

export function periodHeaderLabel(start: number, end: number, style: PeriodHeaderStyle, showX = false): string {
  if (start === end && showX) return `第${periodLabel(start, style)}节`
  if (start === end) return periodLabel(start, style)
  return `${periodLabel(start, style)}-${periodLabel(end, style)}${style === 'arabic' ? '节' : ''}`
}

export function periodHeaderLines(
  slot: { label: string; displayStart: string; displayEnd: string; nodeStart?: number; nodeEnd?: number },
  layout: PeriodHeaderLayout,
  style: PeriodHeaderStyle = 'arabic',
  showX = false,
): string[] {
  const parts = slot.label.split('-').map((value) => Number(value))
  const start = slot.nodeStart ?? (Number.isFinite(parts[0]) ? parts[0] : 0)
  const end = slot.nodeEnd ?? (Number.isFinite(parts[1]) ? parts[1] : start)
  const label = periodHeaderLabel(start, end, style, showX)
  return layout === 'three_line'
    ? [slot.displayStart, label, slot.displayEnd]
    : [label, `${slot.displayStart}-${slot.displayEnd}`]
}

export function clampPeriodHeaderHanging(value: number): number {
  return Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0))
}

/**
 * 表头字号自适应 — PeriodHeaderAdaptiveFont (PeriodHeaderLayoutModel.kt) 1:1。
 * 高度上限唯一驱动 (三行总高 ≈ label×2.6); 墨迹超宽时按比例回缩兜底;
 * 整列共用一个字号 — 由最宽 (最难装下) 的行决定 (用户 2026-09-29 令)。
 */
export interface AdaptiveFont {
  timeSize: number
  labelSize: number
}

export const ADAPTIVE_FONT_MAX_LABEL = 16
export const ADAPTIVE_FONT_MAX_TIME = 14
export const ADAPTIVE_FONT_MIN_LABEL = 11
export const ADAPTIVE_FONT_MIN_TIME = 10
const HEIGHT_TO_LABEL_RATIO = 2.6
const BASE_LABEL = 12

export function computeAdaptiveFont(
  cardWidth: number,
  cardHeight: number,
  inkWidth: number,
): AdaptiveFont {
  const heightCap = Math.max(cardHeight, 1) / HEIGHT_TO_LABEL_RATIO
  const labelSize = heightCap >= ADAPTIVE_FONT_MIN_LABEL
    ? Math.min(heightCap, ADAPTIVE_FONT_MAX_LABEL)
    : Math.max(heightCap, 0.1)
  const rawTime = labelSize - 1
  const timeSize = rawTime >= ADAPTIVE_FONT_MIN_TIME
    ? Math.min(rawTime, ADAPTIVE_FONT_MAX_TIME)
    : Math.max(rawTime, 0.1)
  // 墨迹闸: inkWidth 按基准字号测量, 投影到自适应字号再判溢出
  const projectedInk = inkWidth > 0 && labelSize > 0 ? inkWidth * (labelSize / BASE_LABEL) : inkWidth
  const shrink = projectedInk > cardWidth && cardWidth > 0 && projectedInk > 0
    ? cardWidth / projectedInk
    : 1
  return {
    timeSize: Math.max(timeSize * shrink, 0.1),
    labelSize: Math.max(labelSize * shrink, 0.1),
  }
}

/**
 * 列内统一字号 — forColumn 1:1: 行约束取各行最紧 (最大墨迹宽)。
 * widths = 各行 {ink} (基准字号下 时间块+标签 联合包络宽)。
 */
export function columnAdaptiveFont(cardWidth: number, cardHeight: number, inks: number[]): AdaptiveFont {
  const ink = inks.length === 0 ? 0 : Math.max(...inks)
  return computeAdaptiveFont(cardWidth, cardHeight, ink)
}

/** CSS 无文本测量 — 按字符类别估算基准 (12sp) 字号下的墨迹宽。
 *  三行表头: 时间行与标签行横向错锚, 包络 ≈ 最宽行 + 次宽行一半; 两行布局取最宽行。 */
export function estimateHeaderInk(lines: string[]): number {
  const widths = lines.map((line) => {
    let w = 0
    for (const ch of line) w += /[0-9:]/.test(ch) ? 0.58 : ch === '-' ? 0.4 : 0.9
    return w
  }).sort((a, b) => b - a)
  const envelope = widths.length >= 3 ? widths[0] + widths[1] / 2 : (widths[0] ?? 0)
  return envelope * BASE_LABEL
}
