/**
 * courseDraft — Kotlin AddCourseScreen.kt 草稿层 1:1 移植
 * MeetingBlockDraft / buildCourseEntity / validateCourseDraft /
 * groupSlotsForEdit / ConflictDetailReporter (util/ConflictDetailReporter.kt)
 * 纯函数, 不碰 React — 便于 vitest 直测 (Kotlin JVM 可测同构)。
 */

import type { Course, WeekType, ColorMode } from '../data/types'
import { parseTimeSlotRows, timeToNode, maxStandardNode, effectiveCourseTime } from './timeTable'

/** 一张课时卡 (MeetingBlockDraft) — 每个上课时段独立编辑 teacher/room/note/color */
export interface MeetingBlockDraft {
  id: number
  days: number[]
  /** 标准节次 (isIrregularNode=false 时生效) */
  startNode: number
  step: number
  /** 非常规时间覆盖 (§5 同值契约: ownTime === isIrregularTime) */
  isIrregularTime: boolean
  startTime: string
  endTime: string
  /** issue#23: 非常规节次 (边缘槽位卡) */
  isIrregularNode: boolean
  selectedEdgeNode: number
  startWeek: number
  endWeek: number
  weekType: WeekType
  room: string
  teacher: string
  note: string
  color: string
  colorMode: ColorMode
  /** issue#9: NumberField 被夹紧 → 卡片错误态 */
  clamped: boolean
}

export interface ValidationIssue {
  blockId: number | null
  message: string
}

/** 卡生效起止 — MeetingBlockDraft.effectiveRange: 非常规时间用覆盖值, 否则按节次查表 */
export function blockEffectiveRange(block: MeetingBlockDraft, timeJson: string): [string, string] | null {
  if (block.isIrregularTime) return [block.startTime, block.endTime]
  const rows = parseTimeSlotRows(timeJson)
  const start = rows.find((r) => r.node === block.startNode)
  const end = rows.find((r) => r.node === block.startNode + block.step - 1)
  if (!start || !end) return null
  return [start.start, end.end]
}

/** blockRangeMinutes — §3.3 契约: [startMin, endMin) 分钟化, 用于卡间重叠检测 */
function blockRangeMinutes(block: MeetingBlockDraft, timeJson: string): [number, number] | null {
  const range = blockEffectiveRange(block, timeJson)
  if (!range) return null
  const start = parseHm(range[0])
  const end = parseHm(range[1])
  if (!start || !end) return null
  return [start, end]
}

/** parseHm → 分钟数; 失败 null */
export function parseHm(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 编辑回填分组 — groupSlotsForEdit: 周次/单双周/地点/老师 全参与 key */
export function groupSlotsForEdit(courses: Course[]): Course[][] {
  const groups = new Map<string, Course[]>()
  for (const c of courses) {
    const key = `${c.ownTime}|${c.startNode}|${c.step}|${c.startTime}|${c.endTime}|${c.startWeek}|${c.endWeek}|${c.type}|${c.room}|${c.teacher}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  return [...groups.values()]
}

/** initialMeetingBlock — 新建首卡默认 (周一 1-2 节 08:00-09:40) */
export function initialMeetingBlock(id = 1): MeetingBlockDraft {
  return {
    id,
    days: [1],
    startNode: 1,
    step: 2,
    isIrregularTime: false,
    startTime: '08:00',
    endTime: '09:40',
    isIrregularNode: false,
    selectedEdgeNode: 0,
    startWeek: 1,
    endWeek: 16,
    weekType: 0,
    room: '',
    teacher: '',
    note: '',
    color: '',
    colorMode: 0,
    clamped: false,
  }
}

/** buildCourseEntity — 草稿卡 × day → Course 草稿 (落库前)
 *  - CUSTOM 色 → block.color, AUTO → ''(渲染 hash), GROUP/空 → '#FF6750A4'
 *  - 边缘槽位卡 → startNode=槽位号, step 锁 1
 *  - ownTime 反算: 时间可解析且非边缘卡 → timeToNode 真实节点 (用户报障 2026-09-10)
 */
export function buildCourseEntity(
  tableId: number,
  groupId: string,
  courseName: string,
  block: MeetingBlockDraft,
  day: number,
  alias = '',
  timeJson = '',
): Omit<Course, 'id'> {
  let finalColor: string
  if (block.colorMode === 2) {
    finalColor = block.color.trim() === '' ? '#FF6750A4' : block.color
  } else if (block.colorMode === 1) {
    finalColor = ''
  } else {
    finalColor = block.color.trim() === '' ? '#FF6750A4' : block.color
  }
  const rawStartNode = block.isIrregularNode ? block.selectedEdgeNode : block.startNode
  const rawStep = block.isIrregularNode ? 1 : block.step
  let finalNode = rawStartNode
  let finalStep = rawStep
  if (block.isIrregularTime && !block.isIrregularNode && timeJson.trim() !== '') {
    const mapped = timeToNode(block.startTime.trim(), block.endTime.trim(), timeJson)
    if (mapped) {
      finalNode = mapped[0]
      finalStep = mapped[1]
    }
  }
  return {
    groupId,
    tableId,
    courseName,
    alias: alias.trim(),
    teacher: block.teacher.trim(),
    room: block.room.trim(),
    note: block.note.trim(),
    day,
    startNode: finalNode,
    step: finalStep,
    startWeek: block.startWeek,
    endWeek: block.endWeek,
    type: block.weekType,
    color: finalColor,
    colorMode: block.colorMode,
    isIrregularNode: block.isIrregularNode,
    isIrregularTime: block.isIrregularTime,
    ownTime: block.isIrregularTime,
    startTime: block.isIrregularTime ? block.startTime.trim() : '',
    endTime: block.isIrregularTime ? block.endTime.trim() : '',
    credit: 0,
    level: 0,
  }
}

/** validateCourseDraft — 表级+卡级校验 (Kotlin 同名函数) */
export function validateCourseDraft(
  courseName: string,
  blocks: MeetingBlockDraft[],
  startWeek: number,
  endWeek: number,
  timeJson: string,
  strs: {
    course_name_empty: string
    week_must_be_positive: string
    slot_at_least_one_day: (n: number) => string
    slot_week_order: (n: number) => string
    irregular_node_required: (n: number) => string
    slot_start_node_positive: (n: number) => string
    slot_step_positive: (n: number) => string
    slot_step_exceeds_max: (n: number, s: number, e: number, max: number) => string
    irregular_time_format: string
    irregular_time_order: string
    slot_time_overlap: (i: number, j: number, days: string) => string
    localizedDay: (d: number) => string
  },
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (courseName.trim() === '') issues.push({ blockId: null, message: strs.course_name_empty })
  if (startWeek <= 0 || endWeek <= 0) issues.push({ blockId: null, message: strs.week_must_be_positive })
  const rows = parseTimeSlotRows(timeJson)
  const maxStd = maxStandardNode(timeJson)

  blocks.forEach((block, index) => {
    if (block.days.length === 0) {
      issues.push({ blockId: block.id, message: strs.slot_at_least_one_day(index + 1) })
    }
    if (block.startWeek > block.endWeek) {
      issues.push({ blockId: block.id, message: strs.slot_week_order(index + 1) })
    }
    if (block.isIrregularNode) {
      const row = rows.find((r) => r.node === block.selectedEdgeNode && r.edgeClass !== null)
      if (!row) {
        issues.push({ blockId: block.id, message: strs.irregular_node_required(index + 1) })
      }
    } else {
      if (block.startNode < 1) {
        issues.push({ blockId: block.id, message: strs.slot_start_node_positive(index + 1) })
      }
      if (block.step <= 0) {
        issues.push({ blockId: block.id, message: strs.slot_step_positive(index + 1) })
      }
      const endNode = block.startNode + block.step - 1
      if (endNode > maxStd) {
        issues.push({ blockId: block.id, message: strs.slot_step_exceeds_max(index + 1, block.startNode, endNode, maxStd) })
      }
    }
    if (block.isIrregularTime) {
      const start = parseHm(block.startTime)
      const end = parseHm(block.endTime)
      if (start === null || end === null) {
        issues.push({ blockId: block.id, message: strs.irregular_time_format })
      } else if (start >= end) {
        issues.push({ blockId: block.id, message: strs.irregular_time_order })
      }
    }
  })

  // 卡间时间重叠 (真实分钟区间相交 + 周次相交)
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const first = blocks[i]
      const second = blocks[j]
      const overlapDays = first.days.filter((d) => second.days.includes(d))
      if (overlapDays.length === 0) continue
      const firstRange = blockRangeMinutes(first, timeJson)
      const secondRange = blockRangeMinutes(second, timeJson)
      if (!firstRange || !secondRange) continue
      if (firstRange[0] < secondRange[1] && secondRange[0] < firstRange[1]) {
        if (!weekRangesOverlap(first.startWeek, first.endWeek, first.weekType, second.startWeek, second.endWeek, second.weekType)) continue
        const dayText = overlapDays.sort((a, b) => a - b).map(strs.localizedDay).join(' / ')
        issues.push({ blockId: second.id, message: strs.slot_time_overlap(i + 1, j + 1, dayText) })
      }
    }
  }
  return issues
}

/** weekRangesOverlap — 两周次区间+奇偶限定是否有公共周 */
function weekRangesOverlap(
  s1: number, e1: number, t1: WeekType,
  s2: number, e2: number, t2: WeekType,
): boolean {
  const lo = Math.max(s1, s2)
  const hi = Math.min(e1, e2)
  if (lo > hi) return false
  for (let w = lo; w <= hi; w++) {
    const hit = (week: number, type: WeekType): boolean => {
      if (type === 1) return week % 2 === 1
      if (type === 2) return week % 2 === 0
      return true
    }
    if (hit(w, t1) && hit(w, t2)) return true
  }
  return false
}

// ── ConflictDetailReporter — util/ConflictDetailReporter.kt 1:1 ──────────

export interface ConflictDetail {
  existingName: string
  draftName: string
  day: number
  dayText: string
  nodeRangeText: string
  weekText: string
}

function normalizedForCompare(c: Course, timeJson: string): Course {
  if (!c.ownTime) return c
  const mapped = timeToNode(c.startTime, c.endTime, timeJson)
  if (!mapped) return c
  return { ...c, startNode: mapped[0], step: mapped[1] }
}

function nodesOverlap(a: Course, b: Course): boolean {
  const aEnd = a.startNode + a.step - 1
  const bEnd = b.startNode + b.step - 1
  return a.startNode <= bEnd && b.startNode <= aEnd
}

/** 真实时间区间(分钟) — ownTime 用自身起止, 常规课用节次起止; 解析失败 null */
function realIntervalOf(c: Course, timeJson: string): [number, number] | null {
  const eff = effectiveCourseTime(c.isIrregularTime || c.ownTime, c.startTime, c.endTime, c.startNode, c.step, timeJson)
  if (!eff) return null
  const s = parseHm(eff[0])
  const e = parseHm(eff[1])
  if (s === null || e === null || e <= s) return null
  return [s, e]
}

function coursesOverlap(a: Course, b: Course, timeJson: string): boolean {
  const ivA = realIntervalOf(a, timeJson)
  const ivB = realIntervalOf(b, timeJson)
  if (ivA && ivB) return ivA[0] < ivB[1] && ivB[0] < ivA[1]
  return nodesOverlap(a, b)
}

function commonWeeks(a: Course, b: Course): [number, number, number | null] | null {
  const lo = Math.max(a.startWeek, b.startWeek)
  const hi = Math.min(a.endWeek, b.endWeek)
  if (lo > hi) return null
  let first = -1
  let last = -1
  for (let w = lo; w <= hi; w++) {
    const hit = (week: number, type: WeekType): boolean => {
      if (type === 1) return week % 2 === 1
      if (type === 2) return week % 2 === 0
      return true
    }
    if (hit(w, a.type) && hit(w, b.type)) {
      if (first < 0) first = w
      last = w
    }
  }
  if (first < 0) return null
  const parity = a.type === 1 || b.type === 1 ? 1 : a.type === 2 || b.type === 2 ? 2 : null
  return [first, last, parity]
}

function nodeRangeText(draft: Course, s: Course): string {
  const lo = Math.max(draft.startNode, s.startNode)
  const hi = Math.min(draft.startNode + draft.step - 1, s.startNode + s.step - 1)
  if (lo > hi) return ''
  return lo === hi ? `${lo}` : `${lo}-${hi}`
}

function weekTextOf(first: number, last: number, parity: number | null): string {
  const range = first === last ? `${first}` : `${first}-${last}`
  const prefix = parity === 1 ? '单周 ' : parity === 2 ? '双周 ' : ''
  return `${prefix}第${range}周`
}

/** draftConflictDetails — 只报「新草稿参与的冲突」, 存量互撞不报 */
export function draftConflictDetails(
  drafts: Course[],
  stored: Course[],
  dayNames: string[],
  timeJson = '',
): ConflictDetail[] {
  if (drafts.length === 0 || stored.length === 0) return []
  const normalizedDrafts = drafts.map((d) => normalizedForCompare(d, timeJson))
  const normalizedStored = stored.map((d) => normalizedForCompare(d, timeJson))
  const out: ConflictDetail[] = []
  const byDay = new Map<number, Course[]>()
  for (const s of normalizedStored) {
    const list = byDay.get(s.day) ?? []
    list.push(s)
    byDay.set(s.day, list)
  }
  for (let idx = 0; idx < drafts.length; idx++) {
    const draft = drafts[idx]
    const nDraft = normalizedDrafts[idx]
    const candidates = byDay.get(nDraft.day) ?? []
    const hits: Array<[Course, number, number, number | null]> = []
    for (const s of candidates) {
      const weeks = commonWeeks(nDraft, s)
      if (!weeks) continue
      if (coursesOverlap(nDraft, s, timeJson)) hits.push([s, weeks[0], weeks[1], weeks[2]])
    }
    hits.sort((a, b) => a[0].startNode - b[0].startNode)
    for (const [s, w0, w1, parity] of hits) {
      out.push({
        existingName: s.courseName,
        draftName: draft.courseName,
        day: draft.day,
        dayText: dayNames[draft.day - 1] ?? '',
        nodeRangeText: nodeRangeText(nDraft, s),
        weekText: weekTextOf(w0, w1, parity),
      })
    }
  }
  return out
}

/** formatDetail — 模板拼行: %1=星期 %2=节次交集 %3=周文案 %4=存量课名 */
export function formatDetail(d: ConflictDetail, template: string): string {
  return template
    .replace('%1$s', d.dayText)
    .replace('%2$s', d.nodeRangeText)
    .replace('%3$s', d.weekText)
    .replace('%4$s', d.existingName)
}
