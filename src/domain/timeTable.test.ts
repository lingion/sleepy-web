import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIME_JSON,
  parseHM,
  formatHM,
  parseNodes,
  timeSlotsFor,
  courseTimeString,
  courseTimeParts,
  timeToNode,
  timeToFractionalRows,
  timeToFractionalRowsJson,
  buildRenderSlotPlan,
  parseTimeSlotRows,
  buildTimeJsonFromRows,
  removeAndRenumber,
  extendTimeJsonWith,
  mergeMostComplete,
  remapCourseNodes,
  appendEmptyRow,
  insertEdgeNode,
  removeEdgeNodeIfUnused,
  reclaimUnusedEdgeNodes,
  edgeNodesOf,
  effectiveCourseTime,
  maxStandardNode,
  edgeCandidates,
  updateEdgeNodeTimes,
  PLACEHOLDER_MIN_WEIGHT,
} from './timeTable'
import type { Course } from '../data/types'

function mkCourse(partial: Partial<Course>): Course {
  return {
    id: 1,
    groupId: 'g1',
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

describe('parseHM / formatHM', () => {
  it('"08:00" = 480 分钟', () => {
    expect(parseHM('08:00')).toBe(480)
  })

  it('"21:45" = 1305 分钟', () => {
    expect(parseHM('21:45')).toBe(1305)
  })

  it('非法输入 = NaN', () => {
    expect(parseHM('abc')).toBeNaN()
    expect(parseHM('25:00')).toBeNaN()
    expect(parseHM('12:60')).toBeNaN()
  })

  it('formatHM 往返', () => {
    expect(formatHM(480)).toBe('08:00')
    expect(formatHM(1305)).toBe('21:45')
  })
})

describe('DEFAULT_TIME_JSON — 12 节制', () => {
  it('12 节, 首节 08:00, 末节 22:30', () => {
    const nodes = parseNodes(DEFAULT_TIME_JSON)
    expect(nodes).toHaveLength(12)
    expect(nodes[0]).toEqual({ node: 1, start: '08:00', end: '08:45' })
    expect(nodes[11]).toEqual({ node: 12, start: '21:45', end: '22:30' })
  })
})

describe('parseNodes', () => {
  it('按 node 排序', () => {
    const nodes = parseNodes('[{"node":3,"start":"10:00","end":"10:45"},{"node":1,"start":"08:00","end":"08:45"}]')
    expect(nodes.map((n) => n.node)).toEqual([1, 3])
  })

  it('非法 JSON = 空数组', () => {
    expect(parseNodes('not json')).toEqual([])
    expect(parseNodes('{}')).toEqual([])
  })

  it('任一行时间非法 → 整表空数组 (Android LocalTime.parse 抛异常语义)', () => {
    // 单数字小时 "8:00" 在 Android LocalTime.parse 下抛异常 → 整表 emptyList
    expect(parseNodes('[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"9:00","end":"09:45"}]')).toEqual([])
    expect(parseNodes('[{"node":1,"start":"bad","end":"08:45"}]')).toEqual([])
    expect(parseNodes('[{"node":1,"start":"08:00","end":"25:00"}]')).toEqual([])
  })

  it('全部行时间合法 → 正常返回', () => {
    const nodes = parseNodes('[{"node":1,"start":"08:00","end":"08:45"}]')
    expect(nodes).toEqual([{ node: 1, start: '08:00', end: '08:45' }])
  })
})

describe('timeSlotsFor', () => {
  it('每节点独立一行, label = 节次号', () => {
    const slots = timeSlotsFor(DEFAULT_TIME_JSON)
    expect(slots).toHaveLength(12)
    expect(slots[0].label).toBe('1')
    expect(slots[0].displayStart).toBe('08:00')
    expect(slots[4].label).toBe('5')
  })

  it('脏数据(单数字小时) → parseNodes 已整表拒绝, 返回空 (Android 同链路语义)', () => {
    // Android: parseNodes LocalTime.parse 抛异常 → emptyList → timeSlotsFor emptyList
    expect(timeSlotsFor('[{"node":1,"start":"8:00","end":"9:40"}]')).toEqual([])
  })

  it('displayStart/displayEnd 经 formatTime 零填充 (Android formatTime %02d 同构)', () => {
    // parseNodes 只放行严格 HH:mm, displayStart 恒等归一值
    const slots = timeSlotsFor('[{"node":1,"start":"08:00","end":"09:40"}]')
    expect(slots[0].displayStart).toBe('08:00')
    expect(slots[0].displayEnd).toBe('09:40')
    expect(slots[0].start).toBe('08:00')
    expect(slots[0].end).toBe('09:40')
  })
})

describe('courseTimeString / courseTimeParts', () => {
  it('第 1-2 节 = 08:00-09:40', () => {
    expect(courseTimeString(1, 2, DEFAULT_TIME_JSON)).toBe('08:00-09:40')
  })

  it('ownTime=true 直接用覆盖时间', () => {
    expect(courseTimeString(1, 2, DEFAULT_TIME_JSON, true, '18:30', '20:55')).toBe('18:30-20:55')
  })

  it('节次不存在 = null', () => {
    expect(courseTimeString(99, 1, DEFAULT_TIME_JSON)).toBeNull()
  })

  it('courseTimeParts 返回两段', () => {
    expect(courseTimeParts(3, 2, DEFAULT_TIME_JSON)).toEqual(['10:00', '11:40'])
  })
})

describe('timeToNode — ownTime 反算 (2026-09-09 空隙修复)', () => {
  it('12:30 结束跨午间空隙不吸附到 14:00 节 (报障本体)', () => {
    // 第 4 节 10:55-11:40, 第 5 节 14:00-14:45; 课 10:55-12:30 应停在第 4 节
    expect(timeToNode('10:55', '12:30', DEFAULT_TIME_JSON)).toEqual([4, 1])
  })

  it('起止恰好在节内 = 多节连堂', () => {
    expect(timeToNode('08:00', '09:40', DEFAULT_TIME_JSON)).toEqual([1, 2])
  })

  it('早于首节 → 第 1 节', () => {
    expect(timeToNode('07:00', '08:40', DEFAULT_TIME_JSON)).toEqual([1, 1])
  })

  it('晚于末节 → 第 12 节', () => {
    expect(timeToNode('21:50', '23:30', DEFAULT_TIME_JSON)).toEqual([12, 1])
  })

  it('时间非法 = null', () => {
    expect(timeToNode('bad', '09:40', DEFAULT_TIME_JSON)).toBeNull()
  })

  it('空时间表 = null', () => {
    expect(timeToNode('08:00', '09:40', '[]')).toBeNull()
  })
})

describe('timeToFractionalRows — 比例定位', () => {
  const slots = timeSlotsFor(DEFAULT_TIME_JSON)

  it('节内时间 → 整行 + 槽内比例', () => {
    const [s, e] = timeToFractionalRows('08:00', '08:45', slots)!
    expect(s).toBeCloseTo(0, 5)
    expect(e).toBeCloseTo(1, 5)
  })

  it('半节位置 → 0.5 比例', () => {
    const [s] = timeToFractionalRows('08:22', '08:23', slots)!
    // 08:22 在 08:00-08:45 内 = 22/45 ≈ 0.489
    expect(s).toBeGreaterThan(0.4)
    expect(s).toBeLessThan(0.6)
  })

  it('跨午间空隙: 10:55-12:30 → end 归属下一行顶端 (行 4)', () => {
    const [s, e] = timeToFractionalRows('10:55', '12:30', slots)!
    expect(s).toBeCloseTo(3, 5)
    // 12:30 落在 11:40-14:00 空隙 → 归属下一行 (第 5 节, idx 4)
    expect(e).toBeCloseTo(4, 5)
  })

  it('早于首节 → 0.0', () => {
    const [s] = timeToFractionalRows('06:00', '08:30', slots)!
    expect(s).toBe(0)
  })

  it('晚于末节 → slots.length', () => {
    const [, e] = timeToFractionalRows('22:00', '23:59', slots)!
    expect(e).toBe(slots.length)
  })

  it('结束 ≤ 开始 = null', () => {
    expect(timeToFractionalRows('10:00', '09:00', slots)).toBeNull()
  })

  it('便捷重载走 timeJson', () => {
    const r = timeToFractionalRowsJson('08:00', '08:45', DEFAULT_TIME_JSON)
    expect(r).toEqual([0, 1])
  })
})

describe('buildRenderSlotPlan — 渲染期占位节次合成', () => {
  it('无 ownTime 溢出 → 与 timeSlotsFor 完全一致', () => {
    const plan = buildRenderSlotPlan([mkCourse({})], DEFAULT_TIME_JSON)
    expect(plan.slots).toEqual(timeSlotsFor(DEFAULT_TIME_JSON))
    expect(plan.slotWeights).toBeNull()
  })

  it('课尾溢出进空隙 → 该空隙合成占位行', () => {
    // 课 10:55-12:30 终止在 11:40-14:00 空隙内
    const c = mkCourse({ ownTime: true, startTime: '10:55', endTime: '12:30', isIrregularTime: true })
    const plan = buildRenderSlotPlan([c], DEFAULT_TIME_JSON)
    expect(plan.slots.length).toBe(13) // 12 + 1 占位
    const ph = plan.slots[4]
    expect(ph.isPlaceholder).toBe(true)
    expect(ph.label).toBe('')
    expect(ph.start).toBe('11:40')
    expect(ph.end).toBe('12:30')
    // 权重 = 50/45 ≥ PLACEHOLDER_MIN_WEIGHT
    expect(plan.slotWeights![4]).toBeCloseTo(50 / 45, 5)
  })

  it('5 分钟占位权重抬到下限 0.36 (2026-09-10 报障)', () => {
    // 课 11:35-11:45 → 占位 11:40-11:45 = 5 分钟 / 45 = 0.111 → 抬到 0.36
    const c = mkCourse({ ownTime: true, startTime: '11:35', endTime: '11:45', isIrregularTime: true })
    const plan = buildRenderSlotPlan([c], DEFAULT_TIME_JSON)
    const phIdx = plan.slots.findIndex((s) => s.isPlaceholder)
    expect(phIdx).toBeGreaterThan(0)
    expect(plan.slotWeights![phIdx]).toBe(PLACEHOLDER_MIN_WEIGHT)
  })

  it('两课溢出同一空隙 → 贪心并包 (min 起 max 终)', () => {
    const a = mkCourse({ ownTime: true, startTime: '10:55', endTime: '12:10', isIrregularTime: true })
    const b = mkCourse({ ownTime: true, startTime: '10:55', endTime: '12:30', isIrregularTime: true })
    const plan = buildRenderSlotPlan([a, b], DEFAULT_TIME_JSON)
    const ph = plan.slots.find((s) => s.isPlaceholder)!
    expect(ph.start).toBe('11:40')
    expect(ph.end).toBe('12:30')
  })

  it('连堂跨节不合成 (占空隙两侧节点)', () => {
    // 课 08:00-10:45 占第 1-4 节, 结束恰在第 4 节末尾 → 无空隙溢出
    const c = mkCourse({ ownTime: true, startTime: '08:00', endTime: '10:45', isIrregularTime: true })
    const plan = buildRenderSlotPlan([c], DEFAULT_TIME_JSON)
    expect(plan.slots.length).toBe(12)
    expect(plan.slotWeights).toBeNull()
  })

  it('占位行绝不写回 timeJson (纯函数)', () => {
    const json = DEFAULT_TIME_JSON
    const c = mkCourse({ ownTime: true, startTime: '10:55', endTime: '12:30', isIrregularTime: true })
    buildRenderSlotPlan([c], json)
    expect(json).toBe(DEFAULT_TIME_JSON)
  })
})

describe('parseTimeSlotRows / buildTimeJsonFromRows', () => {
  it('默认 JSON → 12 行', () => {
    const rows = parseTimeSlotRows(DEFAULT_TIME_JSON)
    expect(rows).toHaveLength(12)
    expect(rows[0]).toEqual({ node: 1, start: '08:00', end: '08:45', edgeClass: null })
  })

  it('缺 start/end 时用 smart 默认补', () => {
    const rows = parseTimeSlotRows('[{"node":1}]')
    expect(rows[0].start).toBe('08:00')
    expect(rows[0].end).toBe('09:40')
  })

  it('非法 JSON → 12 行 smart 默认', () => {
    const rows = parseTimeSlotRows('garbage')
    expect(rows).toHaveLength(12)
  })

  it('edge 字段解析', () => {
    const rows = parseTimeSlotRows('[{"node":0,"start":"07:30","end":"08:00","edge":"before"}]')
    expect(rows[0].edgeClass).toBe('before')
  })

  it('往返序列化', () => {
    const rows = parseTimeSlotRows(DEFAULT_TIME_JSON)
    const json = buildTimeJsonFromRows(rows)
    expect(parseTimeSlotRows(json)).toEqual(rows)
  })

  it('edge 行带 edge 字段', () => {
    const json = buildTimeJsonFromRows([{ node: 0, start: '07:30', end: '08:00', edgeClass: 'before' }])
    const parsed = JSON.parse(json)
    expect(parsed[0].edge).toBe('before')
  })
})

describe('removeAndRenumber', () => {
  it('删除后重新 1..N 编号', () => {
    const rows = parseTimeSlotRows(DEFAULT_TIME_JSON)
    const out = removeAndRenumber(rows, 5)
    expect(out).toHaveLength(11)
    expect(out.map((r) => r.node)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    // 原第 6 节 (14:55) 变成第 5 行
    expect(out[4].start).toBe('14:55')
  })
})

describe('extendTimeJsonWith', () => {
  it('incoming 超出节点并入, 连续重编号', () => {
    const extended = extendTimeJsonWith(
      DEFAULT_TIME_JSON,
      '[{"node":13,"start":"19:00","end":"19:45"},{"node":15,"start":"20:00","end":"20:45"}]'
    )
    const rows = parseTimeSlotRows(extended)
    expect(rows).toHaveLength(14) // 12 + 2 (15 重编为 14)
    expect(rows[12]).toEqual({ node: 13, start: '19:00', end: '19:45', edgeClass: null })
    expect(rows[13]).toEqual({ node: 14, start: '20:00', end: '20:45', edgeClass: null })
  })

  it('无新节点原样返回', () => {
    expect(extendTimeJsonWith(DEFAULT_TIME_JSON, '[{"node":1,"start":"08:00","end":"08:45"}]')).toBe(
      DEFAULT_TIME_JSON
    )
  })
})

describe('mergeMostComplete — 哪个大用哪个', () => {
  it('双方取并集, 同节导入源优先', () => {
    const cur = '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:55","end":"09:40"}]'
    const inc = '[{"node":1,"start":"08:30","end":"09:15"},{"node":3,"start":"10:00","end":"10:45"}]'
    const merged = parseTimeSlotRows(mergeMostComplete(cur, inc))
    expect(merged).toHaveLength(3)
    expect(merged[0].start).toBe('08:30') // 导入源优先
    expect(merged[1].start).toBe('08:55') // 原表
    expect(merged[2].start).toBe('10:00') // 导入源
  })

  it('requiredNodeCount 撑大结果 (课程到达 13 节表就是 13 节)', () => {
    const merged = parseTimeSlotRows(mergeMostComplete('', '', 13))
    expect(merged).toHaveLength(13)
    expect(merged[12].start).toBe('20:50') // smart 默认
  })

  it('双方空 + required 0 → DEFAULT_TIME_JSON', () => {
    expect(mergeMostComplete('', '')).toBe(DEFAULT_TIME_JSON)
  })

  it('空串不被 smart 伪声明覆盖 (v7.10.16k 修复)', () => {
    const real = '[{"node":1,"start":"09:00","end":"09:45"}]'
    const merged = parseTimeSlotRows(mergeMostComplete(real, ''))
    expect(merged[0].start).toBe('09:00')
  })
})

describe('remapCourseNodes — issue#28 P3 作息变更自适应', () => {
  const oldJson = DEFAULT_TIME_JSON
  const newJson = JSON.stringify([
    { node: 1, start: '08:30', end: '09:15' },
    { node: 2, start: '09:25', end: '10:10' },
    { node: 3, start: '10:30', end: '11:15' },
    { node: 4, start: '11:25', end: '12:10' },
  ])

  it('旧 1-2 节 (08:00-09:40) 映射到新表重叠区间', () => {
    const [startNode, step] = remapCourseNodes(1, 2, oldJson, newJson)
    // 旧起点 08:00 → 新表第一个 end > 08:00 = 节 1; 旧终点 09:40 → 最后 start < 09:40 = 节 2
    expect(startNode).toBe(1)
    expect(step).toBe(2)
  })

  it('旧表缺行 → 原值返回 (孤儿课)', () => {
    expect(remapCourseNodes(99, 1, oldJson, newJson)).toEqual([99, 1])
  })

  it('step<1 → 原值', () => {
    expect(remapCourseNodes(1, 0, oldJson, newJson)).toEqual([1, 0])
  })
})

describe('appendEmptyRow', () => {
  it('node = max + 1, 时间留空', () => {
    const rows = parseTimeSlotRows(DEFAULT_TIME_JSON)
    const out = appendEmptyRow(rows)
    expect(out).toHaveLength(13)
    expect(out[12]).toEqual({ node: 13, start: '', end: '', edgeClass: null })
  })
})

describe('边缘节次 (issue#23)', () => {
  it('maxStandardNode = 12 (默认表)', () => {
    expect(maxStandardNode(DEFAULT_TIME_JSON)).toBe(12)
  })

  it('首个 Before = 0, 再加 = -1 (Kotlin sortedDescending: 0 在前)', () => {
    const j1 = insertEdgeNode(DEFAULT_TIME_JSON, 'before', '07:30', '08:00')
    expect(edgeNodesOf(j1, 'before')).toEqual([0])
    const j2 = insertEdgeNode(j1, 'before', '07:00', '07:30')
    expect(edgeNodesOf(j2, 'before')).toEqual([0, -1])
  })

  it('首个 After = 13, 再加 = 14', () => {
    const j1 = insertEdgeNode(DEFAULT_TIME_JSON, 'after', '22:40', '23:20')
    expect(edgeNodesOf(j1, 'after')).toEqual([13])
    const j2 = insertEdgeNode(j1, 'after', '23:30', '00:10')
    expect(edgeNodesOf(j2, 'after')).toEqual([13, 14])
  })

  it('removeEdgeNodeIfUnused: 标准节点不回收', () => {
    expect(removeEdgeNodeIfUnused(DEFAULT_TIME_JSON, 5, new Set())).toBe(DEFAULT_TIME_JSON)
  })

  it('removeEdgeNodeIfUnused: 被引用的边缘节点不回收', () => {
    const j = insertEdgeNode(DEFAULT_TIME_JSON, 'after', '22:40', '23:20')
    expect(removeEdgeNodeIfUnused(j, 13, new Set([13]))).toBe(j)
  })

  it('removeEdgeNodeIfUnused: 未引用的边缘节点回收', () => {
    const j = insertEdgeNode(DEFAULT_TIME_JSON, 'after', '22:40', '23:20')
    const out = removeEdgeNodeIfUnused(j, 13, new Set())
    expect(edgeNodesOf(out, 'after')).toEqual([])
  })

  it('reclaimUnusedEdgeNodes 双向扫描', () => {
    let j = insertEdgeNode(DEFAULT_TIME_JSON, 'before', '07:30', '08:00')
    j = insertEdgeNode(j, 'after', '22:40', '23:20')
    // before 被引用, after 未引用
    const out = reclaimUnusedEdgeNodes(j, new Set([0]))
    expect(edgeNodesOf(out, 'before')).toEqual([0])
    expect(edgeNodesOf(out, 'after')).toEqual([])
  })

  it('edgeCandidates: 无边缘槽位时新建候选 = 0 / 13', () => {
    const cands = edgeCandidates(DEFAULT_TIME_JSON)
    // before 组: [新建0] ; after 组: [13(新建)]
    expect(cands).toHaveLength(2)
    expect(cands[0]).toEqual({ node: 0, start: '', end: '', exists: false, edgeClass: 'before' })
    expect(cands[1]).toEqual({ node: 13, start: '', end: '', exists: false, edgeClass: 'after' })
  })

  it('edgeCandidates: 已有槽位复用 + 各追加一个新建', () => {
    let j = insertEdgeNode(DEFAULT_TIME_JSON, 'before', '07:30', '08:00')
    j = insertEdgeNode(j, 'after', '22:40', '23:20')
    const cands = edgeCandidates(j)
    expect(cands).toHaveLength(4)
    expect(cands[0]).toEqual({ node: -1, start: '', end: '', exists: false, edgeClass: 'before' })
    expect(cands[1]).toEqual({ node: 0, start: '07:30', end: '08:00', exists: true, edgeClass: 'before' })
    expect(cands[2]).toEqual({ node: 13, start: '22:40', end: '23:20', exists: true, edgeClass: 'after' })
    expect(cands[3]).toEqual({ node: 14, start: '', end: '', exists: false, edgeClass: 'after' })
  })

  it('effectiveCourseTime: isIrregularTime 直接生效', () => {
    expect(effectiveCourseTime(true, ' 18:30 ', '20:55 ', 1, 1, DEFAULT_TIME_JSON)).toEqual(['18:30', '20:55'])
  })

  it('effectiveCourseTime: isIrregularTime 时间归一零填充 (Android LocalTime.toString 语义)', () => {
    expect(effectiveCourseTime(true, ' 8:30 ', '9:05 ', 1, 1, DEFAULT_TIME_JSON)).toEqual(['08:30', '09:05'])
  })

  it('effectiveCourseTime: 标准节次查表', () => {
    expect(effectiveCourseTime(false, '', '', 1, 2, DEFAULT_TIME_JSON)).toEqual(['08:00', '09:40'])
  })

  it('effectiveCourseTime: 边缘槽位查槽位默认时间', () => {
    const j = insertEdgeNode(DEFAULT_TIME_JSON, 'after', '22:40', '23:20')
    expect(effectiveCourseTime(false, '', '', 13, 1, j)).toEqual(['22:40', '23:20'])
  })

  it('effectiveCourseTime: 节次不存在 = null', () => {
    expect(effectiveCourseTime(false, '', '', 99, 1, DEFAULT_TIME_JSON)).toBeNull()
  })

  it('updateEdgeNodeTimes: 标准行拒改', () => {
    expect(updateEdgeNodeTimes(DEFAULT_TIME_JSON, 1, '09:00', '09:45')).toBe(DEFAULT_TIME_JSON)
  })

  it('updateEdgeNodeTimes: 边缘行可改', () => {
    let j = insertEdgeNode(DEFAULT_TIME_JSON, 'after', '22:40', '23:20')
    j = updateEdgeNodeTimes(j, 13, '22:50', '23:30')
    const rows = parseTimeSlotRows(j)
    expect(rows.find((r) => r.node === 13)).toEqual({ node: 13, start: '22:50', end: '23:30', edgeClass: 'after' })
  })
})
