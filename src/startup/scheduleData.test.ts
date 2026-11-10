import 'fake-indexeddb/auto'
import { afterEach, expect, it } from 'vitest'
import { db } from '../data/db'
import { createScheduleDataQuery, discardInitialScheduleData, getInitialScheduleData, loadScheduleData, prepareInitialScheduleData } from './scheduleData'
import type { Course, Table } from '../data/types'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'

afterEach(async () => { discardInitialScheduleData(); await db.delete(); await db.open() })

it('returns a bound period table and only its default timetable courses as one ready snapshot', async () => {
  const table: Table = { id:1, name:'A', isDefault:1, startDate:'2026-11-09', timeJson:DEFAULT_TIME_JSON, nodeCount:12, maxWeek:20, createdAt:0, smartConfigJson:'', periodTableId:7 }
  await db.periodTables.put({ id:7, name:'Bound periods', nodesPerDay:1, timeJson:'[{"node":1,"start":"09:00","end":"09:45"}]', createdAt:0, smartConfigJson:'', updatedAt:0 })
  await db.timetables.bulkPut([table, { ...table, id:2, name:'B', isDefault:0, periodTableId:null }])
  await db.courses.bulkPut([{ id:1, tableId:1, courseName:'A course' }, { id:2, tableId:2, courseName:'B course' }] as never[])
  await db.prefs.put({ key:'sampleTableId', value:'1' })
  const first = await loadScheduleData()
  expect(first.defaultTable).toMatchObject({ id:1, nodeCount:1, timeJson:'[{"node":1,"start":"09:00","end":"09:45"}]' })
  expect(first.courses.map(course => course.courseName)).toEqual(['A course'])
  expect(first.sampleMeta.id).toBe('1')
  await db.transaction('rw',db.timetables, async () => { await db.timetables.update(1,{isDefault:0}); await db.timetables.update(2,{isDefault:1}) })
  const second = await loadScheduleData()
  expect(second.defaultTable?.id).toBe(2)
  expect(second.courses.map(course => course.courseName)).toEqual(['B course'])
})

it('reports the empty database as ready without fabricating a default timetable', async () => {
  expect(await loadScheduleData()).toEqual({ tables:[], defaultTable:undefined, courses:[], sampleMeta:{id:undefined,dismissed:undefined} })
})

it('provides a complete boot snapshot once and discards it before another tab can switch tables', async () => {
  const table: Table = { id:1, name:'A', isDefault:1, startDate:'2026-11-09', timeJson:DEFAULT_TIME_JSON, nodeCount:12, maxWeek:20, createdAt:0, smartConfigJson:'' }
  await db.timetables.bulkPut([table, { ...table, id:2, name:'B', isDefault:0 }])
  await db.courses.bulkPut([{ id:1, tableId:1, courseName:'A course' }, { id:2, tableId:2, courseName:'B course' }] as never[])
  await prepareInitialScheduleData()
  expect(getInitialScheduleData()?.defaultTable?.id).toBe(1)
  expect(getInitialScheduleData()?.courses.map(course => course.courseName)).toEqual(['A course'])
  // App clears this even if its first route was Mine/Manage instead of Schedule.
  discardInitialScheduleData()
  await db.transaction('rw', db.timetables, async () => { await db.timetables.update(1,{isDefault:0}); await db.timetables.update(2,{isDefault:1}) })
  expect(getInitialScheduleData()).toBeUndefined()
  const current = await loadScheduleData()
  expect(current.defaultTable?.id).toBe(2)
  expect(current.courses.map(course => course.courseName)).toEqual(['B course'])
})

it('compares every persisted property and optional key rather than a display-field whitelist', async () => {
  const table: Table = {
    id: 1, name: 'A', isDefault: 1, startDate: '2026-11-09', timeJson: DEFAULT_TIME_JSON, nodeCount: 12, maxWeek: 20,
    createdAt: 0, smartConfigJson: '', periodTableId: null, reminderEnabled: 1, reminderOverride: null,
    importSourceJson: '', color: '#ff6750a4', preBindSnapshotJson: '',
  }
  const course: Course = {
    id: 1, tableId: 1, groupId: 'course', courseName: 'Course', teacher: '', room: '', note: '', alias: '',
    day: 1, startNode: 1, step: 1, startWeek: 1, endWeek: 20, type: 0, color: '', colorMode: 0,
    ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0, fixedDate: null,
  }
  await db.timetables.put(table)
  await db.courses.put(course)
  await db.prefs.bulkPut([{ key: 'sampleTableId', value: '1' }, { key: 'sampleBannerDismissed', value: '' }])
  const current = await loadScheduleData()
  const same = createScheduleDataQuery(current)
  expect(await same()).toBe(current)

  const changed = (value: unknown) => typeof value === 'string' ? `${value} changed` : typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : 'changed'
  for (const section of ['tables', 'defaultTable', 'courses', 'sampleMeta'] as const) {
    const record = section === 'tables' ? current.tables[0] : section === 'courses' ? current.courses[0] : current[section]!
    for (const [key, value] of Object.entries(record)) {
      const staleRecord = { ...record, [key]: changed(value) }
      const stale = {
        ...current,
        [section]: section === 'tables' || section === 'courses' ? [staleRecord] : staleRecord,
      }
      const result = await createScheduleDataQuery(stale)()
      expect(result, `${section}.${key}`).toEqual(current)
      expect(result, `${section}.${key} must not reuse changed data`).not.toBe(stale)
    }
  }

  const absent = { ...current.courses[0] }
  delete absent.fixedDate
  const explicitUndefined = { ...current, courses: [{ ...absent, fixedDate: undefined }] }
  await db.courses.put(absent)
  expect(await createScheduleDataQuery(explicitUndefined)()).not.toBe(explicitUndefined)
})

it('keeps each query instance independent and still reads changes after an equal result', async () => {
  await db.timetables.put({ id: 1, name: 'A', isDefault: 1, startDate: '', timeJson: DEFAULT_TIME_JSON, nodeCount: 12, maxWeek: 20, createdAt: 0, smartConfigJson: '' })
  const initial = await loadScheduleData()
  const first = createScheduleDataQuery(initial)
  const second = createScheduleDataQuery(initial)
  expect(await first()).toBe(initial)
  expect(await second()).toBe(initial)
  await db.timetables.update(1, { name: 'Changed' })
  const changed = await first()
  expect(changed.defaultTable?.name).toBe('Changed')
  expect(changed).not.toBe(initial)
  const independentlyChanged = await second()
  expect(independentlyChanged).toEqual(changed)
  expect(independentlyChanged).not.toBe(changed)
  expect(await first()).toBe(changed)
  expect(await second()).toBe(independentlyChanged)
  await db.timetables.delete(1)
  expect((await first()).defaultTable).toBeUndefined()
})
