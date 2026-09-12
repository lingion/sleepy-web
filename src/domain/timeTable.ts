/**
 * 时间表 (timeJson) 解析与查询 — TimeTableUtils.kt 621 行 1:1 移植
 * 来源: app/src/main/java/com/lingion/sleepy/util/TimeTableUtils.kt
 */

import type { Course } from '../data/types'

/** TimeSlot — ui/component TimeSlot.kt 同构 */
export interface TimeSlot {
  label: string
  start: string // HH:mm
  end: string
  displayStart: string
  displayEnd: string
  nodeStart: number
  nodeEnd: number
  /** 渲染期合成占位节次 = true (绝不写回 timeJson) */
  isPlaceholder?: boolean
}

interface NodeTime {
  node: number
  start: string
  end: string
}

/** 边缘节次方向: 前置 (< 1) / 后置 (> maxContiguous) */
export type EdgeClass = 'before' | 'after'

/** 节次编辑行模型 — TimeSlotRow.kt 1:1 */
export interface TimeSlotRow {
  node: number
  start: string
  end: string
  edgeClass: EdgeClass | null
}

/** 渲染期槽位方案 — RenderSlotPlan 1:1 */
export interface RenderSlotPlan {
  slots: TimeSlot[]
  slotWeights: number[] | null
}

/** 占位行权重可见下限 — PLACEHOLDER_MIN_WEIGHT 0.36 */
export const PLACEHOLDER_MIN_WEIGHT = 0.36

/**
 * 默认节次时间表 (12 节 / 45-50 分钟) — DEFAULT_TIME_JSON 唯一权威默认值
 */
export const DEFAULT_TIME_JSON = JSON.stringify([
  { node: 1, start: '08:00', end: '08:45' },
  { node: 2, start: '08:55', end: '09:40' },
  { node: 3, start: '10:00', end: '10:45' },
  { node: 4, start: '10:55', end: '11:40' },
  { node: 5, start: '14:00', end: '14:45' },
  { node: 6, start: '14:55', end: '15:40' },
  { node: 7, start: '16:00', end: '16:45' },
  { node: 8, start: '16:55', end: '17:40' },
  { node: 9, start: '19:00', end: '19:45' },
  { node: 10, start: '19:55', end: '20:40' },
  { node: 11, start: '20:50', end: '21:35' },
  { node: 12, start: '21:45', end: '22:30' },
])

// ---- 内部时间工具 (替代 java.time.LocalTime) -------------------------

/** "HH:mm" → 分钟数 (自 0 点); 非法返回 NaN */
export function parseHM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return NaN
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return NaN
  return h * 60 + min
}

/** 分钟数 → "HH:mm" */
export function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function minutesBetween(a: string, b: string): number {
  return Math.max(1, parseHM(b) - parseHM(a))
}

// ---- 解析与查询 -------------------------------------------------------

/** 严格 "HH:mm" (两位小时两位分) — 等价 Android LocalTime.parse (ISO_LOCAL_TIME) 的容差 */
function isStrictHHmm(s: string): boolean {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s)
  return m !== null
}

/**
 * parseNodes — 解析 timeJson → 按 node 排序; 异常返回空。
 *
 * 1:1 对齐 TimeTableUtils.kt parseNodes (L41-56): Android 用 LocalTime.parse
 * 严格校验 HH:mm (单数字小时 "8:00" 即抛异常), 任意行非法 → 整表抛异常 →
 * emptyList()。Web 此前宽容透传原始串, 在脏数据下与 Android 行为不一致
 * (audit T17 finding #14)。
 */
export function parseNodes(timeJson: string): NodeTime[] {
  try {
    const arr = JSON.parse(timeJson)
    if (!Array.isArray(arr)) return []
    const out: NodeTime[] = []
    for (const o of arr as Array<{ node: unknown; start: unknown; end: unknown }>) {
      const start = String(o.start)
      const end = String(o.end)
      // 与 Android LocalTime.parse 等价: 任一行 HH:mm 非法即整表返 []
      if (!isStrictHHmm(start) || !isStrictHHmm(end)) return []
      out.push({ node: Number(o.node), start, end })
    }
    return out.sort((a, b) => a.node - b.node)
  } catch {
    return []
  }
}

/**
 * timeSlotsFor — timeJson → 每节独立 TimeSlot。
 *
 * displayStart/displayEnd 对齐 Android TimeTableUtils.kt L72-73:
 * 走 formatTime = "%02d:%02d" 零填充, 即使 timeJson 源串是 "8:00"
 * 也会归一为 "08:00"。
 */
export function timeSlotsFor(timeJson: string): TimeSlot[] {
  const nodes = parseNodes(timeJson)
  if (nodes.length === 0) return []
  return nodes.map((n) => ({
    label: String(n.node),
    start: n.start,
    end: n.end,
    displayStart: formatHM(parseHM(n.start)),
    displayEnd: formatHM(parseHM(n.end)),
    nodeStart: n.node,
    nodeEnd: n.node,
  }))
}

/** courseTimeString — 课程节次 → "HH:mm-HH:mm" */
export function courseTimeString(
  courseStartNode: number,
  courseStep: number,
  timeJson: string,
  ownTime = false,
  startTime = '',
  endTime = ''
): string | null {
  const parts = courseTimeParts(courseStartNode, courseStep, timeJson, ownTime, startTime, endTime)
  return parts ? `${parts[0]}-${parts[1]}` : null
}

/** courseTimeParts — 返回 (开始, 结束) 两段 */
export function courseTimeParts(
  courseStartNode: number,
  courseStep: number,
  timeJson: string,
  ownTime = false,
  startTime = '',
  endTime = ''
): [string, string] | null {
  if (ownTime && startTime.trim() && endTime.trim()) {
    return [startTime, endTime]
  }
  const nodes = parseNodes(timeJson)
  if (nodes.length === 0) return null
  const endNode = courseStartNode + courseStep - 1
  const first = nodes.find((n) => n.node === courseStartNode)
  const last = nodes.find((n) => n.node === endNode)
  if (!first || !last) return null
  return [first.start, last.end]
}

/**
 * timeToNode — ownTime 课反算等效 (startNode, step)
 * 规则 (TimeTableUtils.kt L120-139):
 * - startNode = 时间表中 start ≤ courseStart 的最大节点 (向下取)
 * - endNode   = 从 startNode 起沿节点序连续延伸的最后一节 — 课程在节次空隙内
 *   结束时停在空隙前的那一节, 绝不跨过空隙吸附到下一节
 */
export function timeToNode(startTime: string, endTime: string, timeJson: string): [number, number] | null {
  const nodes = parseNodes(timeJson)
  if (nodes.length === 0) return null
  const st = parseHM(startTime)
  const et = parseHM(endTime)
  if (isNaN(st) || isNaN(et)) return null

  let startIdx = -1
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (parseHM(nodes[i].start) <= st) {
      startIdx = i
      break
    }
  }
  const sIdx = startIdx >= 0 ? startIdx : 0
  let endIdx = sIdx
  let i = sIdx + 1
  while (i < nodes.length && parseHM(nodes[i].start) < et) {
    endIdx = i
    i++
  }

  const startNode = nodes[sIdx].node
  const endNode = nodes[endIdx].node
  if (endNode < startNode) return null
  return [startNode, endNode - startNode + 1]
}

// ---- issue#23 §5 非常规时间比例渲染 ---------------------------------

/**
 * timeToFractionalRows — 课程起止时间 → (startFrac, endFrac)
 * 1.0 = 一整行, 小数部分 = 槽位内按时间比例。
 * 落在空隙 → 归属下一行顶端; 早于首槽 → 0.0; 晚于末槽 → 槽位总数。
 * 时间不可解析/结束≤开始 → null (调用方退回 timeToNode 整格吸附)。
 */
export function timeToFractionalRows(startTime: string, endTime: string, slots: TimeSlot[]): [number, number] | null {
  if (slots.length === 0) return null
  const st = parseHM(startTime)
  const et = parseHM(endTime)
  if (isNaN(st) || isNaN(et) || et <= st) return null

  const firstStart = parseHM(slots[0].start)
  const lastEnd = parseHM(slots[slots.length - 1].end)

  function pos(t: number): number {
    if (t <= firstStart) return 0
    if (t >= lastEnd) return slots.length
    for (let i = 0; i < slots.length; i++) {
      const s = parseHM(slots[i].start)
      const e = parseHM(slots[i].end)
      if (t >= s && t <= e) {
        const dur = Math.max(1, e - s)
        return i + (t - s) / dur
      }
    }
    // 空隙: 全部归属下一行顶端
    for (let i = 0; i < slots.length; i++) {
      if (parseHM(slots[i].start) > t) return i
    }
    return slots.length
  }

  const startFrac = pos(st)
  const endFrac = pos(et)
  if (endFrac <= startFrac) return null
  return [startFrac, endFrac]
}

/** 便捷重载: 直接传 timeJson */
export function timeToFractionalRowsJson(startTime: string, endTime: string, timeJson: string): [number, number] | null {
  return timeToFractionalRows(startTime, endTime, timeSlotsFor(timeJson))
}

// ---- 渲染期占位节次合成 ---------------------------------------------

/**
 * buildRenderSlotPlan — 为当前可见课程合成渲染槽位表 (纯函数):
 *   1. 非常规课(ownTime)的结束时间终止在某节次空隙内时, 该空隙里合成一个占位节次
 *   2. 课同时占据空隙两侧节点时不合成 (常规连堂间隙)
 *   3. 无溢出 → 槽位表与 timeSlotsFor(timeJson) 完全一致
 * 占位节次 label="" 渲染层只显示时间不显示节号; 绝不写回 timeJson。
 */
export function buildRenderSlotPlan(courses: Course[], timeJson: string): RenderSlotPlan {
  const base = timeSlotsFor(timeJson)
  if (base.length === 0) return { slots: base, slotWeights: null }

  interface Gap {
    leftEnd: string
    rightStart: string
  }
  const gaps: Gap[] = []
  for (let i = 0; i < base.length - 1; i++) {
    gaps.push({ leftEnd: base[i].end, rightStart: base[i + 1].start })
  }

  const placeholderByGap = new Map<number, [string, string]>()
  for (const c of courses) {
    if (!c.ownTime) continue
    const st = c.startTime.trim()
    const et = c.endTime.trim()
    if (isNaN(parseHM(st)) || isNaN(parseHM(et))) continue
    if (parseHM(et) <= parseHM(st)) continue
    for (let gi = 0; gi < gaps.length; gi++) {
      const g = gaps[gi]
      const endL = parseHM(g.leftEnd)
      const endR = parseHM(g.rightStart)
      const e = parseHM(et)
      if (e > endL && e <= endR) {
        const lo = g.leftEnd
        const cur = placeholderByGap.get(gi)
        if (!cur) {
          placeholderByGap.set(gi, [lo, et])
        } else {
          placeholderByGap.set(gi, [
            parseHM(cur[0]) < parseHM(lo) ? cur[0] : lo,
            parseHM(cur[1]) > parseHM(et) ? cur[1] : et,
          ])
        }
      }
    }
  }
  if (placeholderByGap.size === 0) return { slots: base, slotWeights: null }

  const out: TimeSlot[] = []
  const weights: number[] = []
  for (let i = 0; i < base.length; i++) {
    const slot = base[i]
    out.push(slot)
    weights.push(1)
    const ph = placeholderByGap.get(i)
    if (ph) {
      const [lo, hi] = ph
      out.push({
        label: '',
        start: lo,
        end: hi,
        displayStart: lo,
        displayEnd: hi,
        nodeStart: slot.nodeEnd,
        nodeEnd: slot.nodeEnd,
        isPlaceholder: true,
      })
      // 占位行权重 = 自身分钟 / 左邻标准行分钟, 下限 PLACEHOLDER_MIN_WEIGHT
      weights.push(
        Math.max(
          PLACEHOLDER_MIN_WEIGHT,
          minutesBetween(lo, hi) / minutesBetween(slot.start, slot.end)
        )
      )
    }
  }
  return { slots: out, slotWeights: weights }
}

// ---- 编辑用 rows 互转 -----------------------------------------------

/** timeJson → 编辑 rows (按数组顺序) */
export function parseTimeSlotRows(timeJson: string): TimeSlotRow[] {
  try {
    const arr = JSON.parse(timeJson)
    if (!Array.isArray(arr)) throw new Error('not array')
    return arr.map((o: Record<string, unknown>, i: number) => ({
      node: typeof o.node === 'number' ? o.node : i + 1,
      start: typeof o.start === 'string' && o.start ? o.start : smartStartDefault(i + 1),
      end: typeof o.end === 'string' && o.end ? o.end : smartEndDefault(i + 1),
      edgeClass: parseEdgeClass(typeof o.edge === 'string' ? o.edge : ''),
    }))
  } catch {
    return Array.from({ length: 12 }, (_, i) => ({
      node: i + 1,
      start: smartStartDefault(i + 1),
      end: smartEndDefault(i + 1),
      edgeClass: null,
    }))
  }
}

/** rows → timeJson */
export function buildTimeJsonFromRows(rows: TimeSlotRow[]): string {
  return JSON.stringify(
    rows.map((row) => {
      const obj: Record<string, unknown> = { node: row.node, start: row.start, end: row.end }
      if (row.edgeClass !== null) {
        obj.edge = row.edgeClass
      }
      return obj
    })
  )
}

function parseEdgeClass(s: string): EdgeClass | null {
  const lower = s.toLowerCase()
  if (lower === 'before') return 'before'
  if (lower === 'after') return 'after'
  return null
}

/** 删除某 node 后重新编号为 1..N */
export function removeAndRenumber(rows: TimeSlotRow[], node: number): TimeSlotRow[] {
  return rows
    .filter((r) => r.node !== node)
    .map((r, idx) => ({ ...r, node: idx + 1 }))
}

/** 追加导入扩展 timeJson — incoming 中 node > currentMaxNode 的节次并入, node 重新连续编号 */
export function extendTimeJsonWith(currentJson: string, incomingJson: string): string {
  const currentRows = parseTimeSlotRows(currentJson)
  const incomingRows = parseTimeSlotRows(incomingJson)
  const currentMaxNode = currentRows.length > 0 ? Math.max(...currentRows.map((r) => r.node)) : 0
  const newRows = incomingRows.filter((r) => r.node > currentMaxNode)
  if (newRows.length === 0) return currentJson
  const merged = currentRows.concat(
    newRows.map((r, idx) => ({ ...r, node: currentMaxNode + idx + 1 }))
  )
  return buildTimeJsonFromRows(merged)
}

/**
 * v7.10.16k 无损合并 — "哪个大用哪个":
 * 双方作息逐节合并, 结果 = max(两边节次数, requiredNodeCount)。
 * 同一节次: 导入源非空时间优先, 否则原表, 都没有用 smart 默认。
 */
export function mergeMostComplete(currentJson: string, incomingJson: string, requiredNodeCount = 0): string {
  const currentRows = currentJson.trim() ? parseTimeSlotRows(currentJson) : []
  const incomingRows = incomingJson.trim() ? parseTimeSlotRows(incomingJson) : []
  const cur = new Map(currentRows.map((r) => [r.node, r]))
  const inc = new Map(incomingRows.map((r) => [r.node, r]))
  const declared = Math.max(
    currentRows.length > 0 ? Math.max(...currentRows.map((r) => r.node)) : 0,
    incomingRows.length > 0 ? Math.max(...incomingRows.map((r) => r.node)) : 0
  )
  if (declared === 0 && requiredNodeCount <= 0) return DEFAULT_TIME_JSON
  const count = Math.max(declared, requiredNodeCount, 1)
  const rows: TimeSlotRow[] = []
  for (let node = 1; node <= count; node++) {
    const i = inc.get(node)
    const c = cur.get(node)
    rows.push({
      node,
      start: i?.start?.trim() || c?.start?.trim() || smartStartDefault(node),
      end: i?.end?.trim() || c?.end?.trim() || smartEndDefault(node),
      edgeClass: null,
    })
  }
  return buildTimeJsonFromRows(rows)
}

/**
 * issue#28 P3: 作息表变更后的课程节次自适应。
 * 首节 = 新表上第一个 end 晚于课程旧起点的节; 末节 = 最后一个 start 早于课程旧终点的节。
 * 旧表缺行或新表无重叠 → 返回原值 (孤儿课保持原节次, 不猜不丢)。
 */
export function remapCourseNodes(
  startNode: number,
  step: number,
  oldTimeJson: string,
  newTimeJson: string
): [number, number] {
  if (startNode < 1 || step < 1) return [startNode, step]
  const oldRows = [...parseTimeSlotRows(oldTimeJson)].sort((a, b) => a.node - b.node)
  const newRows = [...parseTimeSlotRows(newTimeJson)].sort((a, b) => a.node - b.node)
  const oldStart = oldRows.find((r) => r.node === startNode)?.start ?? ''
  const oldEnd = oldRows.find((r) => r.node === startNode + step - 1)?.end ?? ''
  if (!oldStart.trim() || !oldEnd.trim()) return [startNode, step]
  const firstIdx = newRows.findIndex((r) => parseHM(r.end) > parseHM(oldStart))
  if (firstIdx < 0) return [startNode, step]
  const lastIdx = findLastIndex(newRows, (r) => parseHM(r.start) < parseHM(oldEnd))
  if (lastIdx < firstIdx) return [startNode, step]
  const firstNode = newRows[firstIdx].node
  const lastNode = newRows[lastIdx].node
  return [firstNode, Math.max(1, lastNode - firstNode + 1)]
}

/** Array.prototype.findLastIndex (ES2023 前兼容) */
function findLastIndex<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i
  }
  return -1
}

/** 追加一节 (node = max + 1), 时间留空 */
export function appendEmptyRow(rows: TimeSlotRow[]): TimeSlotRow[] {
  const nextNode = (rows.length > 0 ? Math.max(...rows.map((r) => r.node)) : 0) + 1
  return [...rows, { node: nextNode, start: '', end: '', edgeClass: null }]
}

// ---- 课表外节次 (issue#23 手动课程"非常规"开关) ----------------------

/** timeJson 中 1..N 的最大连续 N — 标准节次上界; edge 行不参与 */
function maxContiguousFromOne(rows: TimeSlotRow[]): number {
  const standardNodes = new Set(rows.filter((r) => r.edgeClass === null).map((r) => r.node))
  if (!standardNodes.has(1)) return 0
  let n = 1
  while (standardNodes.has(n + 1)) n++
  return n
}

/** 在 timeJson 中新增边缘节次节点 */
export function insertEdgeNode(timeJson: string, edgeClass: EdgeClass, start: string, end: string): string {
  const rows = parseTimeSlotRows(timeJson)
  let newNode: number
  if (edgeClass === 'before') {
    const existingBefore = rows.filter((r) => r.edgeClass === 'before')
    newNode = existingBefore.length === 0 ? 0 : Math.min(...existingBefore.map((r) => r.node)) - 1
  } else {
    const maxStd = maxContiguousFromOne(rows)
    const existingAfter = rows.filter((r) => r.edgeClass === 'after')
    newNode = existingAfter.length === 0 ? maxStd + 1 : Math.max(...existingAfter.map((r) => r.node)) + 1
  }
  return buildTimeJsonFromRows([...rows, { node: newNode, start, end, edgeClass }])
}

/** 删除某边缘节次节点 — 仅当确实是边缘且无课程引用时移除 */
export function removeEdgeNodeIfUnused(timeJson: string, edgeNode: number, usedNodes: Set<number>): string {
  const rows = parseTimeSlotRows(timeJson)
  const target = rows.find((r) => r.node === edgeNode)
  if (!target) return timeJson
  if (target.edgeClass === null) return timeJson
  if (usedNodes.has(edgeNode)) return timeJson
  return buildTimeJsonFromRows(rows.filter((r) => r.node !== edgeNode))
}

/** 扫描全部边缘节次节点, 逐个回收未被引用的 */
export function reclaimUnusedEdgeNodes(timeJson: string, usedNodes: Set<number>): string {
  let json = timeJson
  for (const n of edgeNodesOf(json, 'before')) {
    json = removeEdgeNodeIfUnused(json, n, usedNodes)
  }
  for (const n of edgeNodesOf(json, 'after')) {
    json = removeEdgeNodeIfUnused(json, n, usedNodes)
  }
  return json
}

/** 列出某方向边缘节次节点号: Before 降序 (最近插入在前) / After 升序 */
export function edgeNodesOf(timeJson: string, edgeClass: EdgeClass): number[] {
  const nodes = parseTimeSlotRows(timeJson)
    .filter((r) => r.edgeClass === edgeClass)
    .map((r) => r.node)
  return edgeClass === 'before' ? [...nodes].sort((a, b) => b - a) : [...nodes].sort((a, b) => a - b)
}

// ---- issue#23 §3.3 effective 时间解析 -------------------------------

/**
 * effectiveCourseTime — 逐卡 effective 时间解析, 四处共用契约:
 *   1. isIrregularTime=true → 课程自带覆盖起止直接生效
 *   2. startNode 为边缘槽位 → 槽位默认时间
 *   3. 否则 → 标准 1..N 节次时间
 * 无法解析 → null, 调用方校验报错。
 */
export function effectiveCourseTime(
  isIrregularTime: boolean,
  startTime: string,
  endTime: string,
  startNode: number,
  step: number,
  timeJson: string
): [string, string] | null {
  if (isIrregularTime) {
    const s = startTime.trim()
    const e = endTime.trim()
    if (isNaN(parseHM(s)) || isNaN(parseHM(e))) return null
    // 对齐 Android TimeTableUtils.kt L546-548: LocalTime.toString() 零填充归一
    return [formatHM(parseHM(s)), formatHM(parseHM(e))]
  }
  const rows = parseTimeSlotRows(timeJson)
  const first = rows.find((r) => r.node === startNode)
  const last = rows.find((r) => r.node === startNode + step - 1)
  if (!first || !last) return null
  return [first.start, last.end]
}

/** 标准 1..N 连续节次上界 (edge 行不参与) */
export function maxStandardNode(timeJson: string): number {
  return maxContiguousFromOne(parseTimeSlotRows(timeJson))
}

/** 候选节次 — EdgeCandidate 1:1 */
export interface EdgeCandidate {
  node: number
  start: string
  end: string
  exists: boolean
  edgeClass: EdgeClass
}

/**
 * 候选节次集合 (§2.2): Before 组升序 + After 组升序。
 * 每组 = 全部已有边缘槽位 + 紧贴边界的一个「新建」候选; 禁止跳号。
 */
export function edgeCandidates(timeJson: string): EdgeCandidate[] {
  const rows = parseTimeSlotRows(timeJson)
  const beforeSlots = rows.filter((r) => r.edgeClass === 'before').sort((a, b) => a.node - b.node)
  const afterSlots = rows.filter((r) => r.edgeClass === 'after').sort((a, b) => a.node - b.node)
  const maxStd = maxContiguousFromOne(rows)
  const newBefore = (beforeSlots.length > 0 ? Math.min(...beforeSlots.map((r) => r.node)) : 1) - 1
  const newAfter = (afterSlots.length > 0 ? Math.max(...afterSlots.map((r) => r.node)) : maxStd) + 1
  const beforeGroup: EdgeCandidate[] = [
    { node: newBefore, start: '', end: '', exists: false, edgeClass: 'before' },
    ...beforeSlots.map((r) => ({ node: r.node, start: r.start, end: r.end, exists: true, edgeClass: 'before' as const })),
  ]
  const afterGroup: EdgeCandidate[] = [
    ...afterSlots.map((r) => ({ node: r.node, start: r.start, end: r.end, exists: true, edgeClass: 'after' as const })),
    { node: newAfter, start: '', end: '', exists: false, edgeClass: 'after' },
  ]
  return [...beforeGroup, ...afterGroup]
}

/** 修改某边缘槽位的默认时间 — 仅 edgeClass != null 行可改 */
export function updateEdgeNodeTimes(timeJson: string, node: number, start: string, end: string): string {
  const rows = parseTimeSlotRows(timeJson)
  const target = rows.find((r) => r.node === node)
  if (!target) return timeJson
  if (target.edgeClass === null) return timeJson
  return buildTimeJsonFromRows(rows.map((r) => (r.node === node ? { ...r, start, end } : r)))
}

function smartStartDefault(node: number): string {
  if (node <= 2) return '08:00'
  if (node <= 4) return '10:00'
  if (node <= 6) return '14:00'
  if (node <= 8) return '16:00'
  if (node <= 10) return '19:00'
  return '20:50'
}

function smartEndDefault(node: number): string {
  if (node <= 2) return '09:40'
  if (node <= 4) return '11:40'
  if (node <= 6) return '15:40'
  if (node <= 8) return '17:40'
  if (node <= 10) return '20:40'
  return '22:30'
}
