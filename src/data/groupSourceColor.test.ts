import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { setGroupSourceColor } from './repository'
import { undoManager, useUndoStore } from './undoStore'
import type { Course, Table } from './types'

const table: Table = { id: 1, name: '秋季', startDate: '2026-09-07', maxWeek: 20, nodeCount: 12, timeJson: '[]', smartConfigJson: '', isDefault: 1, createdAt: 1 }
const course: Course = { id: 1, groupId: 'math', tableId: 1, courseName: '数学', room: 'A101', teacher: '', alias: '', note: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '#FF6750A4', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0 }

beforeEach(async () => {
  await db.delete(); await db.open(); localStorage.clear()
  useUndoStore.setState({ undoStack: [], redoStack: [], maxDepth: 5, batchDepth: 0, batchCaptured: false, restoring: false })
  await db.timetables.put(table)
})
afterEach(async () => { await db.delete(); undoManager.clear(); localStorage.clear() })

describe('立即修改课程组色', () => {
  it('changes every GROUP row in the table, preserving AUTO, CUSTOM and other groups or tables', async () => {
    const rows: Course[] = [course, { ...course, id: 2, day: 3, color: '#FF001122' },
      { ...course, id: 3, colorMode: 1, color: '' }, { ...course, id: 4, colorMode: 2, color: '#FF123456' },
      { ...course, id: 5, groupId: 'physics' }, { ...course, id: 6, tableId: 2 }]
    await db.courses.bulkPut(rows)
    await db.courseColors.put({ tableKey: '__global__', groupId: 'math', hue: 120 })
    await setGroupSourceColor(1, 'math', '#FFABCDEF')
    expect(await db.courses.toArray()).toEqual(rows.map(row => row.id <= 2 ? { ...row, color: '#FFABCDEF' } : row))
    expect(await db.courseColors.get(['__global__', 'math'])).toEqual({ tableKey: '__global__', groupId: 'math', hue: 120 })
    expect(useUndoStore.getState().undoStack).toHaveLength(1)
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.toArray()).toEqual(rows)
    expect(await undoManager.redo()).toBe(true)
    expect((await db.courses.get(2))!.color).toBe('#FFABCDEF')
  })

  it.each(['', '   ', 'missing'])('keeps data and undo/redo unchanged for an unavailable group %j', async groupId => {
    await db.courses.put(course)
    await undoManager.capture('fixture'); await db.courses.update(1, { room: 'redo room' }); await undoManager.undo()
    const history = { undo: useUndoStore.getState().undoStack, redo: useUndoStore.getState().redoStack }
    await setGroupSourceColor(1, groupId, '#FFABCDEF')
    expect(await db.courses.toArray()).toEqual([course])
    expect({ undo: useUndoStore.getState().undoStack, redo: useUndoStore.getState().redoStack }).toEqual(history)
  })

  it('does not capture history when no GROUP row needs a color change', async () => {
    const rows: Course[] = [course, { ...course, id: 2, colorMode: 2 }]
    await db.courses.bulkPut(rows)
    await setGroupSourceColor(1, 'math', course.color)
    await setGroupSourceColor(2, 'math', '#FFABCDEF')
    expect(await db.courses.toArray()).toEqual(rows)
    expect(useUndoStore.getState().undoStack).toEqual([])
  })
})
