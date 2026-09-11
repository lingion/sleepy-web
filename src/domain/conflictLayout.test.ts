import { describe, it, expect } from 'vitest'
import {
  findClusters,
  chainGroups,
  layoutCluster,
  weekLaneSegments,
  weekLaneRows,
  gridDayLanes,
  daysExceedingTwoLanes,
  conflictClusterKey,
  defaultLayerIdOrder,
  overrideAwareLayerOrder,
  hiddenLayerCount,
  memberToLayerRep,
  applyLayerRotation,
  pruneConflictDefaultTop,
} from './conflictLayout'
import type { Course } from '../data/types'

let nextId = 1
function mkCourse(partial: Partial<Course>): Course {
  return {
    id: nextId++,
    groupId: `g${nextId}`,
    tableId: 1,
    courseName: '课',
    teacher: '',
    room: '',
    note: '',
    alias: '',
    day: 1,
    startNode: 1,
    step: 2,
    startWeek: 1,
    endWeek: 16,
    type: 0,
    color: '',
    colorMode: 0,
    ownTime: false,
    isIrregularNode: false,
    isIrregularTime: false,
    startTime: '',
    endTime: '',
    credit: 0,
    level: 0,
    ...partial,
  }
}

describe('findClusters — 节点域聚簇', () => {
  it('同天节点相交两课成一簇', () => {
    const a = mkCourse({ day: 1, startNode: 1, step: 2 })
    const b = mkCourse({ day: 1, startNode: 2, step: 2 })
    const clusters = findClusters([a, b])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].day).toBe(1)
    expect(clusters[0].courses).toHaveLength(2)
  })

  it('链式相邻传播: 1-2/2-3/3-4 同簇', () => {
    const a = mkCourse({ startNode: 1, step: 2 })
    const b = mkCourse({ startNode: 2, step: 2 })
    const c = mkCourse({ startNode: 3, step: 2 })
    const clusters = findClusters([a, b, c])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].courses).toHaveLength(3)
  })

  it('跨天永不聚簇', () => {
    const a = mkCourse({ day: 1, startNode: 1, step: 2 })
    const b = mkCourse({ day: 2, startNode: 1, step: 2 })
    expect(findClusters([a, b])).toHaveLength(0)
  })

  it('size<2 不返回', () => {
    const a = mkCourse({ startNode: 1, step: 2 })
    expect(findClusters([a])).toHaveLength(0)
  })

  it('主课判定序: step 降 > startNode 升 > id 升', () => {
    // 1-4 (step 4) vs 1-2 (step 2): step 大者主课在前
    const long = mkCourse({ startNode: 1, step: 4 })
    const short = mkCourse({ startNode: 1, step: 2 })
    const clusters = findClusters([short, long])
    expect(clusters[0].courses[0]).toBe(long)
  })

  it('同 startNode 同 step 按 id 升', () => {
    const a = mkCourse({ startNode: 1, step: 2 })
    const b = mkCourse({ startNode: 1, step: 2 })
    const clusters = findClusters([b, a])
    expect(clusters[0].courses[0].id).toBe(a.id)
  })
})

describe('findClusters — 时间域聚簇 (timeJson 非空, 2026-09-09 假冲突修复)', () => {
  const timeJson = JSON.stringify([
    { node: 1, start: '08:00', end: '08:45' },
    { node: 2, start: '08:55', end: '09:40' },
    { node: 3, start: '10:00', end: '10:45' },
    { node: 4, start: '10:55', end: '11:40' },
    { node: 5, start: '14:00', end: '14:45' },
  ])

  it('ownTime 课 10:55-12:30 (旧反算落 4-5 节) 与节 5 课: 节点域假成簇, 时间域不成簇 (报障本体)', () => {
    const a = mkCourse({
      ownTime: true,
      isIrregularTime: true,
      startNode: 4,
      step: 2, // 旧跨空隙反算映射到 4-5 节
      startTime: '10:55',
      endTime: '12:30',
    })
    const b = mkCourse({ startNode: 5, step: 1 }) // 14:00-14:45
    // 节点域: a 右端 5 ≥ b 起点 5 → 假成簇
    expect(findClusters([a, b])).toHaveLength(1)
    // 时间域: 12:30 < 14:00 无交集不成簇
    expect(findClusters([a, b], timeJson)).toHaveLength(0)
  })

  it('真实时间重叠照常成簇', () => {
    const a = mkCourse({ startNode: 1, step: 2 }) // 08:00-09:40
    const b = mkCourse({ startNode: 2, step: 2 }) // 08:55-10:45
    const clusters = findClusters([a, b], timeJson)
    expect(clusters).toHaveLength(1)
  })

  it('混合域 (一方时间不可解析) 不成簇 — 宁可漏报不可误报', () => {
    const a = mkCourse({
      ownTime: true,
      isIrregularTime: true,
      startNode: 1,
      step: 1,
      startTime: 'bad',
      endTime: 'also-bad',
    })
    const b = mkCourse({ startNode: 1, step: 2 })
    expect(findClusters([a, b], timeJson)).toHaveLength(0)
  })
})

describe('chainGroups — 图层划分 (v7.8)', () => {
  it('经典形态 {1-3, 1-4, 4-6}: 图层1={1-3,4-6}, 图层2={1-4}', () => {
    const a = mkCourse({ startNode: 1, step: 3 })
    const b = mkCourse({ startNode: 1, step: 4 })
    const c = mkCourse({ startNode: 4, step: 3 })
    const layers = chainGroups([a, b, c])
    expect(layers).toHaveLength(2)
    // 图层1: 1-3 与 4-6
    const layer1 = layers.find((g) => g.length === 2)!
    expect(layer1.map((x) => x.startNode).sort()).toEqual([1, 4])
    // 图层2: 1-4 单课
    const layer2 = layers.find((g) => g.length === 1)!
    expect(layer2[0].step).toBe(4)
  })

  it('{1-3,4-6,7-9,2-4,5-8}: 图层1 三课, 图层2 两课', () => {
    const g = (s: number, st: number) => mkCourse({ startNode: s, step: st })
    const layers = chainGroups([g(1, 3), g(4, 3), g(7, 3), g(2, 3), g(5, 4)])
    expect(layers).toHaveLength(2)
    expect(layers[0]).toHaveLength(3) // 1-3, 4-6, 7-9
    expect(layers[1]).toHaveLength(2) // 2-4, 5-8
  })

  it('三课完全重叠 → 退化为三个单课图层', () => {
    const g = () => mkCourse({ startNode: 1, step: 3 })
    const layers = chainGroups([g(), g(), g()])
    expect(layers).toHaveLength(3)
    expect(layers.every((l) => l.length === 1)).toBe(true)
  })

  it('空输入 = 空', () => {
    expect(chainGroups([])).toEqual([])
  })
})

describe('layoutCluster — 布局与露出', () => {
  function clusterOf(...courses: Course[]) {
    return { day: 1, courses }
  }

  it('两课完全重叠: 顶层 zRank=0 非 hidden, 底层 hidden=true 拿 STACK', () => {
    const top = mkCourse({ startNode: 1, step: 3 })
    const bottom = mkCourse({ startNode: 1, step: 3 })
    const out = layoutCluster(clusterOf(top, bottom), 'stack')
    expect(out).toHaveLength(2)
    expect(out[0].zRank).toBe(0)
    expect(out[0].hidden).toBe(false)
    expect(out[0].variant).toBe('NONE')
    expect(out[1].hidden).toBe(true)
    expect(out[1].variant).toBe('STACK')
  })

  it('fold 样式: 底层拿 FOLD (v7.10.16n 一切非置顶 hidden)', () => {
    const top = mkCourse({ startNode: 1, step: 3 })
    const bottom = mkCourse({ startNode: 2, step: 3 })
    const out = layoutCluster(clusterOf(top, bottom), 'fold')
    expect(out[1].variant).toBe('FOLD')
    expect(out[1].hidden).toBe(true)
  })

  it('rail 样式: 底层拿 RAIL', () => {
    const top = mkCourse({ startNode: 1, step: 3 })
    const bottom = mkCourse({ startNode: 1, step: 3 })
    const out = layoutCluster(clusterOf(top, bottom), 'rail')
    expect(out[1].variant).toBe('RAIL')
  })

  it('部分重叠有独占节次 → 非 hidden 拿 NONE', () => {
    const a = mkCourse({ startNode: 1, step: 2 }) // 节 1-2
    const b = mkCourse({ startNode: 2, step: 2 }) // 节 2-3
    const out = layoutCluster(clusterOf(a, b), 'stack')
    // a 主序在前 (同 step, startNode 小)
    expect(out[0].course).toBe(a)
    expect(out[0].hidden).toBe(false)
    // b 节 3 独占 → 露出非空
    expect(out[1].hidden).toBe(false)
    expect(out[1].variant).toBe('NONE')
  })

  it('链组态 (v7.8): 沉底链组成员渲染真卡 hidden=false', () => {
    // 1-3 / 1-4 / 4-6: 图层1={1-3,4-6}, 图层2={1-4}
    const a = mkCourse({ startNode: 1, step: 3 })
    const b = mkCourse({ startNode: 1, step: 4 })
    const c = mkCourse({ startNode: 4, step: 3 })
    const out = layoutCluster(clusterOf(a, b, c), 'stack')
    // 默认顶层 = 图层 {1-4} (b): 其代表 key(-4,1) < {1-3,4-6} 代表 1-3 key(-3,1)
    const bOut = out.find((x) => x.course === b)!
    expect(bOut.zRank).toBe(0)
    // 沉底链组成员 a 和 c: hasChainLayer → hidden=false (真卡)
    const aOut = out.find((x) => x.course === a)!
    const cOut = out.find((x) => x.course === c)!
    expect(aOut.hidden).toBe(false)
    expect(cOut.hidden).toBe(false)
  })

  it('chainFront: 置顶链组层成员全员 chainFront=true', () => {
    const a = mkCourse({ startNode: 1, step: 3 })
    const b = mkCourse({ startNode: 4, step: 3 })
    const c = mkCourse({ startNode: 1, step: 6 })
    const out = layoutCluster(clusterOf(a, b, c), 'stack', a.id)
    // topOverrideId=a → 链层 {a,b} 置顶, 成员 chainFront=true
    expect(out.find((x) => x.course === a)!.chainFront).toBe(true)
    expect(out.find((x) => x.course === b)!.chainFront).toBe(true)
    expect(out.find((x) => x.course === c)!.chainFront).toBe(false)
  })

  it('topOverrideId: 被点课所在图层整体置顶', () => {
    const a = mkCourse({ startNode: 1, step: 3 })
    const b = mkCourse({ startNode: 1, step: 4 })
    const out = layoutCluster(clusterOf(a, b), 'stack', a.id)
    expect(out[0].course).toBe(a)
  })

  it('maxNode 裁剪: 界外整课 hidden=true', () => {
    const a = mkCourse({ startNode: 11, step: 3 }) // 节 11-13
    const b = mkCourse({ startNode: 10, step: 3 }) // 节 10-12
    const out = layoutCluster(clusterOf(a, b), 'stack', null, 12)
    const aOut = out.find((x) => x.course === a)!
    // a 被 clamp 到 11-12, 全被 b (10-12) 覆盖 → hidden
    expect(aOut.hidden).toBe(true)
  })

  it('layerOrderOverride: 轮换序优先, 缺失层补尾', () => {
    const a = mkCourse({ startNode: 1, step: 3 })
    const b = mkCourse({ startNode: 1, step: 4 })
    // 默认层序 [b层, a层] (b 层代表 key(-4,1) 更小); 轮换把 b 层继续置顶, a 层补尾
    const repB = defaultLayerIdOrder([a, b])[0]
    const out = layoutCluster(clusterOf(a, b), 'stack', null, null, [repB])
    expect(out[0].course).toBe(b)
    expect(out[out.length - 1].course).toBe(a)
  })
})

describe('weekLaneSegments / weekLaneRows — 周视图分栏', () => {
  it('无冲突课 laneCount=1 全宽', () => {
    const a = mkCourse({ day: 1, startNode: 1, step: 2 })
    const segs = weekLaneSegments([a])
    expect(segs).toEqual([{ course: a, lane: 0, laneCount: 1 }])
  })

  it('链式区域 1-2/2-3/3-4: 2 栏 (50 节课分两组还是两行同构)', () => {
    const g = (s: number) => mkCourse({ startNode: s, step: 2 })
    const segs = weekLaneSegments([g(1), g(2), g(3)])
    expect(segs).toHaveLength(3)
    expect(segs.every((s) => s.laneCount === 2)).toBe(true)
    // 1-2 与 3-4 同栏
    const lane1 = segs.find((s) => s.course.startNode === 1)!.lane
    const lane3 = segs.find((s) => s.course.startNode === 3)!.lane
    expect(lane1).toBe(lane3)
    const lane2 = segs.find((s) => s.course.startNode === 2)!.lane
    expect(lane2).not.toBe(lane1)
  })

  it('weekLaneRows: 七课链式区域不丢课不重复 (2026-09-02 报障)', () => {
    const g = (s: number) => mkCourse({ startNode: s, step: 2 })
    const courses = [g(1), g(2), g(3), g(4), g(5), g(6), g(7)]
    const rows = weekLaneRows(courses)
    const allIds = rows.flatMap((r) => r.courses.map((c) => c.id))
    expect(allIds).toHaveLength(courses.length)
    expect(new Set(allIds).size).toBe(courses.length)
  })

  it('weekLaneRows 时间域: 零时间交集 ownTime 课不并冲突行 (2026-09-10)', () => {
    const timeJson = JSON.stringify([
      { node: 1, start: '08:00', end: '08:45' },
      { node: 2, start: '08:55', end: '09:40' },
      { node: 3, start: '10:00', end: '10:45' },
      { node: 4, start: '10:55', end: '11:40' },
    ])
    const a = mkCourse({
      ownTime: true,
      isIrregularTime: true,
      startNode: 1,
      step: 1,
      startTime: '08:00',
      endTime: '08:40',
    })
    const b = mkCourse({
      ownTime: true,
      isIrregularTime: true,
      startNode: 1,
      step: 1,
      startTime: '10:55',
      endTime: '11:40',
    })
    // 节点域: 同节点同冲突行; 时间域: 各自独立行
    expect(weekLaneRows([a, b])).toHaveLength(1)
    expect(weekLaneRows([a, b], timeJson)).toHaveLength(2)
  })
})

describe('gridDayLanes — 网格小组件分栏', () => {
  it('无冲突 → 全列宽', () => {
    const a = mkCourse({ startNode: 1, step: 2 })
    expect(gridDayLanes([a])).toEqual([{ course: a, laneStartFraction: 0, laneWidthFraction: 1 }])
  })

  it('两课冲突 → 各占半栏', () => {
    const a = mkCourse({ startNode: 1, step: 2 })
    const b = mkCourse({ startNode: 1, step: 3 })
    const out = gridDayLanes([a, b])
    expect(out).toHaveLength(2)
    for (const r of out) {
      expect(r.laneWidthFraction).toBeCloseTo(0.5, 5)
    }
    const starts = out.map((r) => r.laneStartFraction).sort()
    expect(starts[0]).toBe(0)
    expect(starts[1]).toBeCloseTo(0.5, 5)
  })
})

describe('daysExceedingTwoLanes — 冲突深度闸门', () => {
  it('2 栏合法', () => {
    const g = (s: number) => mkCourse({ startNode: s, step: 2 })
    expect(daysExceedingTwoLanes([g(1), g(2), g(3)])).toEqual(new Set())
  })

  it('3 栏违规', () => {
    const g = (s: number, day: number) => mkCourse({ startNode: s, step: 3, day })
    // 1-3/2-4/3-5 部分重叠无零重叠对 → 每层最多 1 课 → 3 层
    const out = daysExceedingTwoLanes([g(1, 1), g(2, 1), g(3, 1)])
    expect(out).toEqual(new Set([1]))
  })
})

describe('簇键 / 图层序 / 轮换 / 偏好清理', () => {
  it('conflictClusterKey = "day:startNode:step"', () => {
    const a = mkCourse({ day: 3, startNode: 5, step: 2 })
    expect(conflictClusterKey(a)).toBe('3:5:2')
  })

  it('defaultLayerIdOrder: 层代表 = maxWith (step 最大, 同 step startNode 最大), key 升序', () => {
    const a = mkCourse({ id: 1, startNode: 1, step: 3 }) // 1-3
    const b = mkCourse({ id: 2, startNode: 1, step: 4 }) // 1-4
    const c = mkCourse({ id: 3, startNode: 4, step: 3 }) // 4-6
    // 图层: {a,c} rep=c (maxWith: 同 step=3, startNode 4>1) key(-3,4,3); {b} rep=b key(-4,1,2)
    // 升序: (-4,1,2) < (-3,4,3) → b 层先
    expect(defaultLayerIdOrder([a, b, c])).toEqual([b.id, c.id])
  })

  it('overrideAwareLayerOrder: 置顶层恒首位', () => {
    const a = mkCourse({ id: 1, startNode: 1, step: 3 })
    const b = mkCourse({ id: 2, startNode: 1, step: 4 })
    const order = defaultLayerIdOrder([a, b])
    expect(overrideAwareLayerOrder([a, b], a.id)).toEqual([a.id, b.id])
    expect(overrideAwareLayerOrder([a, b], b.id)).toEqual(order)
    expect(overrideAwareLayerOrder([a, b], null)).toEqual(order)
    // repId 不在簇内 → 退回默认序
    expect(overrideAwareLayerOrder([a, b], 999)).toEqual(order)
  })

  it('hiddenLayerCount: 2 层 = 0, 3 层 = 1', () => {
    expect(hiddenLayerCount(2)).toBe(0)
    expect(hiddenLayerCount(3)).toBe(1)
    expect(hiddenLayerCount(1)).toBe(0)
  })

  it('memberToLayerRep: 成员 id → 层代表 id (三处同键)', () => {
    const a = mkCourse({ id: 1, startNode: 1, step: 3 }) // 1-3
    const b = mkCourse({ id: 2, startNode: 1, step: 4 }) // 1-4
    const c = mkCourse({ id: 3, startNode: 4, step: 3 }) // 4-6
    const rep = memberToLayerRep([a, b, c])
    expect(rep.get(a.id)).toBe(c.id) // {a,c} 层代表 = maxWith = c
    expect(rep.get(c.id)).toBe(c.id)
    expect(rep.get(b.id)).toBe(b.id) // 单课层代表 = 自身
  })

  it('memberToLayerRep 链层代表 = maxWith (step 最大, 同 step startNode 最大)', () => {
    const a = mkCourse({ id: 1, startNode: 1, step: 3 }) // 1-3
    const c = mkCourse({ id: 3, startNode: 4, step: 3 }) // 4-6
    const rep = memberToLayerRep([a, c])
    // {a, c} 同层; maxWith: 同 step=3, startNode c=4 > a=1 → 代表 = c
    expect(rep.get(a.id)).toBe(c.id)
    expect(rep.get(c.id)).toBe(c.id)
  })

  it('applyLayerRotation: 循环左移, 负数同余, 整周期还原', () => {
    const order = [1, 2, 3]
    expect(applyLayerRotation(order, 1)).toEqual([2, 3, 1])
    expect(applyLayerRotation(order, 3)).toEqual(order)
    expect(applyLayerRotation(order, -1)).toEqual([3, 1, 2])
    expect(applyLayerRotation(order, 0)).toEqual(order)
    expect(applyLayerRotation([1], 5)).toEqual([1])
  })

  it('pruneConflictDefaultTop: 死 repId 与死键清理', () => {
    const live = mkCourse({ id: 1, day: 1, startNode: 1, step: 2 })
    const liveB = mkCourse({ id: 2, day: 1, startNode: 1, step: 2 })
    const stored: Record<string, number> = {
      '1:1:2': 1, // 合法: 键在簇内, repId 活
      '9:9:9': 1, // 死键: 无此簇
      '1:1:2b': 999, // 死 repId (键非法但 repId 死)
    }
    const out = pruneConflictDefaultTop(stored, [live, liveB])
    expect(out).toEqual({ '1:1:2': 1 })
  })

  it('pruneConflictDefaultTop: 时间域 liveKeys 与网格同一真值 (2026-09-10)', () => {
    const timeJson = JSON.stringify([
      { node: 1, start: '08:00', end: '08:45' },
      { node: 2, start: '08:55', end: '09:40' },
      { node: 3, start: '10:00', end: '10:45' },
      { node: 4, start: '10:55', end: '11:40' },
      { node: 5, start: '14:00', end: '14:45' },
    ])
    const a = mkCourse({
      id: 1,
      ownTime: true,
      isIrregularTime: true,
      day: 1,
      startNode: 4,
      step: 1,
      startTime: '10:55',
      endTime: '12:30',
    })
    const b = mkCourse({ id: 2, day: 1, startNode: 4, step: 2 })
    // 时间域: b (节 4-5 = 10:55-14:45) 与 a (10:55-12:30) 重叠成簇;
    // 簇锚 = 主序第一课 (step 降) = b → 键 "1:4:2"
    const stored = { '1:4:2': 1 }
    const out = pruneConflictDefaultTop(stored, [a, b], timeJson)
    expect(out).toEqual(stored)
  })

  it('pruneConflictDefaultTop: 空输入 = 空', () => {
    expect(pruneConflictDefaultTop({}, [mkCourse({})])).toEqual({})
    expect(pruneConflictDefaultTop({ '1:1:2': 1 }, [])).toEqual({})
  })
})
