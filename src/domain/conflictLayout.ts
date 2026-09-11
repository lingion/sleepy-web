/**
 * 网格视图冲突布局引擎 — ConflictLayoutEngine.kt 699 行 1:1 移植
 * 纯函数,零 DOM/框架依赖。
 *
 * 聚簇规则: 仅同一天内,节点区间 [startNode, startNode+step-1] (闭区间) 相交的课程
 * 经传递闭包归为一簇。跨天永不聚簇;size<2 的簇不返回。
 * 主课判定序 (primaryOrder): step 降 > startNode 升 > id 升。
 */

import type { Course } from '../data/types'
import { effectiveCourseTime, parseHM, timeToNode } from './timeTable'

/** 同一天的冲突簇 — 簇内课程节点区间两两经传递闭包相连 */
export interface ConflictCluster {
  day: number
  courses: Course[]
}

/** 变体标记 — NONE=无标记(真卡自然露出), STACK/FOLD/RAIL 见设计文档 §3 */
export type ConflictVariant = 'NONE' | 'STACK' | 'FOLD' | 'RAIL'

/** 单课布局结果 — zRank=0 即顶层; hidden=零露出; variant 仅 hidden 课非 NONE */
export interface LaidOutCourse {
  course: Course
  zRank: number
  hidden: boolean
  variant: ConflictVariant
  /** 该课属于链式多课层且该层当前为顶层 */
  chainFront: boolean
}

/** 周视图栏位布局结果 — 无冲突课 laneCount=1 (全宽) */
export interface WeekLaneSegment {
  course: Course
  lane: number
  laneCount: number
}

/** 周视图行分组 — 冲突区域整区域一行 */
export interface WeekLaneRow {
  courses: Course[]
  laneOf: Map<number, number>
  laneCount: number
}

/** 网格小组件单日分栏结果 */
export interface GridLaneRect {
  course: Course
  laneStartFraction: number
  laneWidthFraction: number
}

// ---- 比较器 -----------------------------------------------------------

/** 主课判定序: step 降 > startNode 升 > id 升 */
function primaryCompare(a: Course, b: Course): number {
  if (a.step !== b.step) return b.step - a.step
  if (a.startNode !== b.startNode) return a.startNode - b.startNode
  return a.id - b.id
}

/** Kotlin maxWith(primaryComparator) — 比较器下最大者 (step 最大; 同 step 取 startNode 最大) */
function maxWithPrimary(courses: Course[]): Course {
  return courses.reduce((a, b) => (primaryCompare(a, b) <= 0 ? b : a))
}

/** 层排序键 (-step, startNode, id) 升序 */
function layerSortKey(c: Course): [number, number, number] {
  return [-c.step, c.startNode, c.id]
}

function compareKey(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

/** 主课判定序输出 */
export function primaryOrder(courses: Course[]): Course[] {
  return [...courses].sort(primaryCompare)
}

// ---- 线性扫区间合并 -----------------------------------------------------

/** 节点域: 已按 startNode 排序的区间, 相邻相交合并为一簇 (传递闭包) */
function mergeOverlapping(sorted: Course[]): Course[][] {
  if (sorted.length === 0) return []
  const clusters: Course[][] = [[sorted[0]]]
  let currentEnd = sorted[0].startNode + sorted[0].step - 1
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i]
    const end = c.startNode + c.step - 1
    if (c.startNode <= currentEnd) {
      clusters[clusters.length - 1].push(c)
      if (end > currentEnd) currentEnd = end
    } else {
      clusters.push([c])
      currentEnd = end
    }
  }
  return clusters
}

/** 课的真实时间区间 (秒, 自午夜起) — ownTime 用自身起止, 常规课用节次起止; 失败 null */
function realIntervalOf(c: Course, timeJson: string): [number, number] | null {
  const eff = effectiveCourseTime(
    c.isIrregularTime || c.ownTime,
    c.startTime,
    c.endTime,
    c.startNode,
    c.step,
    timeJson
  )
  if (!eff) return null
  const s = parseHM(eff[0])
  const e = parseHM(eff[1])
  if (isNaN(s) || isNaN(e) || e <= s) return null
  return [s * 60, e * 60]
}

/**
 * 时间域聚簇 — 真实分钟区间相交则并簇 (传递闭包)。
 * 混合域 (一方时间不可解析) 严禁节点数与秒数直接比较 → 不成簇:
 * 宁可漏报不可误报 (2026-09-09 假冲突报障本体)。
 */
function mergeOverlappingByTime(sorted: Course[], timeJson: string): Course[][] {
  if (sorted.length === 0) return []
  const intervals = sorted.map((c) => realIntervalOf(c, timeJson))
  const clusters: Course[][] = [[sorted[0]]]
  let currentEnd = intervals[0]?.[1] ?? sorted[0].startNode + sorted[0].step - 1
  let currentEndIsTime = intervals[0] != null
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i]
    const iv = intervals[i]
    let start: number
    let end: number
    let isTime: boolean
    if (iv != null) {
      start = iv[0]
      end = iv[1]
      isTime = true
    } else {
      start = c.startNode
      end = c.startNode + c.step - 1
      isTime = false
    }
    let overlaps: boolean
    if (currentEndIsTime && iv != null) {
      overlaps = start < currentEnd
    } else if (!currentEndIsTime && iv == null) {
      overlaps = start <= currentEnd
    } else {
      overlaps = false // 混合域无公共可比域 → 不并簇
    }
    if (overlaps) {
      clusters[clusters.length - 1].push(c)
      if (end > currentEnd) {
        currentEnd = end
        currentEndIsTime = isTime
      }
    } else {
      clusters.push([c])
      currentEnd = end
      currentEndIsTime = isTime
    }
  }
  return clusters
}

// ---- 公开 API ---------------------------------------------------------

/**
 * 找出全部冲突簇。簇间按 day 升序, 簇内按主课判定序。
 * timeJson 非空: 分钟域聚簇 (ownTime 课真实时间参与, 跨空隙反算不再制造假冲突);
 * timeJson 空: 节点域聚簇 (旧行为)。
 */
export function findClusters(courses: Course[], timeJson: string | null = null): ConflictCluster[] {
  const byDay = new Map<number, Course[]>()
  for (const c of courses) {
    const list = byDay.get(c.day)
    if (list) list.push(c)
    else byDay.set(c.day, [c])
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const out: ConflictCluster[] = []
  for (const day of days) {
    const dayCourses = byDay.get(day)!
    const sorted = [...dayCourses].sort(
      (a, b) => a.startNode - b.startNode || a.step - b.step || a.id - b.id
    )
    const groups = timeJson != null ? mergeOverlappingByTime(sorted, timeJson) : mergeOverlapping(sorted)
    for (const g of groups) {
      if (g.length >= 2) {
        out.push({ day, courses: primaryOrder(g) })
      }
    }
  }
  return out
}

/**
 * 图层划分 (v7.8 定版) — 反复从剩余课中提取最大互不重叠集合:
 * 每轮按 startNode 升序, 区间图最大独立集经典算法 (按右端点贪心)。
 * {1-3, 1-4, 4-6}: 图层1 = {1-3, 4-6}, 图层2 = {1-4}。
 */
export function chainGroups(courses: Course[]): Course[][] {
  if (courses.length === 0) return []
  const remaining = [...courses]
  const layers: Course[][] = []
  while (remaining.length > 0) {
    const sorted = [...remaining].sort(
      (a, b) => a.startNode - b.startNode || a.step - b.step || a.id - b.id
    )
    const layer: Course[] = []
    let currentEnd = -1
    for (const c of sorted) {
      if (c.startNode > currentEnd) {
        layer.push(c)
        currentEnd = c.startNode + c.step - 1
      }
    }
    layers.push(layer.sort((a, b) => a.startNode - b.startNode))
    const layerIds = new Set(layer.map((c) => c.id))
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (layerIds.has(remaining[i].id)) remaining.splice(i, 1)
    }
  }
  return layers
}

/** hidden 课的 variant 映射 (v7.10.16u): 三种 style 全部直配, fold 永远 FOLD */
function variantFor(style: string, chainMode: boolean): ConflictVariant {
  if (style === 'rail') return 'RAIL'
  if (chainMode) return style === 'fold' ? 'FOLD' : 'STACK'
  if (style === 'fold') return 'FOLD'
  return 'STACK'
}

/**
 * 布局一簇: 输出顺序 = zRank 升序。
 * v7.8 图层语义: layers = chainGroups, z 序 = 图层整体切换单元。
 * v7.10.16n: fold 样式下一切非置顶图层的课一律 hidden=true (虚线/折角语言)。
 * maxNode: hidden 必须与 UI 裁剪同一空间计算, 否则界外独占节次的课不可达。
 */
export function layoutCluster(
  cluster: ConflictCluster,
  style: string,
  topOverrideId: number | null = null,
  maxNode: number | null = null,
  layerOrderOverride: number[] | null = null
): LaidOutCourse[] {
  // Kotlin 端 ordered 变量实际未参与后续逻辑 (图层自 chainGroups 重建), 移植时省略

  // v7.8 图层构建
  const layers = chainGroups(cluster.courses)
  const layerOfId = new Map<number, Course[]>()
  for (const g of layers) {
    for (const c of g) layerOfId.set(c.id, g)
  }
  const hasChainLayer = layers.some((g) => g.length >= 2)

  // 层间默认序: 层代表课的 (-step, startNode, id) 升序
  const defaultLayerOrder = [...layers].sort((g1, g2) =>
    compareKey(layerSortKey(maxWithPrimary(g1)), layerSortKey(maxWithPrimary(g2)))
  )

  // z 序构造 (v7.10.16r): layerOrderOverride (轮换通道) 优先; 未知 id 跳过,
  // 缺失层按默认序补尾; 重复 id 去重保留首个命中。
  let orderedLayers: Course[][]
  if (layerOrderOverride != null) {
    const byRep = new Map<number, Course[]>()
    for (const g of defaultLayerOrder) byRep.set(maxWithPrimary(g).id, g)
    const seen = new Set<number>()
    const front: Course[][] = []
    for (const id of layerOrderOverride) {
      const g = byRep.get(id)
      if (!g) continue
      const rep = maxWithPrimary(g).id
      if (!seen.has(rep)) {
        seen.add(rep)
        front.push(g)
      }
    }
    for (const g of defaultLayerOrder) {
      if (!front.includes(g)) front.push(g)
    }
    orderedLayers = front
  } else if (topOverrideId != null && layerOfId.has(topOverrideId)) {
    const front = layerOfId.get(topOverrideId)!
    orderedLayers = [front, ...defaultLayerOrder.filter((g) => g !== front)]
  } else {
    orderedLayers = defaultLayerOrder
  }
  const zOrdered: Course[] = orderedLayers.flatMap((g) => [...g].sort((a, b) => a.startNode - b.startNode))

  // 露出计算区间: maxNode 非 null 时 clamp 进 [1, maxNode]
  function nodesOf(course: Course): number[] {
    if (maxNode == null) {
      const out: number[] = []
      for (let n = course.startNode; n <= course.startNode + course.step - 1; n++) out.push(n)
      return out
    }
    const start = Math.max(course.startNode, 1)
    const endIncl = Math.min(course.startNode + course.step - 1, maxNode)
    const out: number[] = []
    for (let n = start; n <= endIncl; n++) out.push(n)
    return out
  }

  return zOrdered.map((course, rank) => {
    const ownNodes = nodesOf(course)
    const ownLayer = layerOfId.get(course.id) ?? null
    const isFrontLayer = ownLayer != null && orderedLayers[0] === ownLayer
    const foldSinkToDash = style === 'fold' && ownLayer != null && !isFrontLayer
    let hidden: boolean
    if (foldSinkToDash) {
      hidden = true
    } else if (hasChainLayer) {
      hidden = ownNodes.length === 0
    } else if (ownNodes.length === 0) {
      hidden = true
    } else if (rank === 0) {
      hidden = false
    } else {
      const covered = new Set<number>()
      for (let i = 0; i < rank; i++) {
        for (const n of nodesOf(zOrdered[i])) covered.add(n)
      }
      hidden = ownNodes.every((n) => covered.has(n))
    }
    const chainFront = hasChainLayer && ownLayer != null && ownLayer.length >= 2 && isFrontLayer
    return {
      course,
      zRank: rank,
      hidden,
      variant: !hidden ? 'NONE' : variantFor(style, hasChainLayer && ownLayer !== null && ownLayer.length >= 2),
      chainFront,
    }
  })
}

/** 周视图局部栏位分割 — 分栏只适用于周视图, 跟网格视图无关 */
export function weekLaneSegments(courses: Course[]): WeekLaneSegment[] {
  if (courses.length === 0) return []
  const out: WeekLaneSegment[] = []
  const byDay = groupByDay(courses)
  for (const [, dayCourses] of byDay) {
    const sorted = [...dayCourses].sort(
      (a, b) => a.startNode - b.startNode || a.step - b.step || a.id - b.id
    )
    const regions = mergeOverlapping(sorted)
    for (const region of regions) {
      if (region.length < 2) {
        for (const c of region) out.push({ course: c, lane: 0, laneCount: 1 })
        continue
      }
      const lanes = chainGroups(region)
      lanes.forEach((lane, laneIdx) => {
        for (const c of lane) out.push({ course: c, lane: laneIdx, laneCount: lanes.length })
      })
    }
  }
  return out
}

/** 周视图渲染行分组 — 行成员 = 区域全体, 每课恰渲染一次 */
export function weekLaneRows(courses: Course[], timeJson: string | null = null): WeekLaneRow[] {
  if (courses.length === 0) return []
  const prepared =
    timeJson != null
      ? courses.map((c) => normalizeForLayout(c, timeJson))
      : courses
  const rows: WeekLaneRow[] = []
  const byDay = groupByDay(prepared)
  for (const [, dayCourses] of byDay) {
    const sorted = [...dayCourses].sort(
      (a, b) => a.startNode - b.startNode || a.step - b.step || a.id - b.id
    )
    const regions = timeJson != null ? mergeOverlappingByTime(sorted, timeJson) : mergeOverlapping(sorted)
    for (const region of regions) {
      if (region.length < 2) {
        for (const c of region) rows.push({ courses: [c], laneOf: new Map(), laneCount: 1 })
        continue
      }
      const lanes = chainGroups(region)
      const laneOf = new Map<number, number>()
      lanes.forEach((lane, laneIdx) => {
        for (const c of lane) laneOf.set(c.id, laneIdx)
      })
      rows.push({ courses: [...region].sort((a, b) => a.startNode - b.startNode), laneOf, laneCount: lanes.length })
    }
  }
  return rows.sort((a, b) => a.courses[0].startNode - b.courses[0].startNode)
}

/** 网格小组件单日冲突分栏 — 每课横向起点比例与宽度比例 */
export function gridDayLanes(courses: Course[], timeJson: string | null = null): GridLaneRect[] {
  if (courses.length === 0) return []
  const prepared =
    timeJson != null ? courses.map((c) => normalizeForLayout(c, timeJson)) : courses
  const out: GridLaneRect[] = []
  const sorted = [...prepared].sort(
    (a, b) => a.startNode - b.startNode || a.step - b.step || a.id - b.id
  )
  const regions = timeJson != null ? mergeOverlappingByTime(sorted, timeJson) : mergeOverlapping(sorted)
  for (const region of regions) {
    if (region.length < 2) {
      for (const c of region) out.push({ course: c, laneStartFraction: 0, laneWidthFraction: 1 })
      continue
    }
    const lanes = chainGroups(region)
    const w = 1 / lanes.length
    lanes.forEach((lane, laneIdx) => {
      for (const c of lane) out.push({ course: c, laneStartFraction: laneIdx * w, laneWidthFraction: w })
    })
  }
  return out.sort((a, b) => a.course.startNode - b.course.startNode)
}

/** 冲突深度闸门: 同一天同一冲突区域最多 2 栏; 返回超出的 day 集合 */
export function daysExceedingTwoLanes(courses: Course[]): Set<number> {
  const out = new Set<number>()
  const byDay = groupByDay(courses)
  for (const [day, dayCourses] of byDay) {
    const sorted = [...dayCourses].sort(
      (a, b) => a.startNode - b.startNode || a.step - b.step || a.id - b.id
    )
    const maxLanes = Math.max(...mergeOverlapping(sorted).map((r) => chainGroups(r).length))
    if (maxLanes > 2) out.add(day)
  }
  return out
}

/** 簇键公式唯一真值 (v7.10.16p): "day:startNode:step" (锚课三元组) */
export function conflictClusterKey(anchor: Course): string {
  return `${anchor.day}:${anchor.startNode}:${anchor.step}`
}

export function conflictClusterKeyOf(cluster: ConflictCluster): string {
  return conflictClusterKey(cluster.courses[0])
}

/**
 * 簇的「默认图层序」— 每图层代表 id, 图层按代表课 (-step, startNode, id) 升序。
 * 代表判定与 memberToLayerRep / layoutCluster.layerOrderOverride 三处同键: 层内 maxWith。
 */
export function defaultLayerIdOrder(courses: Course[]): number[] {
  return orderedDefaultLayers(courses).map((g) => maxWithPrimary(g).id)
}

/** 默认图层序完整形态: 排序后的图层本体 */
function orderedDefaultLayers(courses: Course[]): Course[][] {
  return [...chainGroups(courses)].sort((g1, g2) =>
    compareKey(layerSortKey(maxWithPrimary(g1)), layerSortKey(maxWithPrimary(g2)))
  )
}

/** 置顶感知轮换基准序: 用户置顶层 (repId) 永远排基准首位 */
export function overrideAwareLayerOrder(courses: Course[], topRepId: number | null): number[] {
  const defaultOrder = defaultLayerIdOrder(courses)
  if (topRepId == null || !defaultOrder.includes(topRepId)) return defaultOrder
  return [topRepId, ...defaultOrder.filter((id) => id !== topRepId)]
}

/** 气泡徽标文案: 「+N」= 层数 - 2 (默认两层已显示); 层数 <2 → 0 */
export function hiddenLayerCount(layerCount: number): number {
  return Math.max(0, layerCount - 2)
}

/** 成员课 id → 其所在图层的代表 id (maxWith) */
export function memberToLayerRep(courses: Course[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const layer of orderedDefaultLayers(courses)) {
    const rep = maxWithPrimary(layer).id
    for (const c of layer) out.set(c.id, rep)
  }
  return out
}

/** 会话轮换步数 → 完整轮换层序 (循环左移 steps 位); steps 取模, 负数同余 */
export function applyLayerRotation(baselineOrder: number[], steps: number): number[] {
  if (baselineOrder.length < 2 || steps % baselineOrder.length === 0) return baselineOrder
  const k = ((steps % baselineOrder.length) + baselineOrder.length) % baselineOrder.length
  return [...baselineOrder.slice(k), ...baselineOrder.slice(0, k)]
}

/**
 * 清理指向已失效课程的置顶偏好 (v7.10.16p):
 *   1. repId 不在现存课里 → 删
 *   2. 键不出现存簇键集合 → 删
 *   3. 其余 → 保留
 * timeJson: 与网格聚簇同一时间域 (2026-09-10 报障 — 旧节点域 liveKeys 会静默误删置顶)。
 */
export function pruneConflictDefaultTop(
  stored: Record<string, number>,
  currentCourses: Course[],
  timeJson: string | null = null
): Record<string, number> {
  if (Object.keys(stored).length === 0 || currentCourses.length === 0) return {}
  const liveIds = new Set(currentCourses.map((c) => c.id))
  const liveKeys = new Set(findClusters(currentCourses, timeJson).map(conflictClusterKeyOf))
  const out: Record<string, number> = {}
  for (const [key, repId] of Object.entries(stored)) {
    if (liveKeys.has(key) && liveIds.has(repId)) out[key] = repId
  }
  return out
}

// ---- 内部工具 ---------------------------------------------------------

function groupByDay(courses: Course[]): Map<number, Course[]> {
  const byDay = new Map<number, Course[]>()
  for (const c of courses) {
    const list = byDay.get(c.day)
    if (list) list.push(c)
    else byDay.set(c.day, [c])
  }
  return new Map([...byDay.entries()].sort((a, b) => a[0] - b[0]))
}

/** weekLaneRows/gridDayLanes 时间域路径的节点归一化 (CourseEntity.normalizeNode 1:1) */
function normalizeForLayout(c: Course, timeJson: string): Course {
  if (c.isIrregularNode) return c
  if (!c.ownTime || !c.startTime || !c.endTime) return c
  const mapped = timeToNode(c.startTime, c.endTime, timeJson)
  if (!mapped) return c
  return { ...c, startNode: mapped[0], step: mapped[1] }
}
