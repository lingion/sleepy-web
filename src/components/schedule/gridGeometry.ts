/**
 * 网格几何 — CourseTableView.kt CardsGridView 布局常量与坐标函数 1:1
 * 全 dp, 乘 gridScale (0.7-1.3)。
 */

import type { Course } from '../../data/types'
import type { RenderSlotPlan, TimeSlot } from '../../domain/timeTable'
import { buildRenderSlotPlan, parseHM, timeToFractionalRows } from '../../domain/timeTable'

/** 布局常量 (scale=1) — CourseTableView.kt L160-165 */
export const GRID = {
  headH: 52,
  timeW: 68,
  slotH: 52,
  gapH: 4,
  gapW: 5,
} as const

export interface GridGeometry {
  scale: number
  headH: number
  timeW: number
  slotH: number
  gapH: number
  gapW: number
  rowH: number
  colW: number
  gridH: number
  /** Rows after which Android's long-break spacing adds a visual band. */
  mealBreakAfterRows: Set<number>
  mealGapExtra: number
  /** 渲染槽位方案 (标准 + 占位节次) */
  plan: RenderSlotPlan
  slots: TimeSlot[]
}

export function buildGridGeometry(
  courses: Course[],
  timeJson: string,
  dayCount: number,
  containerWidth: number,
  scale: number,
  options: { adaptiveHeight?: boolean; availableHeight?: number; autoHideEmptyEvening?: boolean; eveningStart?: string; rowScale?: number; longBreakSpacing?: boolean } = {},
): GridGeometry {
  const d = (v: number) => v * scale
  const fullPlan = buildRenderSlotPlan(courses, timeJson)
  const firstEvening = options.autoHideEmptyEvening
    ? fullPlan.slots.findIndex((slot) => parseHM(slot.start) >= parseHM(options.eveningStart || '18:00'))
    : -1
  const evening = parseHM(options.eveningStart || '18:00')
  const hasEveningCourse = options.autoHideEmptyEvening && courses.some((course) => {
    const end = course.ownTime && course.endTime
      ? parseHM(course.endTime)
      : parseHM(fullPlan.slots.find((item) => item.nodeStart === course.startNode + Math.max(1, course.step) - 1)?.end || '')
    return Number.isFinite(end) && end > evening
  })
  const plan = firstEvening >= 0 && !hasEveningCourse
    ? { slots: fullPlan.slots.slice(0, firstEvening), slotWeights: fullPlan.slotWeights?.slice(0, firstEvening) ?? null }
    : fullPlan
  const mealBreakAfterRows = options.longBreakSpacing ? detectMealBreakRows(timeJson, courses, plan.slots) : new Set<number>()
  const mealGapExtra = options.longBreakSpacing ? d(6) : 0
  const fit = options.adaptiveHeight && options.availableHeight
    ? Math.min(96, Math.max(36, (options.availableHeight - mealGapExtra * mealBreakAfterRows.size) / Math.max(1, plan.slots.reduce((sum, _, i) => sum + (plan.slotWeights?.[i] ?? 1), 0))))
    : GRID.slotH
  const rowScale = Math.min(1.8, Math.max(0.7, options.rowScale ?? 1))
  const rowH = d(fit * rowScale) + d(GRID.gapH)
  const timeW = d(GRID.timeW)
  const gapW = d(GRID.gapW)
  const colW = (containerWidth - timeW - gapW * (dayCount + 1)) / dayCount
  return {
    scale,
    headH: d(GRID.headH),
    timeW,
    slotH: d(GRID.slotH),
    gapH: d(GRID.gapH),
    gapW,
    rowH,
    colW,
    gridH: yOfRows(plan, renderSlotsSize(plan), rowH, mealBreakAfterRows, mealGapExtra),
    mealBreakAfterRows,
    mealGapExtra,
    plan,
    slots: plan.slots,
  }
}

function renderSlotsSize(plan: RenderSlotPlan): number {
  return Math.max(1, plan.slots.length)
}

function detectMealBreakRows(timeJson: string, courses: Course[], slots: TimeSlot[]): Set<number> {
  let rows: Array<{ node?: unknown; start?: unknown; end?: unknown }>
  try {
    const parsed: unknown = JSON.parse(timeJson)
    if (!Array.isArray(parsed)) return new Set()
    rows = parsed as Array<{ node?: unknown; start?: unknown; end?: unknown }>
  } catch {
    return new Set()
  }
  if (rows.length < 2 || rows.some((row) => typeof row.node !== 'number' || typeof row.start !== 'string' || typeof row.end !== 'string')) return new Set()
  const candidates: Array<{ index: number; zone: 'midday' | 'evening' }> = []
  for (let i = 0; i < rows.length - 1; i++) {
    const left = rows[i]
    const right = rows[i + 1]
    if (right.node !== (left.node as number) + 1) continue
    const leftEnd = parseHM(left.end as string)
    const rightStart = parseHM(right.start as string)
    const gapMinutes = rightStart - leftEnd
    if (gapMinutes <= 45 || gapMinutes > 240) continue
    const midpoint = leftEnd + gapMinutes / 2
    const zone = midpoint >= 630 && midpoint <= 870 ? 'midday' : midpoint >= 990 && midpoint <= 1230 ? 'evening' : null
    if (!zone) continue
    const leftNode = left.node as number
    const rightNode = right.node as number
    const crosses = courses.some((course) => {
      if (!course.ownTime && course.startNode <= leftNode && course.startNode + course.step - 1 >= rightNode) return true
      const start = course.ownTime
        ? parseHM(course.startTime)
        : parseHM(slots.find((slot) => slot.nodeStart === course.startNode)?.start ?? '')
      const endNode = course.startNode + Math.max(1, course.step) - 1
      const end = course.ownTime
        ? parseHM(course.endTime)
        : parseHM(slots.find((slot) => slot.nodeStart === endNode)?.end ?? '')
      return Number.isFinite(start) && Number.isFinite(end) && start < rightStart && end > leftEnd
    })
    if (!crosses) {
      const renderedIndex = slots.findIndex((slot) => slot.nodeEnd === leftNode)
      if (renderedIndex >= 0) candidates.push({ index: renderedIndex, zone })
    }
  }
  const selected = new Set<number>()
  for (const zone of ['midday', 'evening'] as const) {
    const match = candidates.filter((candidate) => candidate.zone === zone)
    if (match.length === 1) selected.add(match[0].index)
  }
  return selected
}


/** yOfRows(r) — 加权行坐标 → dp (CourseTableView.kt L171-178 1:1) */
export function yOfRows(plan: RenderSlotPlan, r: number, rowH: number, mealBreakAfterRows = new Set<number>(), mealGapExtra = 0): number {
  const ws = plan.slotWeights
  if (!ws) return rowH * r + [...mealBreakAfterRows].filter((row) => row + 1 <= r).length * mealGapExtra
  let acc = 0
  const full = Math.min(Math.floor(r), ws.length)
  for (let i = 0; i < full; i++) acc += ws[i]
  if (full < ws.length && r > full) acc += ws[full] * (r - full)
  return rowH * acc + [...mealBreakAfterRows].filter((row) => row + 1 <= r).length * mealGapExtra
}

/** rowHeightAt(i) */
export function rowHeightAt(plan: RenderSlotPlan, i: number, rowH: number): number {
  return rowH * (plan.slotWeights?.[i] ?? 1)
}

/** 节点 → renderSlots 下标; -1 = 数据脏不渲染 */
export function slotIndexOf(slots: TimeSlot[], node: number): number {
  return slots.findIndex((s) => s.nodeStart === node)
}

/** 非簇单卡几何 — CourseTableView.kt L335-360 1:1 */
export interface SingleCardGeom {
  x: number
  y: number
  w: number
  h: number
}

export function singleCardGeom(
  course: Course,
  geo: GridGeometry,
  dayIdx: number,
  visibleSteps: boolean
): SingleCardGeom | null {
  const nodeIdx = slotIndexOf(geo.slots, course.startNode)
  if (nodeIdx < 0) return null
  const steps = Math.max(1, Math.min(course.step, geo.slots.length - nodeIdx))
  const x = geo.timeW + geo.gapW + (geo.colW + geo.gapW) * dayIdx
  const frac = course.ownTime
    ? timeToFractionalRows(course.startTime, course.endTime, geo.slots)
    : null
  const y = frac
    ? yOfRows(geo.plan, frac[0], geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra)
    : yOfRows(geo.plan, nodeIdx, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra)
  const h = frac
    ? Math.max(yOfRows(geo.plan, frac[1], geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra) - y, geo.rowH * 0.3) - geo.gapH
    : yOfRows(geo.plan, nodeIdx + steps, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra) - y - geo.gapH
  void visibleSteps
  return { x, y, w: geo.colW, h }
}
