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
  options: { adaptiveHeight?: boolean; availableHeight?: number; autoHideEmptyEvening?: boolean; eveningStart?: string; rowScale?: number } = {},
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
  const fit = options.adaptiveHeight && options.availableHeight
    ? Math.min(96, Math.max(36, options.availableHeight / Math.max(1, plan.slots.reduce((sum, _, i) => sum + (plan.slotWeights?.[i] ?? 1), 0))))
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
    gridH: yOfRows(plan, renderSlotsSize(plan), rowH),
    plan,
    slots: plan.slots,
  }
}

function renderSlotsSize(plan: RenderSlotPlan): number {
  return Math.max(1, plan.slots.length)
}

/** yOfRows(r) — 加权行坐标 → dp (CourseTableView.kt L171-178 1:1) */
export function yOfRows(plan: RenderSlotPlan, r: number, rowH: number): number {
  const ws = plan.slotWeights
  if (!ws) return rowH * r
  let acc = 0
  const full = Math.min(Math.floor(r), ws.length)
  for (let i = 0; i < full; i++) acc += ws[i]
  if (full < ws.length && r > full) acc += ws[full] * (r - full)
  return rowH * acc
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
  const y = frac ? yOfRows(geo.plan, frac[0], geo.rowH) : yOfRows(geo.plan, nodeIdx, geo.rowH)
  const h = frac
    ? Math.max(yOfRows(geo.plan, frac[1], geo.rowH) - yOfRows(geo.plan, frac[0], geo.rowH), geo.rowH * 0.3) -
      geo.gapH
    : yOfRows(geo.plan, nodeIdx + steps, geo.rowH) - yOfRows(geo.plan, nodeIdx, geo.rowH) - geo.gapH
  void visibleSteps
  return { x, y, w: geo.colW, h }
}
