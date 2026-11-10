import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, savePrefs } from './db'
import { saveOccurrence } from './repository'
import { undoManager, useUndoStore } from './undoStore'
import { DEFAULT_PREFS, hydratedWith, type Course, type PeriodTable, type Table } from './types'
import { coursesForDate, occurrenceAtDate, resolveOccurrence } from '../domain/courseOccurrence'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import type { HolidayTransferEntry } from '../domain/holiday/transfers'

const table: Table = { id: 1, name: '秋季', startDate: '2026-09-07', maxWeek: 20, nodeCount: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: '', isDefault: 1, createdAt: 1 }
const course: Course = { id: 1, groupId: 'math', tableId: 1, courseName: '数学', room: 'A101', teacher: '', alias: '', note: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0 }
const period: PeriodTable = { id: 5, name: '共享作息', timeJson: DEFAULT_TIME_JSON, nodesPerDay: 12, smartConfigJson: '', createdAt: 1, updatedAt: 1 }
const occurrence = { course, sourceDate: '2026-09-14', displayDate: '2026-09-14' }
const snapshot = async () => ({ courses: await db.courses.toArray(), tables: await db.timetables.toArray(), periods: await db.periodTables.toArray(), prefs: await db.prefs.toArray(), undo: useUndoStore.getState().undoStack, redo: useUndoStore.getState().redoStack })
const projected = async (date: string, transfers: HolidayTransferEntry[] = []) => coursesForDate(date, table.startDate, table.maxWeek, await db.courses.toArray(), transfers)

beforeEach(async () => {
  await db.delete(); await db.open(); localStorage.clear()
  useUndoStore.setState({ undoStack: [], redoStack: [], maxDepth: 5, batchDepth: 0, batchCaptured: false, restoring: false })
  await db.timetables.put(table); await db.courses.put(course)
})
afterEach(async () => { await db.delete(); undoManager.clear(); localStorage.clear() })

describe('单次课程真实保存与审批事务', () => {
  it('leaves unrelated groups and their row identities unchanged when coalescing the edited group', async () => {
    const unrelated = [
      { ...course, id: 2, groupId: 'physics', courseName: '物理', startWeek: 1, endWeek: 8 },
      { ...course, id: 3, groupId: 'physics', courseName: '物理', startWeek: 9, endWeek: 16 },
    ]
    await db.courses.bulkPut(unrelated)
    const replacement = { ...occurrenceAtDate(course, occurrence.displayDate, table), room: 'B202' }
    expect(await saveOccurrence(occurrence, replacement, [course, ...unrelated], table, [])).toBe(true)
    expect((await db.courses.toArray()).filter(row => row.groupId === 'physics')).toEqual(unrelated)
    expect((await projected('2026-09-14')).find(row => row.groupId === 'math')!.room).toBe('B202')
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual([course, ...unrelated])
  })

  it('treats a domain-generated original-position replacement as a true no-op and retains redo', async () => {
    await undoManager.capture('fixture'); await db.courses.update(1, { room: 'redo room' }); await undoManager.undo()
    // An unrelated obsolete layout preference must not be rewritten by a no-op course save.
    await savePrefs({ ...DEFAULT_PREFS, conflictDefaultTop: { obsolete: 999 } })
    const before = await snapshot()
    let courseWrites = 0
    const onUpdate = () => { courseWrites++ }
    const onCreate = () => { courseWrites++ }
    const onDelete = () => { courseWrites++ }
    db.courses.hook('updating', onUpdate); db.courses.hook('creating', onCreate); db.courses.hook('deleting', onDelete)
    try {
      expect(await saveOccurrence(occurrence, occurrenceAtDate(course, occurrence.displayDate, table), [course], table, [])).toBe(true)
      expect(courseWrites).toBe(0)
      expect(await snapshot()).toEqual(before)
    } finally {
      db.courses.hook('updating').unsubscribe(onUpdate); db.courses.hook('creating').unsubscribe(onCreate); db.courses.hook('deleting').unsubscribe(onDelete)
    }
  })

  it('moves one occurrence across weeks and periods with one undo and redo', async () => {
    const replacement = { ...occurrenceAtDate(course, '2026-09-23', table), startNode: 5, step: 3, room: 'B202' }
    expect(await saveOccurrence(occurrence, replacement, [course], table, [])).toBe(true)
    expect(await projected('2026-09-14')).toEqual([])
    expect(await projected('2026-09-23')).toMatchObject([{ day: 3, startWeek: 3, endWeek: 3, startNode: 5, step: 3, room: 'B202' }])
    expect(await projected('2026-09-21')).toMatchObject([{ room: 'A101' }])
    expect(useUndoStore.getState().undoStack).toHaveLength(1)
    const saved = await db.courses.toArray()
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual([course])
    expect(await undoManager.redo()).toBe(true)
    expect(await db.courses.toArray()).toEqual(saved)
  })

  it('deletes only an actual odd teaching week and restores the exact original row on undo', async () => {
    const odd: Course = { ...course, type: 1 }
    await db.courses.put(odd)
    expect(await saveOccurrence({ course: odd, sourceDate: '2026-09-21', displayDate: '2026-09-21' }, null, [odd], table, [])).toBe(true)
    expect((await db.courses.toArray()).map(row => [row.startWeek, row.endWeek, row.type])).toEqual([[1, 1, 1], [5, 15, 1]])
    expect(await projected('2026-09-21')).toEqual([])
    expect(await projected('2026-09-14')).toEqual([])
    expect(await projected('2026-10-05')).toHaveLength(1)
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual([odd])
    expect(await undoManager.redo()).toBe(true)
    expect(await projected('2026-09-21')).toEqual([])
  })

  it('edits the transfer source once while displaying the replacement only at its mapped target', async () => {
    const transfers: HolidayTransferEntry[] = [{ sourceDate: '2026-09-14', targetDate: '2026-09-19', segmentId: 'holiday' }]
    localStorage.setItem('sleepy_holiday_transfers_1', JSON.stringify(transfers))
    const selected = resolveOccurrence(course, '2026-09-19', transfers)!
    expect(selected.sourceDate).toBe('2026-09-14')
    const replacement = { ...occurrenceAtDate(course, selected.sourceDate, table), room: '调休教室' }
    expect(await saveOccurrence(selected, replacement, [course], table, transfers)).toBe(true)
    expect(await projected('2026-09-14', transfers)).toEqual([])
    expect(await projected('2026-09-19', transfers)).toMatchObject([{ room: '调休教室' }])
    expect(await projected('2026-09-21', transfers)).toMatchObject([{ room: 'A101' }])
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual([course])
  })

  it('keeps a fixed-date move independent of holiday projection and restores it with undo and redo', async () => {
    const fixed = occurrenceAtDate(course, '2026-09-19', table, true)
    fixed.id = course.id
    await db.courses.put(fixed)
    const transfers: HolidayTransferEntry[] = [{ sourceDate: '2026-09-19', targetDate: '2026-09-26', segmentId: 'holiday' }]
    localStorage.setItem('sleepy_holiday_transfers_1', JSON.stringify(transfers))
    const selected = resolveOccurrence(fixed, '2026-09-19', transfers)!
    const replacement = { ...occurrenceAtDate(fixed, '2026-09-22', table, true), room: '固定日期教室' }
    expect(await saveOccurrence(selected, replacement, [fixed], table, transfers)).toBe(true)
    expect(await projected('2026-09-19', transfers)).toEqual([])
    expect(await projected('2026-09-22', transfers)).toMatchObject([{ fixedDate: '2026-09-22', room: '固定日期教室' }])
    expect(await projected('2026-09-26', transfers)).toEqual([])
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual([fixed])
    expect(await undoManager.redo()).toBe(true)
    expect(await projected('2026-09-22', transfers)).toHaveLength(1)
  })

  it.each(['course', 'table', 'period', 'transfer'] as const)('rejects a stale %s approval without changing persisted state or either history stack', async kind => {
    const bound = { ...table, periodTableId: 5 }
    await db.periodTables.put(period); await db.timetables.put(bound)
    const expected = hydratedWith(bound, period)
    await undoManager.capture('fixture'); await db.courses.update(1, { note: 'redo note' }); await undoManager.undo()
    if (kind === 'course') await db.courses.update(1, { room: 'changed' })
    if (kind === 'table') await db.timetables.update(1, { name: 'changed' })
    if (kind === 'period') await db.periodTables.update(5, { timeJson: '[]' })
    if (kind === 'transfer') localStorage.setItem('sleepy_holiday_transfers_1', JSON.stringify([{ sourceDate: '2026-09-14', targetDate: '2026-09-19', segmentId: 'changed' }]))
    const before = await snapshot()
    expect(await saveOccurrence(occurrence, null, [course], expected, [])).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('rejects an occurrence object that no longer matches its approved stored row', async () => {
    const before = await snapshot()
    expect(await saveOccurrence({ ...occurrence, course: { ...course, room: 'stale room' } }, null, [course], table, [])).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('serializes competing location approvals and only saves the first one', async () => {
    const results = await Promise.all(['first', 'second'].map(room => saveOccurrence(occurrence, { ...occurrenceAtDate(course, occurrence.sourceDate, table), room }, [course], table, [])))
    expect(results).toEqual([true, false])
    expect(await projected('2026-09-14')).toMatchObject([{ room: 'first' }])
    expect(useUndoStore.getState().undoStack).toHaveLength(1)
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual([course])
  })
})
