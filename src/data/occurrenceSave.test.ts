import 'fake-indexeddb/auto'
import { beforeEach, afterEach, it, expect } from 'vitest'
import { db } from './db'
import { saveOccurrence } from './repository'
import { undoManager, useUndoStore } from './undoStore'
import type { Course, Table } from './types'
const table: Table = { id: 1, name: '秋季', startDate: '2026-09-07', maxWeek: 20, nodeCount: 12, timeJson: '[]', smartConfigJson: '', isDefault: 1, createdAt: 1 }
const course: Course = { id: 1, groupId: 'math', tableId: 1, courseName: '数学', room: 'A101', teacher: '', alias: '', note: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0 }
beforeEach(async () => { await db.delete(); await db.open(); await db.timetables.put(table); await db.courses.put(course); useUndoStore.getState().clear(); localStorage.clear() })
afterEach(async () => { await db.delete(); useUndoStore.getState().clear() })
it('edits exactly one occurrence location, preserves other weeks and undoes as one action', async () => {
  expect(await saveOccurrence({ course, sourceDate: '2026-09-14', displayDate: '2026-09-14' }, { ...course, room: 'B202', startWeek: 2, endWeek: 2 }, [course], table, [])).toBe(true)
  const rows = await db.courses.toArray()
  expect(rows.find(c => c.startWeek === 2 && c.endWeek === 2)?.room).toBe('B202')
  expect(rows.filter(c => c.room === 'A101').map(c => [c.startWeek, c.endWeek])).toEqual([[1, 1], [3, 16]])
  expect(useUndoStore.getState().undoStack).toHaveLength(1)
  expect(await undoManager.undo()).toBe(true)
  expect(await db.courses.toArray()).toEqual([course])
})
it('coalesces an unchanged occurrence without writing an undo entry', async () => {
  expect(await saveOccurrence({ course, sourceDate: '2026-09-14', displayDate: '2026-09-14' }, { ...course, startWeek: 2, endWeek: 2 }, [course], table, [])).toBe(true)
  expect(await db.courses.toArray()).toEqual([course])
  expect(useUndoStore.getState().undoStack).toHaveLength(0)
})
it('rejects stale course and table snapshots without altering history', async () => {
  await db.courses.update(1, { room: 'Changed' })
  expect(await saveOccurrence({ course, sourceDate: '2026-09-14', displayDate: '2026-09-14' }, null, [course], table, [])).toBe(false)
  expect((await db.courses.get(1))?.room).toBe('Changed')
  expect(useUndoStore.getState().undoStack).toHaveLength(0)
})
it('deletes just one fixed-date occurrence', async () => {
  const fixed = { ...course, fixedDate: '2026-09-14', startWeek: 2, endWeek: 2 }
  await db.courses.put(fixed)
  expect(await saveOccurrence({ course: fixed, sourceDate: '2026-09-14', displayDate: '2026-09-14' }, null, [fixed], table, [])).toBe(true)
  expect(await db.courses.count()).toBe(0)
})
