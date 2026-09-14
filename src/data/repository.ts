/**
 * ScheduleRepository — ScheduleRepository.kt 344 行 1:1
 * 14 写方法全部 captureForUndo; 复合动作 beginBatch/endBatch。
 */

import { db, nextTableId, nextCourseId } from './db'
import { undoManager } from './undoStore'
import type { Course, Table } from './types'
import { reclaimUnusedEdgeNodes, remapCourseNodes, timeToNode } from '../domain/timeTable'
import { pruneConflictDefaultTop } from '../domain/conflictLayout'
import { loadPrefs, savePrefs } from './db'

// ---- 读 ---------------------------------------------------------------

export async function observeAllTables(): Promise<Table[]> {
  return db.timetables.toArray()
}

export async function getTable(id: number): Promise<Table | undefined> {
  return db.timetables.get(id)
}

export async function getDefaultTable(): Promise<Table | undefined> {
  return db.timetables.where('isDefault').equals(1).first()
}

export async function getCourses(tableId: number): Promise<Course[]> {
  return db.courses.where('tableId').equals(tableId).toArray()
}

export async function getCourse(id: number): Promise<Course | undefined> {
  return db.courses.get(id)
}

export async function getGroupCourses(tableId: number, groupId: string): Promise<Course[]> {
  return db.courses.where('tableId').equals(tableId).and((c) => c.groupId === groupId).toArray()
}

export async function tableCount(): Promise<number> {
  return db.timetables.count()
}

export async function countCourses(tableId: number): Promise<number> {
  return db.courses.where('tableId').equals(tableId).count()
}

// ---- 写 (14 方法, 全部 captureForUndo) ---------------------------------

/** 1. insertTable */
export async function insertTable(table: Omit<Table, 'id'> & { id?: number }): Promise<number> {
  await undoManager.capture('insertTable')
  const id = table.id && table.id > 0 ? table.id : await nextTableId()
  const isFirst = (await tableCount()) === 0
  const full: Table = { ...table, id, isDefault: isFirst ? 1 : table.isDefault }
  await db.timetables.put(full)
  return id
}

/** 2. updateTable */
export async function updateTable(table: Table): Promise<void> {
  await undoManager.capture('updateTable')
  await db.timetables.put(table)
}

/** 3. updateTableRemappingCourses — 作息变更后课程节次自适应 (issue#28 P3) */
export async function updateTableRemappingCourses(
  table: Table,
  remapFn?: (startNode: number, step: number, oldTimeJson: string, newTimeJson: string) => [number, number]
): Promise<void> {
  await undoManager.capture('updateTableRemappingCourses')
  const old = await db.timetables.get(table.id)
  await db.timetables.put(table)
  if (!old || old.timeJson === table.timeJson) return
  const courses = await getCourses(table.id)
  // Kotlin ScheduleRepository.updateTableRemappingCourses: ownTime 课按时间反算等效节次
  // (timeToNode), 其余按 remapCourseNodes; remapFn 未传时默认 remapCourseNodes
  const remapped = courses.map((c) => {
    if (c.ownTime) {
      const mapped = timeToNode(c.startTime, c.endTime, table.timeJson)
      return mapped ? { ...c, startNode: mapped[0], step: mapped[1] } : c
    }
    const fn = remapFn ?? remapCourseNodes
    const [startNode, step] = fn(c.startNode, c.step, old.timeJson, table.timeJson)
    return { ...c, startNode, step }
  })
  await db.courses.bulkPut(remapped)
}

/** 4. deleteTable (CASCADE 删课 + 边缘节点回收绕过 capture) */
export async function deleteTable(id: number): Promise<void> {
  await undoManager.capture('deleteTable')
  await db.transaction('rw', db.timetables, db.courses, async () => {
    await db.courses.where('tableId').equals(id).delete()
    await db.timetables.delete(id)
  })
  await reassignDefaultIfEmpty()
  await pruneDefaultTopPrefs()
}

/** 5. setDefault — 直接走表更新, 不捕获 (Android 同: 撤回不含默认表切换) */
export async function setDefault(id: number): Promise<void> {
  await db.transaction('rw', db.timetables, async () => {
    await db.timetables.toCollection().modify({ isDefault: 0 })
    await db.timetables.update(id, { isDefault: 1 })
  })
}

/** 6. insertCourse */
export async function insertCourse(course: Omit<Course, 'id'> & { id?: number }): Promise<number> {
  await undoManager.capture('insertCourse')
  // id=0 = 未分配 (Room autoGenerate 语义: 0 触发自增)
  const id = course.id && course.id > 0 ? course.id : await nextCourseId()
  const full = { ...course, id }
  await db.courses.put(full)
  await reclaimUnusedEdgeNodesForTable(course.tableId)
  await pruneDefaultTopPrefs()
  return id
}

/** 7. insertCourses (批量, 内建 assignGroupIds — Android ScheduleRepository.kt:170 同构) */
export async function insertCourses(courses: Omit<Course, 'id'>[]): Promise<number[]> {
  await undoManager.capture('insertCourses')
  // 导入时以规范化课程名为身份; 时间、教师、教室只属于课程的一个时段
  const withGroupIds = assignGroupIds(courses)
  let next = await nextCourseId()
  const full = withGroupIds.map((c) => ({ ...c, id: next++ }))
  await db.courses.bulkPut(full)
  return full.map((c) => c.id)
}

/** assignGroupIds — Android ScheduleRepository.kt:356 1:1
 *  按规范化课名分 key 共享 groupId; 原值非空保留, 空则生成随机 UUID。
 *  同名不同 token 的分区靠 sleepy-v1 authoritative 路径 (insertCoursesKeepingGroups)
 *  绕过本函数保留 — 与 Android 双路径分流同构。 */
export function assignGroupIds(courses: Omit<Course, 'id'>[]): Omit<Course, 'id'>[] {
  const nameToGroupId = new Map<string, string>()
  return courses.map((c) => {
    const key = c.courseName.trim().replace(/\s+/g, ' ').toLowerCase()
    let gid = nameToGroupId.get(key)
    if (gid === undefined) {
      gid = c.groupId.trim() !== '' ? c.groupId : randomUuid()
      nameToGroupId.set(key, gid)
    }
    return { ...c, groupId: gid }
  })
}

/** crypto.randomUUID 兜底 (非安全上下文 jsdom 无此 API) */
function randomUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fallthrough */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 8. insertCoursesKeepingGroups — 导入保留原 groupId */
export async function insertCoursesKeepingGroups(courses: Course[]): Promise<number[]> {
  await undoManager.capture('insertCoursesKeepingGroups')
  let next = await nextCourseId()
  const full = courses.map((c) => ({ ...c, id: next++ }))
  await db.courses.bulkPut(full)
  return full.map((c) => c.id)
}

/** 9. replaceCoursesKeepingGroups — 覆盖导入: 清空表内课程再灌入 */
export async function replaceCoursesKeepingGroups(tableId: number, courses: Course[]): Promise<void> {
  await undoManager.capture('replaceCoursesKeepingGroups')
  await db.transaction('rw', db.courses, async () => {
    await db.courses.where('tableId').equals(tableId).delete()
    let next = await nextCourseId()
    const full = courses.map((c) => ({ ...c, id: next++, tableId }))
    await db.courses.bulkPut(full)
  })
  await pruneDefaultTopPrefs()
}

/** 10. updateCourse */
export async function updateCourse(course: Course): Promise<void> {
  await undoManager.capture('updateCourse')
  await db.courses.put(course)
}

/** 11. updateCourseGroup — 整组覆盖 (编辑页保存路径) */
export async function updateCourseGroup(
  tableId: number,
  groupId: string,
  newCourses: Omit<Course, 'id'>[]
): Promise<void> {
  await undoManager.capture('updateCourseGroup')
  await db.transaction('rw', db.courses, async () => {
    await db.courses
      .where('tableId')
      .equals(tableId)
      .and((c) => c.groupId === groupId)
      .delete()
    let next = await nextCourseId()
    const full = newCourses.map((c) => ({ ...c, id: next++, tableId, groupId }))
    await db.courses.bulkPut(full)
  })
  await pruneDefaultTopPrefs()
}

/** 12. deleteCourse + 未引用边缘节点回收 */
export async function deleteCourse(id: number): Promise<void> {
  await undoManager.capture('deleteCourse')
  const course = await db.courses.get(id)
  await db.courses.delete(id)
  if (course) {
    await reclaimUnusedEdgeNodesForTable(course.tableId)
    await pruneDefaultTopPrefs()
  }
}

/** 13. deleteCourseGroup */
export async function deleteCourseGroup(tableId: number, groupId: string): Promise<void> {
  await undoManager.capture('deleteCourseGroup')
  await db.courses
    .where('tableId')
    .equals(tableId)
    .and((c) => c.groupId === groupId)
    .delete()
  await reclaimUnusedEdgeNodesForTable(tableId)
  await pruneDefaultTopPrefs()
}

/** 14a. applyDiff — issue#22 契约: 方法内建 capture (调用方无须预捕获) */
export async function applyDiff(
  tableId: number,
  diff: { toAdd: Omit<Course, 'id'>[]; toUpdate: Course[]; toDeleteIds: number[] }
): Promise<void> {
  await undoManager.capture('applyDiff')
  await db.transaction('rw', db.courses, async () => {
    if (diff.toDeleteIds.length > 0) {
      await db.courses.bulkDelete(diff.toDeleteIds)
    }
    if (diff.toUpdate.length > 0) {
      await db.courses.bulkPut(diff.toUpdate)
    }
    if (diff.toAdd.length > 0) {
      let next = await nextCourseId()
      const full = diff.toAdd.map((c) => ({ ...c, id: next++, tableId }))
      await db.courses.bulkPut(full)
    }
  })
  await pruneDefaultTopPrefs()
}

/** 14b. replaceCourses */
export async function replaceCourses(tableId: number, courses: Omit<Course, 'id'>[]): Promise<void> {
  await undoManager.capture('replaceCourses')
  await db.transaction('rw', db.courses, async () => {
    await db.courses.where('tableId').equals(tableId).delete()
    let next = await nextCourseId()
    const full = courses.map((c) => ({ ...c, id: next++, tableId }))
    await db.courses.bulkPut(full)
  })
  await pruneDefaultTopPrefs()
}

// ---- 内部 -------------------------------------------------------------

/** 删课后全部课变空 → 首表设默认 (Room 端 onDeleteTable 后同语义) */
async function reassignDefaultIfEmpty(): Promise<void> {
  const tables = await db.timetables.toArray()
  if (tables.length === 0) return
  if (!tables.some((t) => t.isDefault === 1)) {
    await db.timetables.update(tables[0].id, { isDefault: 1 })
  }
}

/** 直接走 updateTable 内部路径回收边缘节点 — 撤回快照含表本体 */
async function reclaimUnusedEdgeNodesForTable(tableId: number): Promise<void> {
  const table = await db.timetables.get(tableId)
  if (!table) return
  const courses = await getCourses(tableId)
  const usedNodes = new Set<number>()
  for (const c of courses) {
    for (let n = c.startNode; n <= c.startNode + c.step - 1; n++) usedNodes.add(n)
  }
  const cleaned = reclaimUnusedEdgeNodes(table.timeJson, usedNodes)
  if (cleaned !== table.timeJson) {
    await db.timetables.put({ ...table, timeJson: cleaned })
  }
}

/** 清理指向已失效课程的置顶偏好 (v7.10.16p) */
async function pruneDefaultTopPrefs(): Promise<void> {
  const prefs = await loadPrefs()
  const stored = prefs.conflictDefaultTop
  if (Object.keys(stored).length === 0) return
  const courses = await db.courses.toArray()
  const pruned = pruneConflictDefaultTop(stored, courses)
  if (Object.keys(pruned).length !== Object.keys(stored).length) {
    await savePrefs({ ...prefs, conflictDefaultTop: pruned })
  }
}

/** duplicateTable — Android ScheduleViewModel.duplicateTable (v7.10.15/16w) 1:1
 *  全量复制表配置+课程; 副本不接管默认表不切选中; 命名去重 原名+"2"/"3"...;
 *  建表+插课一个撤回动作 (beginBatch 保首快照); groupId 整组映射新 UUID */
export async function duplicateTable(id: number): Promise<number> {
  const source = await getTable(id)
  if (!source) return -1
  const courses = await getCourses(id)
  const existing = await db.timetables.toArray()
  const existingNames = new Set(existing.map((tb) => tb.name))
  let index = 2
  let name = `${source.name}2`
  while (existingNames.has(name)) { index++; name = `${source.name}${index}` }
  const { beginBatch, endBatch } = undoManager
  let newId = -1
  beginBatch()
  try {
    newId = await insertTable({ ...source, id: undefined, name, isDefault: 0, createdAt: Date.now() })
    if (courses.length > 0) {
      const groupMap = new Map<string, string>()
      const mapped = courses.map((c) => {
        if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, crypto.randomUUID())
        const { id: _drop, ...rest } = c
        return { ...rest, groupId: groupMap.get(c.groupId)!, tableId: newId }
      })
      await insertCoursesKeepingGroups(mapped as Course[])
    }
  } finally {
    await endBatch()
  }
  return newId
}
