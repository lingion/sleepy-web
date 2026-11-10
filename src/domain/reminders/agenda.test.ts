import { describe, expect, it } from 'vitest'
import { buildDailyAgenda, notificationSourceLabels, agendaDateFromHash } from './agenda'
import type { Course, Table } from '../../data/types'
const table = (id: number, name = `表${id}`) => ({ id, name, timeJson: '[{"node":1,"start":"08:00","end":"08:45"}]' } as Table)
const course = (id: number, patch: Partial<Course> = {}) => ({ id, courseName: '高数', room: 'A101', teacher: '张老师', startNode: 1, step: 1, ownTime: false, ...patch } as Course)
describe('v1.0.64 aggregate daily agenda', () => {
  it('merges identical occurrences only across distinct tables, preserving same-table duplicates', () => {
    const a = table(1), b = table(2)
    const agenda = buildDailyAgenda('2026-11-10', [{ table: a, courses: [course(1), course(2)] }, { table: b, courses: [course(3), course(4)] }])
    expect(agenda.items.map(item => item.sources.map(source => source.table.id))).toEqual([[1, 2], [1, 2]])
    expect(agenda.tableCount).toBe(2)
  })
  it('keeps incomplete times, missing rooms and differing teachers separate', () => {
    const sets = [table(1), table(2)].map(t => ({ table: t, courses: [course(1, { room: '' }), course(2, { ownTime: true, startTime: '08:00', endTime: '07:00' }), course(3, { teacher: String(t.id) })] }))
    expect(buildDailyAgenda('2026-11-10', sets).items).toHaveLength(6)
  })
  it('sorts known times before unknown and keeps stable ordering on ties', () => {
    const agenda = buildDailyAgenda('2026-11-10', [{ table: table(1), courses: [course(1, { ownTime: true, startTime: 'invalid', endTime: '' }), course(2), course(3, { ownTime: true, startTime: '07:00', endTime: '07:45' })] }])
    expect(agenda.items.map(item => item.sources[0].course.id)).toEqual([3, 2, 1])
  })
  it('truncates names by Unicode codepoints and disambiguates collisions', () => {
    const labels = notificationSourceLabels([table(1, '同名'), table(2, '同名'), table(3, '😀'.repeat(18))], '未知')
    expect(labels[1]).toBe('同名 #1')
    expect(labels[2]).toBe('同名 #2')
    expect([...labels[3]]).toHaveLength(16)
    expect(notificationSourceLabels([table(1)], '未知')).toEqual({})
  })
  it('parses absolute calendar destinations and rejects rollover or malformed dates', () => {
    expect(agendaDateFromHash('#/今日/课程汇总/2026-11-10')).toBe('2026-11-10')
    expect(agendaDateFromHash('#/今日/课程汇总/2026-02-30')).toBeNull()
    expect(agendaDateFromHash('#/今日/课程汇总/nope')).toBeNull()
  })
})
