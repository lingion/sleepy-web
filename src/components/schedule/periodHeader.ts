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
