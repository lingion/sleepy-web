import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveCourseDraft } from './repository'
import { undoManager, useUndoStore } from './undoStore'
import { hydratedWith, type Course, type PeriodTable, type Table } from './types'
import { coursesForDate } from '../domain/courseOccurrence'
import { DEFAULT_TIME_JSON, parseTimeSlotRows } from '../domain/timeTable'
import type { HolidayTransferEntry } from '../domain/holiday/transfers'

const table: Table = { id: 1, name: '秋季', startDate: '2026-09-07', maxWeek: 20, nodeCount: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: '', isDefault: 1, createdAt: 1 }
const course: Course = { id: 1, groupId: 'math', tableId: 1, courseName: '数学', room: 'A101', teacher: '', alias: '', note: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0 }
const edge = { node: 13, start: '23:00', end: '23:30', edge: 'after' }
const withEdge = JSON.stringify([...JSON.parse(DEFAULT_TIME_JSON), edge])
const period: PeriodTable = { id: 5, name: '共享作息', timeJson: DEFAULT_TIME_JSON, nodesPerDay: 12, smartConfigJson: '', createdAt: 1, updatedAt: 1 }
const snapshot = async () => ({ courses: await db.courses.toArray(), tables: await db.timetables.toArray(), periods: await db.periodTables.toArray(), undo: useUndoStore.getState().undoStack, redo: useUndoStore.getState().redoStack })

beforeEach(async () => {
  await db.delete(); await db.open(); localStorage.clear()
  useUndoStore.setState({ undoStack: [], redoStack: [], maxDepth: 5, batchDepth: 0, batchCaptured: false, restoring: false })
  await db.timetables.put(table); await db.courses.put(course)
})
afterEach(async () => { await db.delete(); undoManager.clear(); localStorage.clear() })

describe('完整课程草稿的仓库事务', () => {
  it('saves every field and new edge timing with one undo and redo', async () => {
    const before = await snapshot()
    const draft = { ...course, id: 0, courseName: '线性代数', alias: '代数', teacher: '李老师', room: 'B202', note: '第一行\n第二行', startNode: 13, step: 1, ownTime: true, isIrregularTime: true, isIrregularNode: true, startTime: '23:00', endTime: '23:30', fixedDate: '2026-09-07', color: '#FF123456', colorMode: 2 as const }
    expect(await saveCourseDraft([draft], 'math', [course], table, withEdge, [])).toBe(true)
    const saved = await db.courses.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ ...draft, id: expect.any(Number) })
    expect(parseTimeSlotRows((await db.timetables.get(1))!.timeJson).some(row => row.node === 13)).toBe(true)
    expect(useUndoStore.getState().undoStack).toHaveLength(1)
    const after = { courses: saved, tables: await db.timetables.toArray() }
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual(before.courses)
    expect(await db.timetables.toArray()).toEqual(before.tables)
    expect(await undoManager.redo()).toBe(true)
    expect(await db.courses.toArray()).toEqual(after.courses)
    expect(await db.timetables.toArray()).toEqual(after.tables)
  })

  it('updates metadata in place, inserts changed identities, deletes omitted rows and leaves other groups alone', async () => {
    const second = { ...course, id: 2, day: 3 }
    const removed = { ...course, id: 3, day: 5 }
    const other = { ...course, id: 4, groupId: 'physics', courseName: '物理' }
    await db.courses.bulkPut([second, removed, other])
    const drafts = [{ ...course, id: 0, alias: '新别名', note: '新备注', color: '#FF112233' }, { ...second, id: 0, room: '另一个教室' }]
    expect(await saveCourseDraft(drafts, 'math', [course, second, removed, other], table, table.timeJson, [])).toBe(true)
    expect(await db.courses.get(1)).toMatchObject({ alias: '新别名', note: '新备注', color: '#FF112233' })
    expect(await db.courses.get(2)).toBeUndefined()
    expect(await db.courses.get(3)).toBeUndefined()
    expect(await db.courses.get(4)).toEqual(other)
    expect((await db.courses.toArray()).find(row => row.room === '另一个教室')!.id).toBeGreaterThan(4)
  })

  it('edits only the specified legacy empty-group course', async () => {
    const legacy = { ...course, groupId: '' }, other = { ...course, id: 2, groupId: '', courseName: '另一个旧课' }
    await db.courses.bulkPut([legacy, other])
    expect(await saveCourseDraft([{ ...legacy, id: 0, note: '只改这行' }], '', [legacy, other], table, table.timeJson, [], 1)).toBe(true)
    expect(await db.courses.get(2)).toEqual(other)
    expect((await db.courses.toArray()).filter(row => row.note === '只改这行')).toHaveLength(1)
    await undoManager.undo()
    expect(await db.courses.toArray()).toEqual([legacy, other])
    const before = await snapshot()
    expect(await saveCourseDraft([], '', [legacy, other], table, table.timeJson, [])).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('inherits the first global normalized-name group and its existing hue when adding courses', async () => {
    await db.timetables.put({ ...table, id: 2, isDefault: 0 })
    const known = { ...course, id: 2, tableId: 2, groupId: 'known', courseName: '  Linear   Algebra ' }
    await db.courses.put(known)
    await db.courseColors.put({ tableKey: '__global__', groupId: 'known', hue: 123 })
    const first = { ...course, id: 0, groupId: 'incoming', courseName: 'linear algebra' }
    expect(await saveCourseDraft([first, { ...first, day: 4 }], null, [course], table, table.timeJson, [])).toBe(true)
    expect((await db.courses.where('tableId').equals(1).toArray()).filter(row => row.courseName === 'linear algebra').map(row => row.groupId)).toEqual(['known', 'known'])
    expect(await db.courseColors.get(['__global__', 'known'])).toEqual({ tableKey: '__global__', groupId: 'known', hue: 123 })
  })

  it('coalesces exact recurring fragments but retains a distinct fixed date', async () => {
    const fixed = { ...course, id: 2, startWeek: 2, endWeek: 2, fixedDate: '2026-09-14' }
    await db.courses.put(fixed)
    const drafts = [{ ...course, id: 0, startWeek: 1, endWeek: 8 }, { ...course, id: 0, startWeek: 9, endWeek: 16 }, { ...fixed, id: 0 }]
    expect(await saveCourseDraft(drafts, 'math', [course, fixed], table, table.timeJson, [])).toBe(true)
    const saved = await db.courses.toArray()
    expect(saved.filter(row => !row.fixedDate)).toHaveLength(1)
    expect(saved.find(row => !row.fixedDate)).toMatchObject({ startWeek: 1, endWeek: 16 })
    expect(saved.find(row => row.fixedDate)).toEqual(fixed)
  })

  it('keeps no-op saves from consuming undo or invalidating redo', async () => {
    await undoManager.capture('fixture'); await db.courses.update(1, { room: 'redo room' }); await undoManager.undo()
    const before = await snapshot()
    expect(await saveCourseDraft([{ ...course, id: 0 }], 'math', [course], table, table.timeJson, [])).toBe(true)
    expect(await snapshot()).toEqual(before)
  })

  it('writes bound source timing and retains an edge used by another owner, then restores both with undo', async () => {
    const bound = { ...table, periodTableId: 5 }
    const other = { ...table, id: 2, periodTableId: 5, isDefault: 0 as const }
    const shared = { ...period, timeJson: withEdge }
    const ownerCourse = { ...course, id: 2, tableId: 2, startNode: 13, step: 1, isIrregularNode: true }
    await db.periodTables.put(shared); await db.timetables.bulkPut([bound, other]); await db.courses.put(ownerCourse)
    const expected = hydratedWith(bound, shared)
    expect(await saveCourseDraft([], 'math', [course], expected, withEdge, [])).toBe(true)
    expect((await db.periodTables.get(5))!.timeJson).toBe(withEdge)
    expect(await db.courses.get(2)).toEqual(ownerCourse)
    await undoManager.undo()
    expect(await db.courses.get(1)).toEqual(course)
    const appended = JSON.stringify([...JSON.parse(withEdge), { ...edge, node: 14, start: '23:31', end: '23:59' }])
    expect(await saveCourseDraft([{ ...course, id: 0, startNode: 14, step: 1, isIrregularNode: true }], 'math', [course], expected, appended, [])).toBe(true)
    expect(parseTimeSlotRows((await db.periodTables.get(5))!.timeJson).map(row => row.node)).toContain(14)
    expect((await db.timetables.get(1))!.timeJson).toBe(DEFAULT_TIME_JSON)
    await undoManager.undo()
    expect(await db.periodTables.get(5)).toEqual(shared)
    expect(await db.timetables.get(1)).toEqual(bound)
  })

  it.each(['course', 'table', 'period', 'transfer'] as const)('rejects changed %s approval without writing data or history', async kind => {
    const bound = { ...table, periodTableId: 5 }
    await db.periodTables.put(period); await db.timetables.put(bound)
    const expected = hydratedWith(bound, period)
    if (kind === 'course') await db.courses.update(1, { room: 'changed' })
    if (kind === 'table') await db.timetables.update(1, { name: 'changed' })
    if (kind === 'period') await db.periodTables.update(5, { timeJson: withEdge })
    if (kind === 'transfer') localStorage.setItem('sleepy_holiday_transfers_1', JSON.stringify([{ sourceDate: '2026-09-07', targetDate: '2026-09-19', segmentId: 'new' }]))
    const before = await snapshot()
    expect(await saveCourseDraft([{ ...course, id: 0, room: 'pending' }], 'math', [course], expected, withEdge, [])).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('persists already-approved transfer attribution without projecting it a second time', async () => {
    const transfers: HolidayTransferEntry[] = [{ sourceDate: '2026-09-07', targetDate: '2026-09-19', segmentId: 't' }]
    localStorage.setItem('sleepy_holiday_transfers_1', JSON.stringify(transfers))
    expect(await saveCourseDraft([{ ...course, id: 0, startWeek: 1, endWeek: 1 }], 'math', [course], table, table.timeJson, transfers)).toBe(true)
    const rows = await db.courses.toArray()
    expect(coursesForDate('2026-09-07', table.startDate, table.maxWeek, rows, transfers)).toEqual([])
    expect(coursesForDate('2026-09-19', table.startDate, table.maxWeek, rows, transfers)).toHaveLength(1)
  })

  it('serializes competing approvals so only the first one saves', async () => {
    const results = await Promise.all(['first', 'second'].map(note =>
      saveCourseDraft([{ ...course, id: 0, note }], 'math', [course], table, table.timeJson, [])))
    expect(results).toEqual([true, false])
    expect((await db.courses.get(1))!.note).toBe('first')
    expect(useUndoStore.getState().undoStack).toHaveLength(1)
  })

  it('reclaims only unused shared edge slots and restores the shared source on undo', async () => {
    const bound = { ...table, periodTableId: 5 }
    const other = { ...table, id: 2, periodTableId: 5, isDefault: 0 as const }
    const shared = { ...period, timeJson: JSON.stringify([...JSON.parse(withEdge), { ...edge, node: 14, start: '23:31', end: '23:59' }]) }
    const ownerCourse = { ...course, id: 2, tableId: 2, startNode: 13, step: 1, isIrregularNode: true }
    await db.periodTables.put(shared); await db.timetables.bulkPut([bound, other]); await db.courses.put(ownerCourse)
    expect(await saveCourseDraft([{ ...course, id: 0, note: 'changed' }], 'math', [course], hydratedWith(bound, shared), shared.timeJson, [])).toBe(true)
    expect(parseTimeSlotRows((await db.periodTables.get(5))!.timeJson).filter(row => row.edgeClass).map(row => row.node)).toEqual([13])
    expect(await db.timetables.get(1)).toEqual(bound)
    await undoManager.undo()
    expect(await db.periodTables.get(5)).toEqual(shared)
  })
})
