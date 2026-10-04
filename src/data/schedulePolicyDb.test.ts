/**
 * 甲案 §3.1-§3.3/§7 落库契约 (ScheduleConflictFlowContractTest 的 DB 侧对位):
 * executePolicyAndSave 三分支 + 全局唯一名顺延 + UndoManager 单批撤回 + getTablesBoundTo。
 * 真实 Dexie (fake-indexeddb)。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './db'
import {
  executePolicyAndSave,
  getTablesBoundTo,
  insertPeriodTable,
  insertTable,
  bindPeriodTable,
} from './repository'
import { useUndoStore, undoManager } from './undoStore'
import type { Table } from './types'

const T1 = '[{"node":1,"start":"08:00","end":"08:45"}]'
const T2 = '[{"node":1,"start":"08:30","end":"09:15"}]'

let ptId = 0
let tableA = 0
let tableB = 0

beforeEach(async () => {
  await db.delete()
  await db.open()
  useUndoStore.setState({ slot: null, redoSlot: null, batchDepth: 0, batchCaptured: false, restoring: false })
  ptId = await insertPeriodTable({
    name: '共享作息', nodesPerDay: 1, timeJson: T1, smartConfigJson: '', createdAt: 1, updatedAt: 1,
  })
  tableA = await insertTable({
    name: '课表A', startDate: '2026-09-01', maxWeek: 20, nodeCount: 12,
    timeJson: T1, smartConfigJson: '', isDefault: 1, createdAt: 1,
  })
  tableB = await insertTable({
    name: '课表B', startDate: '2026-09-01', maxWeek: 20, nodeCount: 12,
    timeJson: T1, smartConfigJson: '', isDefault: 0, createdAt: 2,
  })
  await bindPeriodTable(tableA, ptId)
  await bindPeriodTable(tableB, ptId)
})

afterEach(async () => {
  await db.delete()
  localStorage.clear()
})

function edited(tableId: number): Table {
  return {
    id: tableId, name: '课表A', startDate: '2026-09-01', maxWeek: 20,
    timeJson: T2, smartConfigJson: 'S', nodeCount: 1, isDefault: 0 as const, createdAt: 1,
  }
}
function draft() {
  return {
    id: ptId, name: '共享作息', nodesPerDay: 1, timeJson: T2,
    smartConfigJson: 'S', createdAt: 1, updatedAt: 1,
  }
}

describe('executePolicyAndSave 三分支 (ScheduleViewModel.kt:144-204)', () => {
  it('DETACH_COPY: 解绑 + 草稿写内置列; X 与其他绑定课表零改动', async () => {
    await executePolicyAndSave(tableA, edited(tableA), T2, 'S', 1, 'DETACH_COPY', draft())
    const a = await db.timetables.get(tableA)
    expect(a?.periodTableId ?? null).toBeNull()
    expect(a?.timeJson).toBe(T2)
    expect(a?.smartConfigJson).toBe('S')
    // X 零改动
    const x = await db.periodTables.get(ptId)
    expect(x?.timeJson).toBe(T1)
    // 课表B 零改动
    const b = await db.timetables.get(tableB)
    expect(b?.periodTableId).toBe(ptId)
    expect(b?.timeJson).toBe(T1)
  })

  it('CREATE_NEW: 唯一名顺延新建独立作息表 + 改绑; X 零改动', async () => {
    // 制造撞名: 已存在 "课表A" 作息表 → 顺延 "课表A2"
    await insertPeriodTable({
      name: '课表A', nodesPerDay: 1, timeJson: T1, smartConfigJson: '', createdAt: 3, updatedAt: 3,
    })
    await executePolicyAndSave(tableA, edited(tableA), T2, 'S', 1, 'CREATE_NEW', draft())
    const a = await db.timetables.get(tableA)
    expect(a?.timeJson).toBe(T2)
    const newPt = await db.periodTables.where('name').equals('课表A2').first()
    expect(newPt).toBeTruthy()
    expect(newPt!.timeJson).toBe(T2)
    expect(a?.periodTableId).toBe(newPt!.id)
    // X 零改动, 课表B 仍指 X
    expect((await db.periodTables.get(ptId))?.timeJson).toBe(T1)
    expect((await db.timetables.get(tableB))?.periodTableId).toBe(ptId)
  })

  it('SYNC: 草稿写回共享作息表, 保持绑定; 全部绑定课表读到新作息', async () => {
    await executePolicyAndSave(tableA, { ...edited(tableA), periodTableId: ptId }, T2, 'S', 1, 'SYNC', draft())
    const x = await db.periodTables.get(ptId)
    expect(x?.timeJson).toBe(T2)
    expect(x?.smartConfigJson).toBe('S')
    const a = await db.timetables.get(tableA)
    expect(a?.periodTableId).toBe(ptId)
    expect(a?.timeJson).toBe(T2)
    // 课表B: 保持绑定; 兼容列镜像同步新作息 (web 读路径 = 兼容列, updateBoundTableSettings §5.2)
    const b = await db.timetables.get(tableB)
    expect(b?.periodTableId).toBe(ptId)
    expect(b?.timeJson).toBe(T2)
  })

  it('§7 单撤回单元: 一次 undo 整步回退 (绑定关系+作息内容)', async () => {
    await executePolicyAndSave(tableA, edited(tableA), T2, 'S', 1, 'DETACH_COPY', draft())
    expect((await db.timetables.get(tableA))?.periodTableId ?? null).toBeNull()
    expect(await undoManager.undo()).toBe(true)
    const a = await db.timetables.get(tableA)
    expect(a?.periodTableId).toBe(ptId)
    expect(a?.timeJson).toBe(T1)
    expect(await db.periodTables.count()).toBe(1) // DETACH 不新建 — 撤回后仍只剩种子共享表
  })
})

describe('getTablesBoundTo (repoTablesBoundToCount)', () => {
  it('计数含当前表本身', async () => {
    expect(await getTablesBoundTo(ptId)).toBe(2)
    await bindPeriodTable(tableB, null)
    expect(await getTablesBoundTo(ptId)).toBe(1)
  })
})
