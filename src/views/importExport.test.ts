/**
 * ImportView / ExportView 应用层集成测试 — Kotlin ImportSheet.kt applyImportPreview 行为基准
 * 不挂 React (jsdom 之外), 直接走 applyImportPreview 等价核心逻辑:
 * parse → preview(conflict 计算) → 5 模式落库 → 撤回批边界。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../data/db'
import {
  insertTable,
  getCourses,
  getTable,
  insertCoursesKeepingGroups,
  insertCourses,
  replaceCoursesKeepingGroups,
  setDefault,
  getDefaultTable,
} from '../data/repository'
import { useUndoStore } from '../data/undoStore'
import { parseSchedule } from '../domain/import/scheduleParser'
import { exportWakeUpShareText, exportIcs, exportWakeUpJson } from '../domain/import/scheduleExporter'
import type { ParsedCourse } from '../domain/import/sleepyNativeParser'
import type { Course } from '../data/types'

// ── 被测核心: 与 ImportView.tsx 相同语义的最小复现 (避免 jsdom 依赖) ─────────

function coursesConflict(a: Course | ParsedCourse, b: Course | ParsedCourse): boolean {
  if (a.day !== b.day) return false
  if (a.endWeek < b.startWeek || b.endWeek < a.startWeek) return false
  const aEnd = a.startNode + a.step - 1
  const bEnd = b.startNode + b.step - 1
  return a.startNode <= bEnd && b.startNode <= aEnd
}

function toCourse(pc: ParsedCourse, tableId: number): Course {
  return {
    id: 0,
    groupId: pc.groupId,
    tableId,
    courseName: pc.courseName,
    teacher: pc.teacher,
    room: pc.room,
    note: pc.note,
    alias: pc.alias,
    day: pc.day,
    startNode: pc.startNode,
    step: pc.step,
    startWeek: pc.startWeek,
    endWeek: pc.endWeek,
    type: pc.type as Course['type'],
    color: pc.color,
    colorMode: 0,
    ownTime: pc.ownTime,
    isIrregularNode: false,
    isIrregularTime: pc.ownTime,
    startTime: pc.startTime,
    endTime: pc.endTime,
    credit: 0,
    level: 0,
  }
}

async function makeTable(name: string): Promise<number> {
  return await insertTable({
    name,
    timeJson: JSON.stringify(
      Array.from({ length: 12 }, (_, i) => ({
        node: i + 1,
        start: `08:${String(i * 50 % 60).padStart(2, '0')}`,
        end: `08:${String(i * 50 % 60).padStart(2, '0')}`,
      })),
    ),
    smartConfigJson: '',
    isDefault: 0,
    startDate: '2026-09-07',
    nodeCount: 12,
    maxWeek: 20,
    createdAt: Date.now(),
  })
}

// WakeUp 分享文本 fixture (两门课, 周一1-2节 + 周三3-4节)
function wakeUpShare(name: string): string {
  const courses = [
    { name: '高等数学', teacher: '张三', position: 'A101', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '' },
    { name: '大学英语', teacher: '李四', position: 'B202', day: 3, startNode: 3, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '' },
  ]
  const detail = encodeURIComponent(JSON.stringify(courses))
  return `【来自WakeUp课程表】\n课程分享:\n{"name":"${name}","startDate":"2026-09-07","courseDetailJson":"${detail}"}`
}

describe('ImportView 应用层 — 预览冲突计算', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
     // 单槽模型: 上述 setState 已含全部状态
  })

  it('同 day + 周次重叠 + 节次重叠 = 冲突; day 不同不冲突', () => {
    type Probe = Pick<ParsedCourse, 'day' | 'startNode' | 'step' | 'startWeek' | 'endWeek'>
    const a: Probe = { day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16 }
    const b: Probe = { day: 1, startNode: 2, step: 2, startWeek: 1, endWeek: 16 }
    const c: Probe = { day: 2, startNode: 1, step: 2, startWeek: 1, endWeek: 16 }
    const d: Probe = { day: 1, startNode: 1, step: 2, startWeek: 17, endWeek: 20 }
    const conflict = (x: Probe, y: Probe) =>
      coursesConflict(x as ParsedCourse, y as ParsedCourse)
    expect(conflict(a, b)).toBe(true) // 节次交叠 1-2 vs 2-3
    expect(conflict(a, c)).toBe(false) // day 不同
    expect(conflict(a, d)).toBe(false) // 周次不交 (1-16 vs 17-20)
  })

  it('parseSchedule WakeUp 分享 → 2 门课, 表名/起始周一致', async () => {
    const r = parseSchedule(wakeUpShare('我的课表'), 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.tableName).toBe('我的课表')
    expect(r.value.startDate).toBe('2026-09-07')
    expect(r.value.courses).toHaveLength(2)
    expect(r.value.courses[0].courseName).toBe('高等数学')
  })
})

describe('ImportView 应用层 — 5 应用模式落库', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
     // 单槽模型: 上述 setState 已含全部状态
  })

  it('ReplaceCurrent: 清空原课表灌入导入课, 表元数据更新', async () => {
    const tid = await makeTable('旧表')
    const r0 = parseSchedule(wakeUpShare('x'), tid)
    if (!r0.ok) throw r0.error
    await insertCoursesKeepingGroups([
      { ...toCourse(r0.value.courses[0], tid), courseName: '旧课' },
    ])
    const r = parseSchedule(wakeUpShare('新课表'), tid)
    if (!r.ok) throw r.error
    await replaceCoursesKeepingGroups(tid, r.value.courses.map((c) => toCourse(c, tid)))
    const courses = await getCourses(tid)
    expect(courses).toHaveLength(2)
    expect(courses.map((c) => c.courseName).sort()).toEqual(['大学英语', '高等数学'])
  })

  it('ImportAsNew: 新建表+落课+置默认; groupId 权威保留分区', async () => {
    const r = parseSchedule(wakeUpShare('导入A'), 0)
    if (!r.ok) throw r.error
    // WakeUp share 非 sleepy-v1 → groupIdsAuthoritative=false (Kotlin ParseResult 默认)
    expect(r.value.groupIdsAuthoritative).toBe(false)
    // 非 authoritative 走 insertCourses → repository.assignGroupIds 按名补组
    const newTableId = await makeTable('导入A')
    const { insertCourses, assignGroupIds } = await import('../data/repository')
    await insertCourses(assignGroupIds(r.value.courses.map((c) => toCourse(c, newTableId))))
    await setDefault(newTableId)
    const def = await getDefaultTable()
    expect(def?.id).toBe(newTableId)
    const courses = await getCourses(newTableId)
    expect(courses).toHaveLength(2)
    // 同一门课两节共享 groupId
    const math = courses.filter((c) => c.courseName === '高等数学')
    // 两门课名不同 → 各 1 节; groupId 非空
    expect(math).toHaveLength(1)
    expect(math[0].groupId).not.toBe('')
  })

  it('AppendNonConflict: 只追加无冲突课 (相对判定不连坐)', async () => {
    const tid = await makeTable('现有表')
    const r = parseSchedule(wakeUpShare('x'), tid)
    if (!r.ok) throw r.error
    const existing = await getCourses(tid)
    // 高数 (周一1-2) 已存在 → 只有大学英语可追加
    await insertCoursesKeepingGroups([{ ...toCourse(r.value.courses[0], tid) }])
    const existingAfter = await getCourses(tid)
    const clean = r.value.courses.filter(
      (incoming) => !existingAfter.some((c) => coursesConflict(incoming, c)),
    )
    expect(clean).toHaveLength(1)
    expect(clean[0].courseName).toBe('大学英语')
    await insertCourses(clean.map((c) => toCourse(c, tid)))
    expect(await getCourses(tid)).toHaveLength(2)
    expect(existing).toHaveLength(0)
  })

  it('AppendAll: 冲突也全量追加', async () => {
    const tid = await makeTable('目标表')
    const r = parseSchedule(wakeUpShare('x'), tid)
    if (!r.ok) throw r.error
    await insertCoursesKeepingGroups([toCourse(r.value.courses[0], tid)]) // 高数占位
    await insertCourses(r.value.courses.map((c) => toCourse(c, tid))) // 全量再灌
    expect(await getCourses(tid)).toHaveLength(3)
  })

  it('AppendAsNew: 老课+新课合并落新表 (并集)', async () => {
    const tid = await makeTable('老表')
    const r = parseSchedule(wakeUpShare('x'), tid)
    if (!r.ok) throw r.error
    await insertCoursesKeepingGroups([toCourse(r.value.courses[0], tid)]) // 老课: 高数
    const oldCourses = await getCourses(tid)
    const newTableId = await makeTable('合并表')
    const keptOld = oldCourses.map((c) => ({ ...c, id: 0, tableId: newTableId }))
    const keptIncoming = r.value.courses.map((c) => toCourse(c, newTableId))
    await insertCoursesKeepingGroups([...keptOld, ...keptIncoming])
    expect(await getCourses(newTableId)).toHaveLength(3) // 1 老课 + 2 导入
  })

  it('导入是复合动作: 批内多写只保首个快照, undo 一次回退到导入前', async () => {
    const tid = await makeTable('撤回表')
    const r = parseSchedule(wakeUpShare('x'), tid)
    if (!r.ok) throw r.error
    const undo = useUndoStore.getState()
    undo.beginBatch()
    try {
      await replaceCoursesKeepingGroups(tid, r.value.courses.map((c) => toCourse(c, tid)))
      await insertCourses(r.value.courses.map((c) => toCourse(c, tid)))
    } finally {
      await undo.endBatch()
    }
    expect(useUndoStore.getState().slot).not.toBeNull() // 批内只保首快照 (单槽)
    const didUndo = await useUndoStore.getState().undo()
    expect(didUndo).toBe(true)
    expect(await getCourses(tid)).toHaveLength(0) // 回到导入前 (空表)
  })
})

describe('ImportView 应用层 — 导出↔导入往返', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('exportWakeUpShareText → parseSchedule 闭环: 课程守恒', async () => {
    const tid = await makeTable('往返表')
    const r1 = parseSchedule(wakeUpShare('源表'), tid)
    if (!r1.ok) throw r1.error
    await insertCoursesKeepingGroups(r1.value.courses.map((c) => toCourse(c, tid)))
    const table = await getTable(tid)
    const courses = await getCourses(tid)
    const text = exportWakeUpShareText(
      { id: tid, name: table!.name, startDate: table!.startDate, maxWeek: table!.maxWeek, nodesPerDay: table!.nodeCount, timeJson: table!.timeJson, color: '#FF6750A4' },
      courses.map((c) => ({ ...c })),
    )
    const r2 = parseSchedule(text, tid)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.value.courses).toHaveLength(courses.length)
    expect(r2.value.courses.map((c) => c.courseName).sort()).toEqual(courses.map((c) => c.courseName).sort())
  })

  it('exportWakeUpJson → parseSchedule 闭环', async () => {
    const tid = await makeTable('JSON往返')
    const r1 = parseSchedule(wakeUpShare('源'), tid)
    if (!r1.ok) throw r1.error
    const courses = r1.value.courses.map((c) => toCourse(c, tid))
    const json = exportWakeUpJson(
      { id: tid, name: 't', startDate: '2026-09-07', maxWeek: 20, nodesPerDay: 12, timeJson: '', color: '#FF6750A4' },
      courses.map((c, i) => ({ ...c, id: i + 1 })),
    )
    const r2 = parseSchedule(json, tid)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.value.courses).toHaveLength(2)
  })

  it('exportIcs → parseSchedule 闭环: ICS 走 VEVENT 路径', async () => {
    const tid = await makeTable('ICS往返')
    const r1 = parseSchedule(wakeUpShare('源'), tid)
    if (!r1.ok) throw r1.error
    const ics = exportIcs(
      { id: tid, name: 'ics表', startDate: '2026-09-07', maxWeek: 20, nodesPerDay: 12, timeJson: '', color: '#FF6750A4' },
      r1.value.courses.map((c, i) => ({ ...toCourse(c, tid), id: i + 1 })),
    )
    const r2 = parseSchedule(ics, tid)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.value.courses.length).toBeGreaterThanOrEqual(2)
    for (const c of r2.value.courses) {
      expect(c.day).toBeGreaterThanOrEqual(1)
      expect(c.day).toBeLessThanOrEqual(7)
    }
  })
})
