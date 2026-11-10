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

export interface PeriodHeaderHangingPlacement {
  timeLeft: number
  labelLeft: number
  contentWidth: number
}

export interface PeriodHeaderRowMetrics {
  timeWidth: number
  labelWidth: number
}

/**
 * Positions the label against the shared time-column edge, then returns the
 * complete text envelope. This mirrors PeriodHeaderMetrics.solvePlacement.
 */
export function periodHeaderHangingPlacement(
  timeWidth: number,
  labelWidth: number,
  hanging: number,
): PeriodHeaderHangingPlacement {
  const time = Number.isFinite(timeWidth) ? Math.max(0, timeWidth) : 0
  const label = Number.isFinite(labelWidth) ? Math.max(0, labelWidth) : 0
  const u = clampPeriodHeaderHanging(hanging)
  const rawLabelLeft = -label + ((u + 1) / 2) * (time + label)
  const inkLeft = Math.min(0, rawLabelLeft)
  const inkRight = Math.max(time, rawLabelLeft + label)
  return {
    timeLeft: inkLeft === 0 ? 0 : -inkLeft,
    labelLeft: rawLabelLeft - inkLeft,
    contentWidth: inkRight - inkLeft,
  }
}

/**
 * Shares the widest row's time and label anchors across a whole time column,
 * matching Android solveColumnPlacement rather than centering each row alone.
 */
export function periodHeaderColumnPlacements(
  rows: PeriodHeaderRowMetrics[],
  hanging: number,
): PeriodHeaderHangingPlacement[] {
  if (rows.length === 0) return []
  const perRow = rows.map((row) => periodHeaderHangingPlacement(row.timeWidth, row.labelWidth, hanging))
  const baseIndex = perRow.reduce(
    (best, placement, index) => placement.contentWidth > perRow[best].contentWidth ? index : best,
    0,
  )
  const base = perRow[baseIndex]
  const baseRow = rows[baseIndex]
  const baseTimeMid = base.timeLeft + baseRow.timeWidth / 2
  const baseLabelMid = base.labelLeft + baseRow.labelWidth / 2
  return perRow.map((placement, index) => {
    const row = rows[index]
    const timeMid = placement.timeLeft + row.timeWidth / 2
    const shift = baseTimeMid - timeMid
    return {
      timeLeft: placement.timeLeft + shift,
      labelLeft: baseLabelMid - row.labelWidth / 2,
      contentWidth: base.contentWidth,
    }
  })
}

const measuredWidths = new Map<string, number>()
let textContext: CanvasRenderingContext2D | null | undefined
/** Match the actual system font and labelSmall tracking; use a deterministic SSR fallback. */
export function estimatePeriodHeaderTextWidth(text: string, size: number, weight = 500, tracking = 0.5): number {
  if (typeof document !== 'undefined' && !/jsdom/i.test(navigator.userAgent)) {
    textContext ??= document.createElement('canvas').getContext('2d')
    if (textContext) {
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
      const key = `${family}|${weight}|${size}|${tracking}|${text}`
      const cached = measuredWidths.get(key)
      if (cached !== undefined) return cached
      textContext.font = `${weight} ${size}px ${family}`
      const width = textContext.measureText(text).width + text.length * tracking
      measuredWidths.set(key,width)
      return width
    }
  }
  let width = 0
  for (const char of text) width += /[0-9:]/.test(char) ? size * 0.58 : char === '-' ? size * 0.4 : size
  return width
}

/**
 * 表头字号自适应 — PeriodHeaderAdaptiveFont (PeriodHeaderLayoutModel.kt) 1:1。
 * 高度上限唯一驱动: 渲染每行行盒高 = font × lineHeight(1.25),
 * 三行 = 2.5×timeSize + 1.25×labelSize = 3.75×labelSize − 2.5 (time=label−1 代入)。
 * → labelSize ≤ (cardHeight + 2.5) / 3.75, 三行行盒恰贴齐卡高永不重叠
 *   (安卓 v1.0.59 定稿二, ref #96 #97; 旧估算 2.6 会使三行高出卡高 ~13%)。
 * 卡高装不下 MIN 时按高度比例继续缩 — 硬钳必竖向溢出, 优先"无重叠"。
 * 墨迹超宽时按比例回缩兜底; 整列共用一个字号 — 由最宽 (最难装下) 的行决定 (定令 2026-09-29)。
 */
export interface AdaptiveFont {
  timeSize: number
  labelSize: number
}

export const ADAPTIVE_FONT_MAX_LABEL = 16
export const ADAPTIVE_FONT_MAX_TIME = 14
export const ADAPTIVE_FONT_MIN_LABEL = 11
export const ADAPTIVE_FONT_MIN_TIME = 10
const HEIGHT_TO_LABEL_RATIO = 3.75
const LINE_BOX_SPACING_CORRECTION = 2.5
const BASE_LABEL = 12

export function computeAdaptiveFont(
  cardWidth: number,
  cardHeight: number,
  inkWidth: number,
): AdaptiveFont {
  // 与安卓 PeriodHeaderLayoutModel.compute 同式: (cardHeight + 2.5) / 3.75
  const heightCap = (Math.max(cardHeight, 1) + LINE_BOX_SPACING_CORRECTION) / HEIGHT_TO_LABEL_RATIO
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

/**
 * 老式两行表头 (标签 / start-dash-end) 的 dash 共轴几何 —
 * Android legacyDashColumnPx (PeriodHeaderLayoutModel.kt v1.0.61, ref #102) 1:1。
 *   - 对齐轴 = 时间串中间 "-" 的**字形中心** (非盒左缘, 2026-10-04 设备实锤);
 *   - 整列所有行的 dash 落同一 X, 标签同轴居中 — 不再逐卡 alignItems:center;
 *   - 列宽 = 轴左最大延伸 + 轴右最大延伸 + pad×2 ("最宽的那一行, 余量也流出来")。
 */
export interface LegacyDashRowInk {
  labelPx: number
  timeLeftPx: number
  dashPx: number
  timeRightPx: number
  /** 实测行高; 0 = 未测 → 垂直解按退化估值 */
  labelHeightPx?: number
  timeHeightPx?: number
}

export interface LegacyDashPlacement {
  labelLeft: number
  timeLeft: number
}

export interface LegacyDashColumn {
  columnWidth: number
  dashCenter: number
  placements: LegacyDashPlacement[]
}

/** 网格列宽/共轴/垂直解三条链共用的行墨迹口径 — 与 legacyRowInk (安卓) 同源。 */
export const LEGACY_BASE_LABEL = 12
export const LEGACY_BASE_TIME = 11

export function legacyRowInk(
  slot: { label: string; displayStart: string; displayEnd: string; nodeStart?: number; nodeEnd?: number },
  style: PeriodHeaderStyle,
  showX: boolean,
): LegacyDashRowInk {
  const lines = periodHeaderLines(slot, 'legacy', style, showX)
  return {
    labelPx: estimatePeriodHeaderTextWidth(lines[0], LEGACY_BASE_LABEL,600),
    timeLeftPx: estimatePeriodHeaderTextWidth(slot.displayStart, LEGACY_BASE_TIME),
    dashPx: estimatePeriodHeaderTextWidth('-', LEGACY_BASE_TIME),
    timeRightPx: estimatePeriodHeaderTextWidth(slot.displayEnd, LEGACY_BASE_TIME),
  }
}

/**
 * 时间轴对齐 (ref sleepy#259): dash=连字符字形中心共轴 (默认) / center=列宽几何中心。
 * center 时轴取整列 (含 pad) 的中线, 与 Android axisX = maxWidth/2 同口径。
 */
export function legacyDashColumn(
  rows: LegacyDashRowInk[],
  pad: number,
  alignment: 'dash' | 'center' = 'dash',
): LegacyDashColumn {
  if (rows.length === 0) return { columnWidth: 0, dashCenter: 0, placements: [] }
  if(alignment==='center') {
    const columnWidth=Math.max(...rows.map(row=>Math.max(row.labelPx,row.timeLeftPx+row.dashPx+row.timeRightPx)))+2*pad
    return {columnWidth,dashCenter:columnWidth/2,placements:rows.map(row=>({labelLeft:(columnWidth-row.labelPx)/2,timeLeft:(columnWidth-row.timeLeftPx-row.dashPx-row.timeRightPx)/2}))}
  }
  const leftExtent = Math.max(...rows.map((r) => Math.max(r.labelPx / 2, r.timeLeftPx + r.dashPx / 2)))
  const rightExtent = Math.max(...rows.map((r) => Math.max(r.labelPx / 2, r.dashPx / 2 + r.timeRightPx)))
  const columnWidth = leftExtent + rightExtent + 2 * pad
  const dashCenter = pad + leftExtent
  return {
    columnWidth,
    dashCenter,
    placements: rows.map((r) => ({
      labelLeft: dashCenter - r.labelPx / 2,
      timeLeft: dashCenter - r.timeLeftPx - r.dashPx / 2,
    })),
  }
}

/**
 * 整列 union 包络垂直解 — Android legacyColumnVerticalFit (ref #102) 1:1。
 *   - 两行墨迹是一个整体矩形, 卡片对整体做垂直居中 (不是每行各自居中);
 *   - label 与 time 之间恒留 gap, 缩字不压行距; 卡不够时 gap 优先被吞, 吞完才缩字;
 *   - 垂直永不重叠: 高度不够时两行同比例缩小, 缩字优先于重叠 (minScale 钳底)。
 */
export interface LegacyVerticalFit {
  fontScale: number
  labelTop: number
  timeTop: number
}

export function legacyColumnVerticalFit(
  rows: LegacyDashRowInk[],
  cardContentHeight: number,
  minScale = 0.6,
  rowGap = 0,
): LegacyVerticalFit {
  if (rows.length === 0 || cardContentHeight <= 0) return { fontScale: 1, labelTop: 0, timeTop: 0 }
  const labelH = Math.max(...rows.map((r) => (r.labelHeightPx && r.labelHeightPx > 0 ? r.labelHeightPx : r.labelPx)))
  const timeH = Math.max(...rows.map((r) =>
    (r.timeHeightPx && r.timeHeightPx > 0 ? r.timeHeightPx : r.timeLeftPx + r.dashPx + r.timeRightPx)))
  const gap = Math.max(0, rowGap)
  const union = labelH + timeH + gap
  const slack = cardContentHeight - union
  let scale: number
  let effectiveGap: number
  if (slack >= 0) {
    scale = 1
    effectiveGap = gap
  } else if (slack > -gap) {
    // 负余量小于原 gap → 吞 gap 至剩量, 不缩字
    scale = 1
    effectiveGap = gap + slack
  } else {
    // gap 吃完仍不够 → 按 (labelH + timeH) 缩字, gap 归零
    scale = Math.min(1, Math.max(minScale, cardContentHeight / (labelH + timeH)))
    effectiveGap = 0
  }
  const top = Math.max(0, (cardContentHeight - (labelH + timeH) * scale - effectiveGap) / 2)
  return { fontScale: scale, labelTop: top, timeTop: top + labelH * scale + effectiveGap }
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

export interface PeriodHeaderOptions {
  layout: PeriodHeaderLayout
  style: PeriodHeaderStyle
  hanging: number
  showX: boolean
  hideTime?: boolean
  timeAlignment?: 'dash' | 'center'
}

export interface PeriodHeaderTextLine {
  kind: 'label' | 'time' | 'start' | 'end'
  text: string
  left: number
  top: number
  size: number
  lineHeight: number
  tracking: number
}

type HeaderSlot = Parameters<typeof periodHeaderLines>[0]

/**
 * Fit the whole column using the actual rendered font, tracking and content box.
 * Android's three-line order, hanging anchors, dash axis and union centering are
 * preserved. A constrained legacy range uses that same three-line arrangement
 * before falling below Android's legacy 0.6 font-scale guard. No preference changes.
 * All returned positions and sizes are final CSS pixels; apply gridScale only here.
 */
export function fitPeriodHeaderColumn(
  slots: HeaderSlot[],
  width: number,
  height: number,
  scale: number,
  options: PeriodHeaderOptions,
): PeriodHeaderTextLine[][] {
  const pad = 3 * scale
  const contentW = Math.max(0, width - 2 * pad)
  const contentH = Math.max(0, height - 2 * pad)
  const measure = (text: string, size: number, label = false) =>
    estimatePeriodHeaderTextWidth(text, size, label ? 600 : 500, 0.5 * scale)
  const labels = slots.map(slot => periodHeaderLines(slot, 'legacy', options.style, options.showX)[0])
  const hidden = options.layout === 'legacy' && options.hideTime
  const rows = slots.map((slot, i) => ({
    labelPx: measure(labels[i], 12 * scale, true),
    timeLeftPx: measure(slot.displayStart, 11 * scale),
    dashPx: measure('-', 11 * scale),
    timeRightPx: measure(slot.displayEnd, 11 * scale),
  }))
  if (!rows.length) return []
  const legacy = legacyDashColumn(rows, 0, options.timeAlignment)
  const rangeWidth = Math.max(...rows.map(row => row.timeLeftPx + row.dashPx + row.timeRightPx))
  const stacked = options.layout === 'three_line' || (!hidden && contentW < rangeWidth * 0.6)
  let lines: PeriodHeaderTextLine[][]
  let inkWidth: number
  let inkHeight: number
  const line = (kind: PeriodHeaderTextLine['kind'], text: string, left: number, top: number, size: number, lineHeight: number): PeriodHeaderTextLine =>
    ({ kind, text, left, top, size, lineHeight, tracking: 0.5 * scale })
  if (hidden) {
    inkWidth = Math.max(...rows.map(row => row.labelPx))
    inkHeight = 14 * scale
    lines = labels.map((text, i) => [line('label', text, (inkWidth - rows[i].labelPx) / 2, 0, 12 * scale, inkHeight)])
  } else if (stacked) {
    const font = computeAdaptiveFont(240, contentH / scale, 0)
    const timeSize = font.timeSize * scale
    const labelSize = font.labelSize * scale
    const metrics = slots.map((slot, i) => ({
      timeWidth: Math.max(measure(slot.displayStart, timeSize), measure(slot.displayEnd, timeSize)),
      labelWidth: measure(labels[i], labelSize, true),
    }))
    // A compact legacy column is centered, as in Android's three-line u=0.
    const placements = periodHeaderColumnPlacements(metrics, options.layout === 'three_line' ? options.hanging : 0)
    const left = Math.min(...placements.flatMap(p => [p.timeLeft, p.labelLeft]))
    inkWidth = Math.max(...placements.map((p, i) => Math.max(p.timeLeft + metrics[i].timeWidth, p.labelLeft + metrics[i].labelWidth))) - left
    const timeH = timeSize * 1.25
    const labelH = labelSize * 1.25
    inkHeight = 2 * timeH + labelH
    lines = slots.map((slot, i) => [
      line('start', slot.displayStart, placements[i].timeLeft - left, 0, timeSize, timeH),
      line('label', labels[i], placements[i].labelLeft - left, timeH, labelSize, labelH),
      line('end', slot.displayEnd, placements[i].timeLeft - left, timeH + labelH, timeSize, timeH),
    ])
  } else {
    inkWidth = legacy.columnWidth
    inkHeight = 27 * scale
    lines = slots.map((slot, i) => [
      line('label', labels[i], legacy.placements[i].labelLeft, 0, 12 * scale, 14 * scale),
      line('time', `${slot.displayStart}-${slot.displayEnd}`, legacy.placements[i].timeLeft, 14 * scale, 11 * scale, 13 * scale),
    ])
  }
  // Shrink the actual ink and tracking together, after consuming the legacy gap.
  const fit = Math.min(1, contentW / Math.max(inkWidth, 0.1), contentH / Math.max(inkHeight, 0.1))
  const gap = !hidden && !stacked ? Math.min(2 * scale, Math.max(0, contentH - inkHeight * fit)) : 0
  const x = pad + (contentW - inkWidth * fit) / 2
  const y = pad + (contentH - inkHeight * fit - gap) / 2
  return lines.map(row => row.map(text => ({
    ...text,
    left: x + text.left * fit,
    top: y + text.top * fit + (text.kind === 'time' ? gap : 0),
    size: text.size * fit,
    lineHeight: text.lineHeight * fit,
    tracking: text.tracking * fit,
  })))
}
