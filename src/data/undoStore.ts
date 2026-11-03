/**
 * 多步撤回 — UndoManager.kt (v7.10.16w 撤回锚定修复版 + ref sleepy#240 多步深度) 1:1
 *
 * Android 端契约:
 * - ref sleepy#240 (Android 2026-10): 单槽 → undoStack/redoStack 双栈 (末元素=栈顶),
 *   maxDepth 深度钳制: -1 无限 / 0 禁用捕获 / N 保留最近 N 级; applyMaxDepth 即时裁剪。
 *   旧「单槽语义」在 maxDepth=1 时与本实现完全等价。
 * - 复合动作(如导入)入口先 beginBatch, 批内只保首个快照=动作前时点
 * - v7.10.16w 撤回锚定: 批内首拍原本只在"槽为空"时生效 — 上一动作(如复制课表)
 *   留下的旧快照会被本批误当成动作起点, 撤回跳过本动作直接回到更早, 副本被连根拔。
 *   现在 beginBatch 时把旧快照过期(batchCaptured 0→1 复位): 本动作首拍必落到
 *   "本动作开始前"的库态 — 每个用户动作的撤回点 = 该动作自己开始前, 动作链上不跳步。
 * - restoring 抑制恢复动作自身的捕获, 防止 undo 生成新的 undo
 * - 快照含 defaultTableId: 撤回恢复默认表指向 (isDefault 随快照回滚)
 * - v8 扩展: 快照覆盖 period_tables — 恢复顺序 periodTables→time_tables→courses
 * - App 进程被杀快照即失效(不落盘) — web 同为内存态
 * - 2026-09-21 定令 (Android UndoManager.kt:35-97): 单级 redo — 撤回把「撤回前库态」
 *   挂进 redoSlot (recordRedo), 取消撤回 pollRedo 取走并把「redo 前库态」重挂回 slot
 *   (reinsertForRedoSymmetry); 任何正常写动作 capture 清空 redo (历史不分支);
 *   restoring 抑制路径不清 redo。
 *
 * Web 端实现: Zustand store 存双栈全量快照 (数据库全量 {periodTables, tables, courses} 深拷贝)。
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
  /** undo 栈 (末元素=栈顶) — Android UndoManager.undoStack (ref #240) 同名同义 */
  undoStack: Snapshot[]
  /** redo 栈 (末元素=栈顶) — Android UndoManager.redoStack 同名同义 */
  redoStack: Snapshot[]
  /** 深度钳制: -1 无限 / 0 禁用捕获 / N 保留最近 N 级 — Android maxDepth (DEFAULT_MAX_DEPTH=5) */
  maxDepth: number
  batchDepth: number
  /** 本批首拍是否已落: 批内多次 capture 只保第一次 — 锚定本批开始前(非旧快照) */
  batchCaptured: boolean
  /** 恢复中抑制捕获 — Android UndoManager.restoring 同名 */
  restoring: boolean
  /** 撤回按钮显隐 — Android UndoManager.hasSnapshot / ScheduleRepository.canUndo 同义 */
  canUndo: () => boolean
  /** 取消撤回显隐 — Android UndoManager.hasRedoSnapshot 同义 */
  canRedo: () => boolean
}

interface UndoActions {
  /** 捕获动作前快照 — 所有 14 写方法入口调用 */
  capture: (label: string) => Promise<void>
  /** 复合动作入口 (导入等) — 0→1 边界作废旧快照锚点 */
  beginBatch: () => void
  /** 复合动作出口 */
  endBatch: () => Promise<void>
  /** 撤回: poll 取走快照恢复; 「撤回前库态」压 redo 栈 (recordRedo) */
  undo: () => Promise<boolean>
  /** 取消撤回: pollRedo 取走恢复; 「redo 前库态」重压回 undo 栈 (reinsertForRedoSymmetry) */
  redo: () => Promise<boolean>
  /** 深度变更即时生效 — Android UndoManager.applyMaxDepth: 0 清空双栈, >0 双栈裁剪, <0 仅放开 */
  applyMaxDepth: (v: number) => void
  /** 双栈清空 — Android UndoManager.clear 同义 */
  clear: () => void
}

/** Android UndoManager.trimmed(): maxDepth>0 时保留最近 maxDepth 个 (栈尾=最新) */
function trimmed(stack: Snapshot[], maxDepth: number): Snapshot[] {
  return maxDepth > 0 ? stack.slice(-maxDepth) : stack
}

async function takeSnapshot(): Promise<Snapshot> {
  return {
    periodTables: await db.periodTables.toArray(),
    tables: await db.timetables.toArray(),
    courses: await db.courses.toArray(),
  }
}

async function restore(snap: Snapshot): Promise<void> {
  // isDefault 是 Table 字段本身 — 全量重插即恢复默认表指向 (Android setDefault 同效)
  // 恢复顺序与 Android ScheduleRepository.restore 1:1: periodTables → time_tables → courses
  await db.transaction('rw', db.periodTables, db.timetables, db.courses, async () => {
    await db.periodTables.clear()
    await db.periodTables.bulkPut(snap.periodTables)
    await db.timetables.clear()
    await db.timetables.bulkPut(snap.tables)
    await db.courses.clear()
    await db.courses.bulkPut(snap.courses)
  })
}

export const useUndoStore = create<UndoState & UndoActions>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxDepth: 5,
  batchDepth: 0,
  batchCaptured: false,
  restoring: false,

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  capture: async (_label) => {
    const { restoring, batchDepth, batchCaptured, maxDepth } = get()
    if (restoring) return
    // 深度 0 = 禁用撤回捕获 (Android: 先清历史再拒绝捕获)
    if (maxDepth === 0) {
      if (get().undoStack.length || get().redoStack.length) get().clear()
      return
    }
    // 新用户动作 = 历史从 redo 分叉 — redo 立即作废 UndoManager.kt:66-68
    // (Android 顺序: restoring 后无条件清 redo, 再进批判)
    set({ redoStack: [] })
    if (batchDepth > 0) {
      if (batchCaptured) return // 批内已有本动作快照 — 保动作链起点
      set({ batchCaptured: true })
    }
    set({ undoStack: trimmed([...get().undoStack, await takeSnapshot()], maxDepth) })
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
    // ScheduleRepository.restoreLastSnapshot 1:1: poll → 当前库态压 redo → 抑制下恢复
    const { undoStack, maxDepth } = get()
    const snap = undoStack[undoStack.length - 1]
    if (!snap) return false
    const redoSnap = await takeSnapshot()
    set({ undoStack: undoStack.slice(0, -1), restoring: true })
    try {
      await restore(snap)
    } finally {
      set({ restoring: false })
    }
    set({ redoStack: trimmed([...get().redoStack, redoSnap], maxDepth) })
    return true
  },

  redo: async () => {
    // ScheduleRepository.redoLastUndo 1:1: pollRedo → 当前库态回填 undo 栈 → 抑制下恢复
    const { redoStack, maxDepth } = get()
    const snap = redoStack[redoStack.length - 1]
    if (!snap) return false
    const undoSnap = await takeSnapshot()
    set({ redoStack: redoStack.slice(0, -1), restoring: true })
    try {
      await restore(snap)
    } finally {
      set({ restoring: false })
    }
    // reinsertForRedoSymmetry: redo 也是一次"回到过去", 再点撤回应能撤掉它本身
    set({ undoStack: trimmed([...get().undoStack, undoSnap], maxDepth) })
    return true
  },

  applyMaxDepth: (v) => {
    // Android applyMaxDepth: 0 清空双栈 (禁用), >0 双栈各裁到 N, <0 仅放开上限
    set({ maxDepth: v })
    if (v === 0) {
      set({ undoStack: [], redoStack: [] })
    } else if (v > 0) {
      set({ undoStack: trimmed(get().undoStack, v), redoStack: trimmed(get().redoStack, v) })
    }
  },

  clear: () => {
    set({ undoStack: [], redoStack: [] })
  },
}))

/** 供非 React 调用方 (DAO) 使用的命令式句柄 */
export const undoManager = {
  capture: (label: string) => useUndoStore.getState().capture(label),
  beginBatch: () => useUndoStore.getState().beginBatch(),
  endBatch: () => useUndoStore.getState().endBatch(),
  undo: () => useUndoStore.getState().undo(),
  redo: () => useUndoStore.getState().redo(),
  applyMaxDepth: (v: number) => useUndoStore.getState().applyMaxDepth(v),
  clear: () => useUndoStore.getState().clear(),
}
