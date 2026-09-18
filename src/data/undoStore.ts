/**
 * 单级撤回 — UndoManager.kt (v7.10.16w 撤回锚定修复版) 1:1
 *
 * Android 端契约:
 * - 单槽语义: capture 覆盖槽, poll 取走并清空 — 撤回不可再撤回 (无 redo)
 * - 复合动作(如导入)入口先 beginBatch, 批内只保首个快照=动作前时点
 * - v7.10.16w 撤回锚定: 批内首拍原本只在"槽为空"时生效 — 上一动作(如复制课表)
 *   留下的旧快照会被本批误当成动作起点, 撤回跳过本动作直接回到更早, 副本被连根拔。
 *   现在 beginBatch 时把旧快照过期(batchCaptured 0→1 复位): 本动作首拍必落到
 *   "本动作开始前"的库态 — 每个用户动作的撤回点 = 该动作自己开始前, 动作链上不跳步。
 * - restoring 抑制恢复动作自身的捕获, 防止 undo 生成新的 undo
 * - 快照含 defaultTableId: 撤回恢复默认表指向 (isDefault 随快照回滚)
 * - v8 扩展: 快照覆盖 period_tables — 恢复顺序 periodTables→time_tables→courses
 * - App 进程被杀快照即失效(不落盘) — web 同为内存态
 *
 * Web 端实现: Zustand store 存单槽全量快照 (数据库全量 {periodTables, tables, courses} 深拷贝)。
 * 数据量级 (一张表几百门课) 全量快照开销可忽略, 与 Android UndoManager 语义一致。
 */

import { create } from 'zustand'
import { db } from './db'
import type { Course, PeriodTable, Table } from './types'

/** 全量数据库快照 */
interface Snapshot {
  periodTables: PeriodTable[]
  tables: Table[]
  courses: Course[]
}

interface UndoState {
  /** 单槽 — Android UndoManager.slot 同名同义 */
  slot: Snapshot | null
  batchDepth: number
  /** 本批首拍是否已落: 批内多次 capture 只保第一次 — 锚定本批开始前(非旧快照) */
  batchCaptured: boolean
  /** 恢复中抑制捕获 — Android UndoManager.restoring 同名 */
  restoring: boolean
  /** 撤回按钮显隐 — Android UndoManager.hasSnapshot / ScheduleRepository.canUndo 同义 */
  canUndo: () => boolean
}

interface UndoActions {
  /** 捕获动作前快照 — 所有 14 写方法入口调用 */
  capture: (label: string) => Promise<void>
  /** 复合动作入口 (导入等) — 0→1 边界作废旧快照锚点 */
  beginBatch: () => void
  /** 复合动作出口 */
  endBatch: () => Promise<void>
  /** 撤回: poll 取走快照恢复 — 单级语义, 不可再撤回 */
  undo: () => Promise<boolean>
}

export const useUndoStore = create<UndoState & UndoActions>((set, get) => ({
  slot: null,
  batchDepth: 0,
  batchCaptured: false,
  restoring: false,

  canUndo: () => get().slot !== null,

  capture: async (_label) => {
    const { restoring, batchDepth, batchCaptured } = get()
    if (restoring) return
    if (batchDepth > 0) {
      if (batchCaptured) return // 批内已有本动作快照 — 保动作链起点
      set({ batchCaptured: true })
    }
    const snapshot: Snapshot = {
      periodTables: await db.periodTables.toArray(),
      tables: await db.timetables.toArray(),
      courses: await db.courses.toArray(),
    }
    set({ slot: snapshot })
  },

  beginBatch: () => {
    const depth = get().batchDepth + 1
    // 批边界 = 新用户动作开始 — 旧动作的快照对新动作是过期锚点。
    // 若真要嵌套批(当前无此用法), 内层 begin 不清 batchCaptured(只在 0→1 清)。
    set({ batchDepth: depth, batchCaptured: depth === 1 ? false : get().batchCaptured })
  },

  endBatch: async () => {
    set({ batchDepth: Math.max(0, get().batchDepth - 1) })
  },

  undo: async () => {
    const { slot } = get()
    if (!slot) return false
    set({ restoring: true })
    try {
      // isDefault 是 Table 字段本身 — 全量重插即恢复默认表指向 (Android setDefault 同效)
      // 恢复顺序与 Android ScheduleRepository.restore 1:1: periodTables → time_tables → courses
      await db.transaction('rw', db.periodTables, db.timetables, db.courses, async () => {
        await db.periodTables.clear()
        await db.periodTables.bulkPut(slot.periodTables)
        await db.timetables.clear()
        await db.timetables.bulkPut(slot.tables)
        await db.courses.clear()
        await db.courses.bulkPut(slot.courses)
      })
    } finally {
      set({ restoring: false, slot: null })
    }
    return true
  },
}))

/** 供非 React 调用方 (DAO) 使用的命令式句柄 */
export const undoManager = {
  capture: (label: string) => useUndoStore.getState().capture(label),
  beginBatch: () => useUndoStore.getState().beginBatch(),
  endBatch: () => useUndoStore.getState().endBatch(),
  undo: () => useUndoStore.getState().undo(),
}
