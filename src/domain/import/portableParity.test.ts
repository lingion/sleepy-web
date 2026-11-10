import { describe, expect, it } from 'vitest'
import { exportIcs, exportWakeUpJson, exportWakeUpShareText, type ExportCourse, type ExportTable } from './scheduleExporter'
import { exportSleepyV1File } from './sleepyNativeExporter'
import { parseSchedule } from './scheduleParser'
import { buildDatedEvents, exportDatedIcs } from './icsRangeExporter'

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

  it('all ICS paths use the mapped source week, suppress that source, and leave fixed dates in place', () => {
    const transfers = [{sourceDate:'2026-09-07',targetDate:'2026-09-19',segmentId:'s'}]
    const recurring = {...course,id:2,courseName:'第一周',fixedDate:null,startWeek:1,endWeek:1,type:1}
    const fixed = {...course,fixedDate:'2026-09-07'}
    const options = {today:new Date(2026,8,7),range:'SEMESTER' as const,transfers,reminderMinutes:null,firstAlarmEnabled:false,firstAlarmMinutes:20}
    const events=buildDatedEvents(table,[recurring,fixed],options)
    expect(events.map(e=>[e.course.courseName,e.date.getDate(),e.transferred])).toEqual([[fixed.courseName,7,false],['第一周',19,true]])
    for(const ics of [exportIcs(table,[recurring,fixed],transfers),exportDatedIcs(table,[recurring,fixed],options)]) {
      expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
      expect(ics).toContain('DTSTART:20260919T070500')
      expect(ics).toContain('DTSTART:20260907T070500')
      expect(ics).not.toContain('RRULE:')
    }
  })

  it('ICS reimport retains concrete dates, own times and recurring parity', () => {
    for(const row of [course,{...course,fixedDate:null,type:2}]) {
      const parsed=parseSchedule(exportIcs(table,[row]),0)
      if(!parsed.ok)throw parsed.error
      expect(parsed.ok).toBe(true)
      expect(parsed.value.startDate).toBe(table.startDate)
      expect(parsed.value.courses[0]).toMatchObject({fixedDate:row.fixedDate,ownTime:true,startTime:'07:05',endTime:'07:55',type:row.fixedDate ? 0 : 2})
    }
  })

  it('native integrity checks use original bytes before full-width text normalization',()=>{
    const parsed=parseSchedule(exportSleepyV1File(table.name,table.startDate,20,2,table.timeJson,[course],null,source),0)
    if(!parsed.ok)throw parsed.error
    expect(parsed.value.warnings).not.toContain('完整性校验不符，文件可能被截断或修改')
  })

  it('explicit high periods survive native and JSON DTOs without a 30-period cap',()=>{
    const row={...course,startNode:41,step:3,ownTime:false,isIrregularTime:false}
    for(const text of [exportWakeUpJson({...table,nodesPerDay:43},[row]),exportSleepyV1File(table.name,table.startDate,20,43,table.timeJson,[row])]) {
      const parsed=parseSchedule(text,0)
      if(!parsed.ok)throw parsed.error
      expect(parsed.value.courses[0]).toMatchObject({startNode:41,step:3,fixedDate:'2026-09-15'})
      expect(parsed.value.nodesPerDay).toBeGreaterThanOrEqual(43)
    }
  })
})
