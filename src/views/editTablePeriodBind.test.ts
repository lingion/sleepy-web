/**
 * EditTableView v1.0.56 §5.3 换绑链 + §5.2 updatePeriodTableContent 同步
 * — Kotlin EditTableScreen 保存分支行为契约 (issue#40)。
 *
 * 行为契约 (EditTableScreen.kt:310-360 1:1):
 *  - pendingBind != null 且 != table.periodTableId → 保存前弹换绑确认; 确认才写
 *  - 换绑(非 null → 另一非 null) → bindPeriodTable(tid, targetId), 课程行零改动
 *  - 解绑(→ null) → bindPeriodTable(tid, null), 课程行零改动
 *  - 未绑定态 + 节次编辑 → updateTableRemappingCourses (原行为不变)
 *  - 已绑定态 + 节次编辑 → updatePeriodTableContent(同步绑定课表兼容列 + 全部 bound timetable)
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import {
  insertTable, insertCourse, bindPeriodTable, updatePeriodTableContent,
  getCourses, loadPeriodTables, insertPeriodTable, getTable,
} from '../data/repository'
import { useUndoStore } from '../data/undoStore'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import type { Table } from '../data/types'

function mkTable(name: string, overrides: Partial<Table> = {}): Promise<number> {
  return insertTable({
    name,
    isDefault: 0, periodTableId: null,
    timeJson: DEFAULT_TIME_JSON, smartConfigJson: '',
    startDate: '2026-09-07', nodeCount: 12, maxWeek: 20, createdAt: 0,
    ...overrides,
  })
}

function mkCourse(tableId: number, partial: Record<string, unknown> = {}) {
  return insertCourse({
    id: 0, groupId: 'g1', tableId, courseName: '测试课',
    teacher: '', room: '', note: '', alias: '',
    day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16,
    type: 0, color: '#FF6750A4', colorMode: 0,
    ownTime: false, isIrregularNode: false, isIrregularTime: false,
    startTime: '', endTime: '', credit: 0, level: 0,
    ...partial,
  } as never)
}

const PT_TIME = JSON.stringify([
  { node: 1, start: '08:30', end: '09:15' },
  { node: 2, start: '09:25', end: '10:10' },
  { node: 3, start: '10:30', end: '11:15' },
])

describe('EditTableView 换绑链 — bindPeriodTable 单向写, 课程行零改动', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
  })

  it('issue#40 §5.3: 换绑(→pt2)→课程行零改动; 课表 periodTableId 改成 pt2', async () => {
    const pt1 = await insertPeriodTable({ name: '原作息', nodesPerDay: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: '', createdAt: 0, updatedAt: 0 })
    const pt2 = await insertPeriodTable({ name: '新作息', nodesPerDay: 3, timeJson: PT_TIME, smartConfigJson: '', createdAt: 0, updatedAt: 0 })
    const tid = await mkTable('主表', { periodTableId: pt1 })
    await mkCourse(tid, { startNode: 5, step: 2 })
    const beforeCourses = await getCourses(tid)

    await bindPeriodTable(tid, pt2)

    const after = await getTable(tid)
    expect(after?.periodTableId).toBe(pt2)
    const afterCourses = await getCourses(tid)
    expect(afterCourses.length).toBe(beforeCourses.length)
    expect(afterCourses[0].startNode).toBe(beforeCourses[0].startNode)
    expect(afterCourses[0].step).toBe(beforeCourses[0].step)
  })

  it('issue#40 §5.3: 解绑(→null)→课程行零改动; 课表 periodTableId=null', async () => {
    const pt = await insertPeriodTable({ name: '原作息', nodesPerDay: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: '', createdAt: 0, updatedAt: 0 })
    const tid = await mkTable('主表', { periodTableId: pt })
    await mkCourse(tid, { startNode: 3, step: 1 })

    await bindPeriodTable(tid, null)

    const after = await getTable(tid)
    expect(after?.periodTableId).toBeNull()
    const courses = await getCourses(tid)
    expect(courses[0].startNode).toBe(3)
    expect(courses[0].step).toBe(1)
  })

  it('issue#40 §5.2: updatePeriodTableContent 同步全部绑定课表兼容列 + 课程行零改动', async () => {
    const pt = await insertPeriodTable({ name: '共享作息', nodesPerDay: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: 'old', createdAt: 0, updatedAt: 0 })
    const tid1 = await mkTable('A', { periodTableId: pt })
    const tid2 = await mkTable('B', { periodTableId: pt })
    await mkCourse(tid1, { startNode: 5, step: 2 })
    await mkCourse(tid2, { startNode: 1, step: 1, courseName: 'B课' })

    const affected = await updatePeriodTableContent({
      id: pt, name: '共享作息', nodesPerDay: 3, timeJson: PT_TIME, smartConfigJson: 'new',
      createdAt: 0, updatedAt: 0,
    })
    expect(affected).toBe(2)

    // 作息表内容已改
    const updated = (await loadPeriodTables())[0]
    expect(updated.timeJson).toBe(PT_TIME)
    expect(updated.smartConfigJson).toBe('new')
    expect(updated.nodesPerDay).toBe(3)

    // 两个绑定课表兼容列被同步覆写
    const a = await getTable(tid1)
    const b = await getTable(tid2)
    expect(a?.timeJson).toBe(PT_TIME)
    expect(a?.nodeCount).toBe(3)
    expect(a?.smartConfigJson).toBe('new')
    expect(b?.timeJson).toBe(PT_TIME)

    // 课程行零改动
    const ac = await getCourses(tid1)
    const bc = await getCourses(tid2)
    expect(ac[0].startNode).toBe(5)
    expect(ac[0].step).toBe(2)
    expect(bc[0].startNode).toBe(1)
    expect(bc[0].step).toBe(1)
  })

  it('updatePeriodTableContent 未绑定作息表: 0 受影响, 课表零变化', async () => {
    const pt = await insertPeriodTable({ name: '无绑定', nodesPerDay: 12, timeJson: DEFAULT_TIME_JSON, smartConfigJson: '', createdAt: 0, updatedAt: 0 })
    const tid = await mkTable('独立表', { periodTableId: null })
    const before = await getTable(tid)

    const affected = await updatePeriodTableContent({
      id: pt, name: '无绑定', nodesPerDay: 3, timeJson: PT_TIME, smartConfigJson: '',
      createdAt: 0, updatedAt: 0,
    })
    expect(affected).toBe(0)
    const after = await getTable(tid)
    expect(after?.timeJson).toBe(before?.timeJson)
  })
})
