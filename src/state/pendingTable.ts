/**
 * 新建课表的"待保存"会话 — MainActivity.kt:237 pendingNewTableId / previousDefaultTableId 同构。
 *
 * Android 动线 (MainActivity:311-317 / 432-438 / 529): 任一「新建课表」入口都不是直接建一张
 * 空表留在库里, 而是 createEmptyTable(commitSelection=false) → 记住原默认表 → 跳 EditTable;
 * 用户没保存就返回 → discardNewTable 删掉这张表并把选中落回原表 (MainActivity:271-277 BackHandler
 * 里先于 popOverlay 执行); 保存或删除 → 清空待保存标记。EditTableScreen 在 pending 期间隐藏删除键
 * (AddEditTableScreen.kt:312) — 未保存的新表没有"删除"可言, 返回即丢弃。
 */

import { create } from 'zustand'
import { createEmptyTable, discardNewTable, getDefaultTable } from '../data/repository'

interface PendingTableState {
  pendingId: number | null
  previousId: number | null
  begin: (pendingId: number, previousId: number | null) => void
  clear: () => void
}

export const usePendingTable = create<PendingTableState>((set) => ({
  pendingId: null,
  previousId: null,
  begin: (pendingId, previousId) => set({ pendingId, previousId }),
  clear: () => set({ pendingId: null, previousId: null }),
}))

/** 任一「新建课表」入口的统一动线: 建空表(不切选中) + 记住原默认表, 返回新表 id。 */
export async function beginNewTable(): Promise<number> {
  const previousId = (await getDefaultTable())?.id ?? null
  const newId = await createEmptyTable(false)
  usePendingTable.getState().begin(newId, previousId)
  return newId
}

/** 用户没保存就退出 → 丢弃新表并落回原表; 已保存/已删除 → 只清标记。
 *  返回 promise 供测试 await; 事件处理器里调用方用 void 忽略。 */
export function abandonPendingTable(): Promise<void> {
  const { pendingId, previousId, clear } = usePendingTable.getState()
  clear()
  if (pendingId == null) return Promise.resolve()
  return discardNewTable(pendingId, previousId)
}
