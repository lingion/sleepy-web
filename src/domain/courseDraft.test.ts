/**
 * courseDraft 纯函数测试 — Kotlin AddCourseScreen/ConflictDetailReporter JVM 直测同构
 */

import { describe, it, expect } from 'vitest'
import {
  groupSlotsForEdit,
  buildCourseEntity,
  validateCourseDraft,
  draftConflictDetails,
  formatDetail,
  initialMeetingBlock,
  parseHm,
  type MeetingBlockDraft,
} from './courseDraft'
import type { Course } from '../data/types'

const TIME_12 = JSON.stringify(
  Array.from({ length: 12 }, (_, i) => {
    const p = (x: number) => String(x).padStart(2, '0')
    const minutes = 8 * 60 + i * 55
    return { node: i + 1, start: `${p(Math.floor(minutes / 60))}:${p(minutes % 60)}`, end: `${p(Math.floor((minutes + 45) / 60))}:${p((minutes + 45) % 60)}` }
  }),
)

function block(partial: Partial<MeetingBlockDraft>): MeetingBlockDraft {
  return { ...initialMeetingBlock(1), ...partial }
}

const STRS = {
  course_name_empty: '课程名不能为空',
  week_must_be_positive: '周次必须为正',
  slot_at_least_one_day: (n: number) => `时段${n}至少选一天`,
  slot_week_order: (n: number) => `时段${n}周次顺序错误`,
  irregular_node_required: (n: number) => `时段${n}非常规节次必选`,
  slot_start_node_positive: (n: number) => `时段${n}起始节次须为正`,
  slot_step_positive: (n: number) => `时段${n}节数须为正`,
  slot_step_exceeds_max: (n: number, s: number, e: number, max: number) => `时段${n}: ${s}-${e}超出${max}`,
  irregular_time_format: '非常规时间格式应为 HH:mm',
  irregular_time_order: '非常规开始必须早于结束',
  slot_time_overlap: (i: number, j: number, days: string) => `时段${i}与${j}在${days}重叠`,
  localizedDay: (d: number) => ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][d - 1] ?? '',
}

describe('groupSlotsForEdit — 编辑回填分组', () => {
  it('同名同节次不同地点 → 独立 block (issue#22)', () => {
    const courses = [
      { room: 'A101', teacher: '张三', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, ownTime: false, startTime: '', endTime: '' },
      { room: 'B202', teacher: '张三', day: 3, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, ownTime: false, startTime: '', endTime: '' },
    ] as unknown as Course[]
    expect(groupSlotsForEdit(courses)).toHaveLength(2)
  })

  it('同节次同地点不同周次 → 独立 block', () => {
    const courses = [
      { room: 'A101', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 8, type: 0, ownTime: false, startTime: '', endTime: '' },
      { room: 'A101', day: 1, startNode: 1, step: 2, startWeek: 9, endWeek: 16, type: 0, ownTime: false, startTime: '', endTime: '' },
    ] as unknown as Course[]
    expect(groupSlotsForEdit(courses)).toHaveLength(2)
  })
})

describe('buildCourseEntity — 草稿落库形态', () => {
  it('CUSTOM 色 → block.color; AUTO → 空串(渲染 hash); GROUP 空 → 默认主色', () => {
    const custom = buildCourseEntity(1, 'g', '高数', block({ colorMode: 2, color: '#123456' }), 1)
    expect(custom.color).toBe('#123456')
    const auto = buildCourseEntity(1, 'g', '高数', block({ colorMode: 1, color: '#123456' }), 1)
    expect(auto.color).toBe('')
    const group = buildCourseEntity(1, 'g', '高数', block({ colorMode: 0, color: '' }), 1)
    expect(group.color).toBe('#FF6750A4')
  })

  it('边缘槽位卡 → startNode=槽位号, step 锁 1 (issue#23)', () => {
    const c = buildCourseEntity(1, 'g', '晚课', block({ isIrregularNode: true, selectedEdgeNode: -1, startNode: 5, step: 2 }), 1)
    expect(c.startNode).toBe(-1)
    expect(c.step).toBe(1)
    expect(c.isIrregularNode).toBe(true)
  })

  it('ownTime 反算: 覆盖时间 → timeToNode 真实节点 (用户报障 2026-09-10)', () => {
    // TIME_12: 节 1 = 08:00-08:45, 节 2 = 08:55-09:40
    const c = buildCourseEntity(1, 'g', '晚课', block({ isIrregularTime: true, startTime: '08:00', endTime: '08:45' }), 1, '', TIME_12)
    expect([c.startNode, c.step]).toEqual([1, 1])
    expect(c.ownTime).toBe(true)
    expect(c.startTime).toBe('08:00')
  })

  it('ownTime 时间超出课表 → 吸附最后一节 (timeToNode 向下取同构)', () => {
    // TIME_12 尾节 17:50 开始 — 23:00 向下吸附到 12 节
    const c = buildCourseEntity(1, 'g', '实验', block({ isIrregularTime: true, startTime: '23:00', endTime: '23:30' }), 1, '', TIME_12)
    expect([c.startNode, c.step]).toEqual([12, 1])
  })

  it('§5 同值契约: ownTime === isIrregularTime', () => {
    const c = buildCourseEntity(1, 'g', 'x', block({ isIrregularTime: true }), 1)
    expect(c.ownTime).toBe(true)
    expect(c.isIrregularTime).toBe(true)
  })
})

describe('validateCourseDraft', () => {
  it('空名/无天/周次倒序/超界逐条报', () => {
    const issues = validateCourseDraft(
      '',
      [block({ days: [], startWeek: 5, endWeek: 3 })],
      1, 16, TIME_12,
      STRS,
    )
    const msgs = issues.map((i) => i.message)
    expect(msgs).toContain('课程名不能为空')
    expect(msgs.some((m) => m.includes('至少选一天'))).toBe(true)
    expect(msgs.some((m) => m.includes('周次顺序'))).toBe(true)
  })

  it('issue#9: step 越过标准上界拒绝', () => {
    const issues = validateCourseDraft(
      '高数',
      [block({ startNode: 11, step: 5 })],
      1, 16, TIME_12,
      STRS,
    )
    expect(issues.some((i) => i.message.includes('超出'))).toBe(true)
  })

  it('两卡同天时间重叠 → slot_time_overlap', () => {
    const issues = validateCourseDraft(
      '高数',
      [block({ id: 1, startNode: 1, step: 2 }), block({ id: 2, days: [1], startNode: 2, step: 1 })],
      1, 16, TIME_12,
      STRS,
    )
    expect(issues.some((i) => i.message.includes('重叠'))).toBe(true)
  })

  it('两卡单双周错开 → 不报重叠', () => {
    const issues = validateCourseDraft(
      '高数',
      [block({ id: 1, weekType: 1 }), block({ id: 2, weekType: 2 })],
      1, 16, TIME_12,
      STRS,
    )
    expect(issues).toHaveLength(0)
  })

  it('非常规时间格式坏 → 只报 format (Kotlin else-if 同构)', () => {
    const issues = validateCourseDraft(
      '高数',
      [block({ isIrregularTime: true, startTime: '9:0', endTime: '08:00' })],
      1, 16, TIME_12,
      STRS,
    )
    const msgs = issues.map((i) => i.message)
    expect(msgs.some((m) => m.includes('HH:mm'))).toBe(true)
    expect(msgs.some((m) => m.includes('早于'))).toBe(false)
  })

  it('非常规时间顺序反 → 报 order', () => {
    const issues = validateCourseDraft(
      '高数',
      [block({ isIrregularTime: true, startTime: '09:00', endTime: '08:00' })],
      1, 16, TIME_12,
      STRS,
    )
    expect(issues.some((i) => i.message.includes('早于'))).toBe(true)
  })
})

describe('ConflictDetailReporter', () => {
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  function course(p: Partial<Course>): Course {
    return {
      id: 0, groupId: 'g', tableId: 1, courseName: 'x', alias: '', teacher: '', room: '',
      note: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0,
      color: '', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false,
      startTime: '', endTime: '', credit: 0, level: 0, ...p,
    }
  }

  it('同天同节次同周 → 一条明细, 节次交集文案', () => {
    const drafts = [course({ courseName: '新' })]
    const stored = [course({ courseName: '旧' })]
    const details = draftConflictDetails(drafts, stored, dayNames, TIME_12)
    expect(details).toHaveLength(1)
    expect(details[0].existingName).toBe('旧')
    expect(details[0].nodeRangeText).toBe('1-2')
    expect(details[0].weekText).toBe('第1-16周')
  })

  it('单双周错开 → 无冲突', () => {
    const drafts = [course({ type: 1 })]
    const stored = [course({ type: 2 })]
    expect(draftConflictDetails(drafts, stored, dayNames, TIME_12)).toHaveLength(0)
  })

  it('单周交集文案: 单周前缀 + 命中周', () => {
    const drafts = [course({ courseName: '新', type: 1, endWeek: 15 })]
    const stored = [course({ courseName: '旧' })]
    const details = draftConflictDetails(drafts, stored, dayNames, TIME_12)
    expect(details).toHaveLength(1)
    expect(details[0].weekText).toBe('单周 第1-15周')
  })

  it('分钟级判定: ownTime 课跨空隙不制造假冲突 (用户 2026-09-09)', () => {
    // ownTime 草稿 12:30-13:10 (跨午间空隙), 存量第 5 节 11:40-12:25 → 时间不相交
    const drafts = [course({ courseName: '实验', ownTime: true, isIrregularTime: true, startTime: '12:30', endTime: '13:10' })]
    const stored = [course({ courseName: '第五节', startNode: 5, step: 1 })]
    expect(draftConflictDetails(drafts, stored, dayNames, TIME_12)).toHaveLength(0)
  })

  it('存量互撞不报 — 只报草稿参与的冲突', () => {
    const drafts = [course({ courseName: '新', day: 2, startNode: 9, step: 1 })]
    const stored = [
      course({ courseName: 'A', day: 2, startNode: 9, step: 1 }),
      course({ courseName: 'B', day: 2, startNode: 9, step: 1 }),
    ]
    const details = draftConflictDetails(drafts, stored, dayNames, TIME_12)
    // 草稿与 A、B 各一条 — 但存量 A/B 互撞不计
    expect(details).toHaveLength(2)
    expect(details.every((d) => d.draftName === '新')).toBe(true)
  })

  it('formatDetail 模板拼行', () => {
    const line = formatDetail(
      { existingName: '旧课', draftName: '新', day: 1, dayText: '周一', nodeRangeText: '3-4', weekText: '第5-8周' },
      '%1$s 第%2$s节 %3$s 与「%4$s」冲突',
    )
    expect(line).toBe('周一 第3-4节 第5-8周 与「旧课」冲突')
  })
})

describe('parseHm', () => {
  it('合法/非法', () => {
    expect(parseHm('08:00')).toBe(480)
    expect(parseHm('23:59')).toBe(1439)
    expect(parseHm('9:0')).toBe(null)
    expect(parseHm('24:00')).toBe(null)
    expect(parseHm('')).toBe(null)
  })
})
