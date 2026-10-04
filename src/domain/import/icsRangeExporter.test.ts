/**
 * 日期展开 ICS 导出测试 — buildEventSpecs 语义对位验证:
 * 范围裁剪 / 周次过滤 / 调休生效周几 / VALARM / 描述标记 / 非法时段跳过。
 */

import { it, expect } from 'vitest'
import { buildDatedEvents, exportDatedIcs, type DatedIcsOptions } from './icsRangeExporter'
import type { ExportCourse, ExportTable } from './scheduleExporter'

// 学期 2026-09-01(周二) → mondayOfStart = 08-31(周一), maxWeek=20 → semesterEnd 2027-01-18
const table: ExportTable = {
  id: 7,
  name: '2026 秋',
  startDate: '2026-09-01',
  maxWeek: 20,
  nodesPerDay: 3,
  timeJson: JSON.stringify([
    { node: 1, start: '08:00', end: '08:45' },
    { node: 2, start: '08:55', end: '09:40' },
    { node: 3, start: '10:00', end: '10:45' },
  ]),
  color: '',
}

const baseCourse: ExportCourse = {
  id: 1, groupId: 'g1', tableId: 7, courseName: '高数', alias: '', teacher: '张三', room: 'A101',
  note: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '',
  ownTime: false, startTime: '', endTime: '', isIrregularTime: false,
}

const opts = (patch: Partial<DatedIcsOptions> = {}): DatedIcsOptions => ({
  range: 'NEXT_WEEK',
  today: new Date(2026, 8, 2, 12, 0), // 周三
  transfers: [],
  reminderMinutes: null,
  firstAlarmEnabled: false,
  firstAlarmMinutes: 60,
  ...patch,
})

it('NEXT_WEEK: 只导出 [max(today,学期始), today+7) 内的上课日', () => {
  const events = buildDatedEvents(table, [baseCourse], opts())
  // 高数在周一: 9/7(周一, week2) 命中; 9/14 起超出 today+7; 8/31/9/7 中 8/31 早于 today
  expect(events.map((e) => e.date.toDateString())).toEqual(['Mon Sep 07 2026'])
  expect(events[0].week).toBe(2)
})

it('SEMESTER: 裁剪到学期末; 周次/奇偶课过滤', () => {
  const odd: ExportCourse = { ...baseCourse, id: 2, courseName: '单周实验', type: 1 }
  const late: ExportCourse = { ...baseCourse, id: 3, courseName: '第17周课', startWeek: 17, endWeek: 17 }
  const lateTable: ExportTable = { ...table, maxWeek: 3 } // 学期止 09-21
  const events = buildDatedEvents(lateTable, [odd, late], opts({ range: 'SEMESTER' }))
  const byName = (n: string) => events.filter((e) => e.course.courseName === n)
  // 周一序列 9/7(week2 偶), 9/14(week3 奇), 9/21(week4 偶, 不在 [start,end) — end 含? [from,until) 不含)
  expect(byName('单周实验').map((e) => e.week)).toEqual([3]) // 只有奇数周
  expect(byName('第17周课')).toHaveLength(0) // 3 周学期内到不了第 17 周
})

it('调休: 周三调成周二 → 按周二课导出并标记 transferred', () => {
  const english: ExportCourse = { ...baseCourse, id: 2, courseName: '英语', day: 2 }
  const events = buildDatedEvents(table, [english], opts({
    transfers: [{ sourceDate: '2026-09-02', targetDate: '2026-09-01', segmentId: 's1' }],
  }))
  expect(events).toHaveLength(2) // 9/2(调休) + 9/8(正常周二)
  const hit = events[0]
  expect(hit.transferred).toBe(true)
  expect(hit.date.toDateString()).toBe('Wed Sep 02 2026')
  expect(events[1].transferred).toBe(false)
})

it('非法时段 (end<=start) 跳过 — Android invalid++', () => {
  const bad: ExportCourse = { ...baseCourse, ownTime: true, startTime: '10:00', endTime: '08:00' }
  expect(buildDatedEvents(table, [bad], opts({ range: 'SEMESTER' }))).toHaveLength(0)
})

it('ownTime 课程用自带时间; 节次课从 timeJson 取', () => {
  const own: ExportCourse = { ...baseCourse, ownTime: true, startTime: '15:00', endTime: '16:30' }
  const events = buildDatedEvents(table, [baseCourse, own], opts())
  expect(events[0].start).toBe('08:00')
  expect(events[0].end).toBe('09:40') // node1 起 step2 → node2 end
  const ownEv = events.find((e) => e.course.id === 1 && e.start === '15:00')
  expect(ownEv?.end).toBe('16:30')
})

it('exportDatedIcs: VEVENT 结构 / marker / VALARM / 调休文案', () => {
  // 9/2(周三) 按 9/1(周二) 课表上 → 取周二课 (day=2)
  const english: ExportCourse = { ...baseCourse, id: 2, courseName: '英语', day: 2, startNode: 3, step: 1, note: '换教室' }
  const ics = exportDatedIcs(table, [english], opts({
    transfers: [{ sourceDate: '2026-09-02', targetDate: '2026-09-01', segmentId: 's1' }],
    reminderMinutes: 15,
  }))
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).toContain('BEGIN:VEVENT')
  expect(ics).toContain('DTSTART:20260902T100000') // node3 英语 10:00
  expect(ics).toContain('Sleepy import key:7:2:2026-09-02')
  expect(ics).toContain('第1周 · 第3—3节') // 9/2 → week1 (学期从 8/31 周一起算)
  expect(ics).toContain('调课安排：按周二课程')
  expect(ics).toContain('备注：换教室')
  expect(ics).toContain('TRIGGER:-PT15M')
  expect(ics).not.toContain('RRULE') // 逐日形态无循环规则
})

it('学期开始前: 请求区间不覆盖上课日 → 空; 范围足够长则从 semesterStart 起排; 坏 startDate → 空', () => {
  // today=8/1, NEXT_WEEK 止于 8/8 < semesterStart(8/31) → 无事件 (start>=end)
  expect(buildDatedEvents(table, [baseCourse], opts({ today: new Date(2026, 7, 1) }))).toHaveLength(0)
  const before = buildDatedEvents(table, [baseCourse], opts({ range: 'SEMESTER', today: new Date(2026, 7, 1) }))
  expect(before[0].date.toDateString()).toBe('Mon Aug 31 2026') // 从学期始周一排, 非 today
  const broken = buildDatedEvents({ ...table, startDate: '' }, [baseCourse], opts())
  expect(broken).toHaveLength(0)
})
