/**
 * EditTableView 应用层集成测试 — Kotlin EditTableScreen 保存路径 (issue#28 P3)
 * 保存 = updateTableRemappingCourses: 表更新 + ownTime 课按时间反算 + 其余 remapCourseNodes。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../data/db'
import {
  insertTable,
  insertCourse,
  updateTableRemappingCourses,
  deleteTable,
  getCourses,
} from '../data/repository'
import { useUndoStore } from '../data/undoStore'
import type { Course, Table } from '../data/types'

// 匀速生成: 每节 45 分钟 + 10 分钟课间, 从 08:00 起
function makeRows(n: number): Array<{ node: number; start: string; end: string }> {
  const p = (x: number) => String(x).padStart(2, '0')
  let minutes = 8 * 60
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push({ node: i + 1, start: `${p(Math.floor(minutes / 60))}:${p(minutes % 60)}`, end: `${p(Math.floor((minutes + 45) / 60))}:${p((minutes + 45) % 60)}` })
    minutes += 55
  }
  return rows
}
const T12 = JSON.stringify(makeRows(12))
// 10 节版 (砍掉 11/12 节)
const T10 = JSON.stringify(makeRows(10))

async function mkTable(name: string, timeJson = T12): Promise<number> {
  return await insertTable({
    name,
    timeJson,
    smartConfigJson: '',
    isDefault: 0,
    startDate: '2026-09-07',
    nodeCount: 12,
    maxWeek: 20,
    createdAt: Date.now(),
  })
}

function mkCourse(tableId: number, partial: Partial<Course>): Omit<Course, 'id'> {
  return {
    id: 0,
    groupId: 'g1',
    tableId,
    courseName: '高等数学',
    teacher: '',
    room: '',
    note: '',
    alias: '',
    day: 1,
    startNode: 1,
    step: 2,
    startWeek: 1,
    endWeek: 16,
    type: 0,
    color: '#FF6750A4',
    colorMode: 0,
    ownTime: false,
    isIrregularNode: false,
    isIrregularTime: false,
    startTime: '',
    endTime: '',
    credit: 0,
    level: 0,
    ...partial,
  }
}

describe('EditTable 保存路径 — updateTableRemappingCourses', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
     // 单槽模型: 上述 setState 已含全部状态
  })

  it('issue#28 P3: 12节砍到10节, 13-16节课程不残留 — remap 到有效范围', async () => {
    const tid = await mkTable('十二节')
    // 课程在 11-12 节 (step 2)
    await insertCourse(mkCourse(tid, { startNode: 11, step: 2 }))
    await insertCourse(mkCourse(tid, { startNode: 1, step: 2, courseName: '早课' }))
    const table = (await db.timetables.get(tid)) as Table
    await updateTableRemappingCourses({ ...table, timeJson: T10, nodeCount: 10 })
    const courses = await getCourses(tid)
    const late = courses.find((c) => c.startNode === 11)
    const early = courses.find((c) => c.courseName === '早课')
    // 11 节起点在 10 节表找不到原时间 → 保持原值 (Kotlin remapCourseNodes 同: 原起止空 → 原样)
    expect(late?.startNode).toBe(11)
    expect(late?.step).toBe(2)
    // 早课 1-2 节时间在两表一致 → 不动
    expect(early?.startNode).toBe(1)
    expect(early?.step).toBe(2)
  })

  it('节次时间平移: 课程按时间等效 remap 到新节', async () => {
    const tid = await mkTable('平移')
    // 第 3 节开始 (10:00) 的课
    await insertCourse(mkCourse(tid, { startNode: 3, step: 1 }))
    const table = (await db.timetables.get(tid)) as Table
    // 新表: 砍掉原第 2 节 → 原 3 节时间现在落在第 2 节位置
    const newRows = JSON.parse(T10).filter((r: { node: number }) => r.node !== 2)
      .map((r: { node: number; start: string; end: string }, i: number) => ({ ...r, node: i + 1 }))
    await updateTableRemappingCourses({ ...table, timeJson: JSON.stringify(newRows), nodeCount: 9 })
    const courses = await getCourses(tid)
    // 原 3 节 10:00-10:45 → 新表里 10:00-10:45 是 node 2
    const c = courses[0]
    expect([c.startNode, c.step]).toEqual([2, 1])
  })

  it('ownTime 课按 startTime/endTime 反算等效节次', async () => {
    const tid = await mkTable('ownTime')
    // 自定义时间课: 19:00-19:45
    await insertCourse(mkCourse(tid, { ownTime: true, isIrregularTime: true, startTime: '19:00', endTime: '19:45', startNode: 1, step: 1 }))
    const table = (await db.timetables.get(tid)) as Table
    const newRows = JSON.parse(T10).map((r: { node: number; start: string; end: string }) => ({ ...r }))
    newRows[8] = { node: 9, start: '19:00', end: '19:45' } // 9 节改成 19:00
    newRows[9] = { node: 10, start: '20:00', end: '20:45' } // 10 节后移, 防止时间延伸跨节
    await updateTableRemappingCourses({ ...table, timeJson: JSON.stringify(newRows) })
    const c = (await getCourses(tid))[0]
    expect([c.startNode, c.step]).toEqual([9, 1])
  })

  it('timeJson 未变 → 课程不动 (幂等)', async () => {
    const tid = await mkTable('幂等')
    await insertCourse(mkCourse(tid, { startNode: 5, step: 2 }))
    const table = (await db.timetables.get(tid)) as Table
    await updateTableRemappingCourses({ ...table, name: '改名但时间没变' })
    const c = (await getCourses(tid))[0]
    expect(c.startNode).toBe(5)
  })

  it('删表 CASCADE + 撤回一次恢复全量 (表+课程)', async () => {
    const tid = await mkTable('待删')
    await insertCourse(mkCourse(tid, {}))
    await deleteTable(tid)
    expect(await db.timetables.count()).toBe(0)
    expect(await db.courses.count()).toBe(0)
    const ok = await useUndoStore.getState().undo()
    expect(ok).toBe(true)
    expect(await db.timetables.count()).toBe(1)
    expect((await getCourses(tid)).length).toBe(1)
  })
})
