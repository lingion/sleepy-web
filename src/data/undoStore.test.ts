/**
 * 单级撤销/重做 — UndoManager.kt 2026-09-21 redo 语义的 web 对位验证:
 * undo→redo→undo 对称 / 新写动作作废旧 redo / restore 抑制 / 双槽互斥。
 * 真实 Dexie (fake-indexeddb)。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useUndoStore, undoManager } from './undoStore'
import { db } from './db'
import { insertTable, insertCourse } from './repository'

async function seedBase(): Promise<number> {
  return insertTable({
    name: '主表', startDate: '2026-09-01', maxWeek: 20, nodeCount: 12,
    timeJson: '[]', smartConfigJson: '', isDefault: 1, createdAt: 1000,
  })
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  useUndoStore.setState({ slot: null, redoSlot: null, batchDepth: 0, batchCaptured: false, restoring: false })
})

afterEach(async () => {
  await db.delete()
  localStorage.clear()
})

describe('redo 槽 (UndoManager 2026-09-21)', () => {
  it('undo 把撤回前库态挂 redo 槽; redo 恢复并把 redo 前库态回填 undo 槽 (对称)', async () => {
    const tableId = await seedBase()
    await insertCourse({
      groupId: 'g1', tableId, courseName: '高数', teacher: '', room: '', note: '', alias: '',
      day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16,
      type: 0 as const, color: '#FF000000', colorMode: 0 as const, ownTime: false,
      isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
    })
    expect((await db.courses.toArray()).length).toBe(1)

    // undo → 课没了, redo 槽有值 (撤回前库态)
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.count()).toBe(0)
    expect(useUndoStore.getState().canRedo()).toBe(true)
    expect(useUndoStore.getState().canUndo()).toBe(false)

    // redo → 课回来了, undo 槽回填 (redo 前库态 = 无课态)
    expect(await undoManager.redo()).toBe(true)
    expect(await db.courses.count()).toBe(1)
    expect(useUndoStore.getState().canUndo()).toBe(true)
    expect(useUndoStore.getState().canRedo()).toBe(false)

    // 再撤回 = 撤掉 redo 本身 (回到 redo 前的无课态) — reinsertForRedoSymmetry 语义
    expect(await undoManager.undo()).toBe(true)
    expect(await db.courses.count()).toBe(0)
  })

  it('正常写动作作废旧 redo (历史不分支)', async () => {
    await seedBase()
    await insertCourse({
      groupId: 'g1', tableId: 1, courseName: 'A', teacher: '', room: '', note: '', alias: '',
      day: 1, startNode: 1, step: 1, startWeek: 1, endWeek: 16,
      type: 0 as const, color: '#FF000000', colorMode: 0 as const, ownTime: false,
      isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
    })
    await undoManager.undo()
    expect(useUndoStore.getState().canRedo()).toBe(true)

    // 新写动作 → redo 立即作废
    await insertCourse({
      groupId: 'g2', tableId: 1, courseName: 'B', teacher: '', room: '', note: '', alias: '',
      day: 2, startNode: 1, step: 1, startWeek: 1, endWeek: 16,
      type: 0 as const, color: '#FF000000', colorMode: 0 as const, ownTime: false,
      isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
    })
    expect(useUndoStore.getState().canRedo()).toBe(false)
    expect(await undoManager.redo()).toBe(false)
  })

  it('restore 抑制期间 capture 不清 redo 也不写槽', async () => {
    await seedBase()
    useUndoStore.setState({ slot: null, redoSlot: null, restoring: true })
    await undoManager.capture('x')
    expect(useUndoStore.getState().slot).toBeNull()
    useUndoStore.setState({ restoring: false })
  })

  it('clear 双槽; 空 redo 时 redo() 返回 false', async () => {
    await seedBase()
    expect(await undoManager.redo()).toBe(false)
    useUndoStore.setState({ slot: null, redoSlot: null })
    undoManager.clear()
    expect(useUndoStore.getState().canUndo()).toBe(false)
    expect(useUndoStore.getState().canRedo()).toBe(false)
  })
})
