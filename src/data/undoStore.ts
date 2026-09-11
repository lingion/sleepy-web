/**
 * Undo/Redo 状态 + 14 写方法统一 captureForUndo — ScheduleRepository.kt 1:1
 *
 * Android 端契约:
 * - 复合动作(如导入)入口先 beginBatch, 批内只保首个快照=动作前时点
 * - 单次动作入口直接 captureForUndo (批外)
 * - restoreLastSnapshot 撤回最近一次动作
 *
 * Web 端实现: Zustand store 存快照栈 (数据库全量 {tables, courses} 深拷贝)。
 * 数据量级 (一张表几百门课) 全量快照开销可忽略, 与 Android UndoManager 语义一致。
 */

import { create } from 'zustand'
import { db } from './db'
import type { Course, Table } from './types'

/** 全量数据库快照 */
interface Snapshot {
  tables: Table[]
  courses: Course[]
}

interface UndoState {
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  batchDepth: number
  lastLabel: string | null
  canUndo: () => boolean
  canRedo: () => boolean
}

interface UndoActions {
  /** 捕获动作前快照 — 所有 14 写方法入口调用 */
  capture: (label: string) => Promise<void>
  /** 复合动作入口 (导入等) */
  beginBatch: () => void
  /** 复合动作出口 */
  endBatch: () => Promise<void>
  /** 撤回: 弹栈恢复, 当前态压入 redo */
  undo: () => Promise<boolean>
  /** 重做 */
  redo: () => Promise<boolean>
}

export const useUndoStore = create<UndoState & UndoActions>((set, get) => ({
  undoStack: [],
  redoStack: [],
  batchDepth: 0,
  lastLabel: null,

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  capture: async (label) => {
    const { batchDepth, undoStack } = get()
    // 批内只保首个快照=动作前时点 (Android beginBatch 契约)
    if (batchDepth > 0 && undoStack.length > 0 && get().lastLabel === label) return
    const snapshot: Snapshot = {
      tables: await db.timetables.toArray(),
      courses: await db.courses.toArray(),
    }
    set({
      undoStack: [...undoStack, snapshot],
      redoStack: [], // 新动作清空 redo (Android 同)
      lastLabel: label,
    })
  },

  beginBatch: () => {
    set({ batchDepth: get().batchDepth + 1 })
  },

  endBatch: async () => {
    set({ batchDepth: Math.max(0, get().batchDepth - 1) })
  },

  undo: async () => {
    const { undoStack, redoStack } = get()
    if (undoStack.length === 0) return false
    const snapshot = undoStack[undoStack.length - 1]
    const current: Snapshot = {
      tables: await db.timetables.toArray(),
      courses: await db.courses.toArray(),
    }
    await db.transaction('rw', db.timetables, db.courses, async () => {
      await db.timetables.clear()
      await db.timetables.bulkPut(snapshot.tables)
      await db.courses.clear()
      await db.courses.bulkPut(snapshot.courses)
    })
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
      lastLabel: null,
    })
    return true
  },

  redo: async () => {
    const { undoStack, redoStack } = get()
    if (redoStack.length === 0) return false
    const snapshot = redoStack[redoStack.length - 1]
    const current: Snapshot = {
      tables: await db.timetables.toArray(),
      courses: await db.courses.toArray(),
    }
    await db.transaction('rw', db.timetables, db.courses, async () => {
      await db.timetables.clear()
      await db.timetables.bulkPut(snapshot.tables)
      await db.courses.clear()
      await db.courses.bulkPut(snapshot.courses)
    })
    set({
      undoStack: [...undoStack, current],
      redoStack: redoStack.slice(0, -1),
      lastLabel: null,
    })
    return true
  },
}))

/** 供非 React 调用方 (DAO) 使用的命令式句柄 */
export const undoManager = {
  capture: (label: string) => useUndoStore.getState().capture(label),
  beginBatch: () => useUndoStore.getState().beginBatch(),
  endBatch: () => useUndoStore.getState().endBatch(),
  undo: () => useUndoStore.getState().undo(),
  redo: () => useUndoStore.getState().redo(),
}
