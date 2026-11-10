import { describe, expect, it } from 'vitest'
import { exportIcs, exportWakeUpJson, exportWakeUpShareText, type ExportCourse, type ExportTable } from './scheduleExporter'
import { exportSleepyV1File } from './sleepyNativeExporter'
import { parseSchedule } from './scheduleParser'
import { buildDatedEvents } from './icsRangeExporter'

const source = '{ "name": "Ａ１|校区", "weekStart": null, "unknown": ["\\n", 2] }'
const table: ExportTable = {
  id: 1, name: '便携课表', startDate: '2026-09-07', maxWeek: 20,
  nodesPerDay: 2, timeJson: '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:55","end":"09:40"}]',
  color: '#FF6750A4', importSourceJson: source,
}
const course: ExportCourse = {
  id: 1, tableId: 1, groupId: 'same', courseName: 'Lab: [A, B] {C}', alias: '实验',
  teacher: 'Teacher: A, B', room: 'Room [1]', note: 'line 1\nline 2', day: 1,
  startNode: 1, step: 2, startWeek: 1, endWeek: 20, type: 0,
  color: '#FF6750A4', ownTime: true, isIrregularTime: true,
  startTime: '07:05', endTime: '07:55', fixedDate: '2026-09-15',
}

describe('Android v1.0.64 portable fields', () => {
  it.each([
    ['JSON', () => exportWakeUpJson(table, [course])],
    ['share', () => exportWakeUpShareText(table, [course])],
    ['native', () => exportSleepyV1File(table.name, table.startDate, table.maxWeek, table.nodesPerDay, table.timeJson, [course], null, source)],
  ] as const)('%s retains source bytes, fixed dates, own times and text punctuation', (_, serialize) => {
    const parsed = parseSchedule(serialize(), 0)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw parsed.error
    expect(parsed.value.importSourceJson).toBe(source)
    expect(parsed.value.courses[0]).toMatchObject({
      courseName: course.courseName, teacher: course.teacher, room: course.room,
      ownTime: true, startTime: '07:05', endTime: '07:55', fixedDate: '2026-09-15',
    })
  })

  it('fixed-date ICS exports one occurrence on its concrete date without RRULE', () => {
    const ics = exportIcs(table, [course])
    expect(ics).toContain('DTSTART:20260915T070500')
    expect(ics).not.toContain('RRULE:')
    expect(ics).toContain('-2026-09-15@sleepy')
  })

  it('dated ICS does not repeat fixed-date courses on their nominal weekday', () => {
    const events = buildDatedEvents(table, [course], {
      today: new Date(2026, 8, 7), range: 'SEMESTER', transfers: [],
      reminderMinutes: null, firstAlarmEnabled: false, firstAlarmMinutes: 20,
    })
    expect(events).toHaveLength(1)
    expect(events[0].date.getDate()).toBe(15)
  })

  it('invalid fixed dates are ignored rather than rolling into another month', () => {
    const parsed = parseSchedule(exportWakeUpJson(table, [{ ...course, fixedDate: '2026-02-30' }]), 0)
    expect(parsed.ok && parsed.value.courses[0].fixedDate).toBeNull()
  })
})
