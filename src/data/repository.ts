/**
 * ScheduleRepository — ScheduleRepository.kt 344 行 1:1
 * 14 写方法全部 captureForUndo; 复合动作 beginBatch/endBatch。
 */

import { db, nextTableId, nextCourseId, nextPeriodTableId } from './db'
import { undoManager } from './undoStore'
import type { Course, ImportDraft, PeriodTable, Table } from './types'
import { restoredForUnbind, snapshotForBind } from './types'
import { DEFAULT_TIME_JSON, reclaimUnusedEdgeNodes, remapCourseNodes, timeToNode } from '../domain/timeTable'
import i18next from 'i18next'
import { pruneConflictDefaultTop } from '../domain/conflictLayout'
import { loadPrefs, savePrefs } from './db'
import { suggestUniqueName } from '../views/mine/periodTableNames'
import { clearHolidayTransfers } from '../state/holidayStore'

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

// ---- 作息表 (issue#40 v8: PeriodTableDao 1:1) ---------------------------

/** 读: 全部独立作息表 (createdAt 升序 — Android PeriodTableDao.getAll 同序) */
export async function loadPeriodTables(): Promise<PeriodTable[]> {
  return db.periodTables.orderBy('createdAt').toArray()
}

/** 读: 单张独立作息表 */
export async function getPeriodTable(id: number): Promise<PeriodTable | undefined> {
  return db.periodTables.get(id)
}

/** 15. insertPeriodTable — 新建/导入独立作息表 */
export async function insertPeriodTable(pt: Omit<PeriodTable, 'id'> & { id?: number }): Promise<number> {
  await undoManager.capture('insertPeriodTable')
  const id = pt.id && pt.id > 0 ? pt.id : await nextPeriodTableId()
  await db.periodTables.put({ ...pt, id })
  return id
}

/** 16. updatePeriodTable — 编辑保存 */
export async function updatePeriodTable(pt: PeriodTable): Promise<void> {
  await undoManager.capture('updatePeriodTable')
  await db.periodTables.put({ ...pt, updatedAt: Date.now() })
}

/** 17. deletePeriodTable — 删除。被课表绑定时拒绝 (Android 返回 false + blocked 提示,
 *  禁止产生悬空引用; 撤回可回滚删除)。返回 true = 已删。 */
export async function deletePeriodTable(id: number): Promise<boolean> {
  const bound = await db.timetables.where('periodTableId').equals(id).count()
  if (bound > 0) return false
  await undoManager.capture('deletePeriodTable')
  await db.periodTables.delete(id)
  return true
}

/** 18. bindPeriodTable — 课表绑定独立作息表 (Android bindPeriodTable C2 语义 1:1):
 *  首次绑定 (null→非null) 写 preBindSnapshotJson={t,n,s} 快照; 换绑 (非null→非null)
 *  不刷新快照; 解绑恢复快照再清空。悬空目标拒绝, 无效动作 (目标未变) 不拍撤回快照。
 *  绑定本身不改兼容列 — web 读路径跟随绑定时由 updateBoundTableSettings 镜像写。 */
export async function bindPeriodTable(tableId: number, periodTableId: number | null): Promise<void> {
  const table = await db.timetables.get(tableId)
  if (!table) return
  if (periodTableId != null && !(await db.periodTables.get(periodTableId))) return
  if ((table.periodTableId ?? null) === periodTableId) return
  await undoManager.capture('bindPeriodTable')
  const next =
    table.periodTableId == null && periodTableId != null
      ? snapshotForBind(table, periodTableId)
      : table.periodTableId != null && periodTableId == null
        ? restoredForUnbind(table)
        : { ...table, periodTableId }
  await db.timetables.put(next)
}

/** 18b. updateTableMetadataAndBind — 编辑课表保存: 元数据 + 换绑, 单事务原子 (Android 同名方法 1:1,
 *  2026-09-23 症状3修复)。null→非null 写 C2 快照; 非null→null 恢复快照后叠用户本次
 *  编辑的时间域 (解绑态兼容列即真值); 换绑只动指针。periodContent 非空时一并落回目标作息表。 */
export async function updateTableMetadataAndBind(
  table: Table,
  periodTableId: number | null,
  periodContent?: PeriodTable,
): Promise<void> {
  const current = await db.timetables.get(table.id)
  if (!current) return
  if (periodTableId != null && !(await db.periodTables.get(periodTableId))) return
  if (periodContent && !(await db.periodTables.get(periodContent.id))) return
  if ((current.periodTableId ?? null) === periodTableId && !periodContent) {
    // 绑定关系与目标内容都没变 — 退化为纯元数据写; 解绑态写时间域(兼容列即真值)
    await undoManager.capture('updateTableMetadata')
    const writeTimeDomain = periodTableId == null
    await db.timetables.put({
      ...current,
      name: table.name,
      startDate: table.startDate,
      maxWeek: table.maxWeek,
      ...(writeTimeDomain
        ? { timeJson: table.timeJson, smartConfigJson: table.smartConfigJson, nodeCount: table.nodeCount }
        : {}),
    })
    return
  }
  await undoManager.capture('updateTableMetadataAndBind')
  await db.transaction('rw', db.timetables, db.periodTables, async () => {
    const next =
      current.periodTableId == null && periodTableId != null
        ? snapshotForBind(current, periodTableId)
        : current.periodTableId != null && periodTableId == null
          ? {
              ...restoredForUnbind(current),
              timeJson: table.timeJson,
              smartConfigJson: table.smartConfigJson,
              nodeCount: table.nodeCount,
            }
          : { ...current, periodTableId }
    await db.timetables.put({
      ...next,
      name: table.name,
      startDate: table.startDate,
      maxWeek: table.maxWeek,
    })
    if (periodContent) await db.periodTables.put({ ...periodContent, updatedAt: Date.now() })
  })
}

// ---- 导入草稿 (Room v10 import_drafts 1:1) ------------------------------

/** 读: 全部草稿 (updatedAt 降序 — 最近优先) */
export async function loadImportDrafts(): Promise<ImportDraft[]> {
  return db.importDrafts.orderBy('updatedAt').reverse().toArray()
}

/** 读: 单条草稿 */
export async function getImportDraft(id: string): Promise<ImportDraft | undefined> {
  return db.importDrafts.get(id)
}

/** 保存/更新草稿 — id 由导入流提供, 同 id 幂等重试 (Android ImportDraftDao.upsert 同构) */
export async function saveImportDraft(draft: ImportDraft): Promise<void> {
  await db.importDrafts.put(draft)
}

/** 删除草稿 (应用或放弃后清理) */
export async function deleteImportDraft(id: string): Promise<void> {
  await db.importDrafts.delete(id)
}

/** 19. savePeriodTableForTable — 从课表当前 timeJson 另存为新独立作息表 */export async function savePeriodTableForTable(
  tableId: number,
  name: string
): Promise<number> {
  await undoManager.capture('savePeriodTableForTable')
  const table = await db.timetables.get(tableId)
  if (!table) return -1
  const now = Date.now()
  const id = await nextPeriodTableId()
  await db.periodTables.put({
    id,
    name,
    nodesPerDay: table.nodeCount,
    timeJson: table.timeJson,
    smartConfigJson: table.smartConfigJson ?? '',
    createdAt: now,
    updatedAt: now,
  })
  return id
}

/** 19b. getTablesBoundTo — 绑定到指定作息表的课表数 (Android repoTablesBoundToCount 1:1,
 *  用于作息冲突弹窗「另有 N 张课表绑定」提示)。 */
export async function getTablesBoundTo(periodTableId: number): Promise<number> {
  return db.timetables.where('periodTableId').equals(periodTableId).count()
}

/** 20. updatePeriodTableContent — 修改共享作息表内容 (issue#40: 全部绑定课表立即生效)。
 *  Android savePeriodTable 只写 period_tables (读路径经 hydratedWith 投影);
 *  web 读路径直接渲染兼容列 (defaultTable.timeJson), 因此这里保留镜像写:
 *  把绑定课表的 timeJson/nodesPerDay/smartConfigJson 同步覆写 (课程行零改动)。
 *  C2 保证: 绑定/解绑经 bindPeriodTable 快照机制, 镜像不触碰 preBindSnapshotJson。
 *  返回受影响课表数。 */
export async function updatePeriodTableContent(pt: PeriodTable): Promise<number> {
  const existing = await db.periodTables.get(pt.id)
  if (!existing) return 0
  await undoManager.capture('updatePeriodTableContent')
  const stamped = { ...pt, updatedAt: Date.now() }
  const boundIds = await db.timetables.where('periodTableId').equals(pt.id).primaryKeys()
  await db.transaction('rw', db.periodTables, db.timetables, async () => {
    await db.periodTables.put(stamped)
    for (const id of boundIds) {
      const bound = await db.timetables.get(id as number)
      if (bound) {
        await db.timetables.put({
          ...bound,
          timeJson: stamped.timeJson,
          nodeCount: stamped.nodesPerDay,
          smartConfigJson: stamped.smartConfigJson,
        })
      }
    }
  })
  return boundIds.length
}

/**
 * 保存已绑定独立作息表的课表编辑页。
 * 课表元数据和共享作息内容来自同一次用户保存，必须在一个事务中落库；
 * 否则 EditTableView 的绑定分支只更新 period_tables，名称/开学日/周数会被静默丢弃。
 */
export async function updateBoundTableSettings(table: Table, pt: PeriodTable): Promise<void> {
  const existing = await db.periodTables.get(pt.id)
  if (!existing) return
  await undoManager.capture('updateBoundTableSettings')
  const stamped = { ...pt, updatedAt: Date.now() }
  const boundIds = await db.timetables.where('periodTableId').equals(pt.id).primaryKeys()
  await db.transaction('rw', db.periodTables, db.timetables, async () => {
    await db.periodTables.put(stamped)
    for (const id of boundIds) {
      const bound = await db.timetables.get(id as number)
      if (!bound) continue
      const metadata = id === table.id ? table : bound
      await db.timetables.put({
        ...metadata,
        timeJson: stamped.timeJson,
        nodeCount: stamped.nodesPerDay,
        smartConfigJson: stamped.smartConfigJson,
      })
    }
  })
}

/** 20b. executePolicyAndSave — 甲案 §3.1-§3.3 三策略落库 (Android ScheduleViewModel.kt:144-204 1:1)。
 *  全程 UndoManager.beginBatch/endBatch = 单撤销单元 (绑定关系+作息内容一次回退)。
 *  DETACH_COPY: 先 bindPeriodTable(null) 回复快照再写内置列; CREATE_NEW: insertPeriodTableWithUniqueName;
 *  SYNC: updatePeriodTable 写共享表 + updateTable 写课表元数据。
 *  执行后清 pendingPolicy — 下次保存不再弹窗(invariant ④)。 */
export async function executePolicyAndSave(
  tableId: number,
  editedTable: Table,
  newTimeJson: string,
  smartConfigJson: string,
  nodesPerDay: number,
  policy: 'DETACH_COPY' | 'CREATE_NEW' | 'SYNC',
  draft: PeriodTable,
): Promise<void> {
  undoManager.beginBatch()
  try {
    const current = await db.timetables.get(tableId)
    if (!current) return
    switch (policy) {
      case 'DETACH_COPY':
        // 先解绑(恢复快照)再写内置列(草稿), 写入在最后保赢 (Android 顺序同)
        await bindPeriodTable(tableId, null)
        await updateTableRemappingCourses({
          ...editedTable,
          periodTableId: null,
          timeJson: newTimeJson,
          smartConfigJson,
          nodeCount: nodesPerDay,
        })
        break
      case 'CREATE_NEW': {
        const newId = await insertPeriodTableWithUniqueName(current.name, newTimeJson, nodesPerDay, smartConfigJson)
        await bindPeriodTable(tableId, newId)
        await updateTableRemappingCourses({ ...editedTable, periodTableId: newId })
        break
      }
      case 'SYNC': {
        // Android: updatePeriodTable(draft.copy(id=boundId))+updateTable — web 读路径直接渲染
        // 兼容列 (Android 读时 hydrate), 故走 updateBoundTableSettings 原子双写:
        // 写回共享表 + 镜像全部绑定课表兼容列 (§5.2), 课程行零改动 (§9.1)
        const boundId = current.periodTableId
        const boundPt = boundId != null ? await db.periodTables.get(boundId) : undefined
        if (boundPt) {
          await updateBoundTableSettings(editedTable, {
            ...draft,
            id: boundPt.id,
            name: boundPt.name,
            timeJson: newTimeJson,
            smartConfigJson,
            nodesPerDay,
          })
        }
        break
      }
    }
  } finally {
    undoManager.endBatch()
  }
}

/** 21. copyPeriodTableAs — 复制作息表 (v1.0.56 T8: 复制先命名, 确认才落库)。
 *  返回新 id; -2 = 名被占用 (Android 同语义返回码)。 */
export async function copyPeriodTableAs(sourceId: number, newName: string): Promise<number> {
  const src = await db.periodTables.get(sourceId)
  if (!src) return -1
  const courseNames = (await db.timetables.toArray()).map((t) => t.name)
  const periodNames = (await db.periodTables.toArray()).map((p) => p.name)
  if (newName.trim() !== '' && (courseNames.includes(newName) || periodNames.includes(newName))) {
    return -2
  }
  await undoManager.capture('copyPeriodTableAs')
  const now = Date.now()
  const id = await nextPeriodTableId()
  await db.periodTables.put({
    ...src,
    id,
    name: newName.trim() === '' ? src.name : newName,
    createdAt: now,
    updatedAt: now,
  })
  return id
}


/** 21b. insertPeriodTableWithUniqueName — CREATE_NEW 策略 (issue#40 §3.2):
 *  按课表名新建独立作息表, 全局唯一名顺延 (suggestUniqueName), 返回新 id。
 *  Android insertPeriodTableWithUniqueName 1:1。 */
export async function insertPeriodTableWithUniqueName(
  name: string,
  timeJson: string,
  nodesPerDay: number,
  smartConfigJson: string,
): Promise<number> {
  const courseNames = (await db.timetables.toArray()).map((t) => t.name)
  const periodNames = (await db.periodTables.toArray()).map((p) => p.name)
  const unique = suggestUniqueName(name, courseNames, periodNames, name)
  return insertPeriodTable({
    name: unique,
    nodesPerDay,
    timeJson,
    smartConfigJson,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

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
  // issue#44: 同步清该表调休映射, 防 localStorage 孤儿键
  clearHolidayTransfers(id)
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

/** createEmptyTable — ScheduleViewModel.createEmptyTable 1:1 (ScheduleViewModel.kt:171-205)。
 *  名称 default_table_with_num「默认N」从 size+1 起对已有名查重递增;
 *  开学日 = 本周一再减一周 (LocalDate.with(MONDAY).minusWeeks(1)) — 让新一周开学前
 *  当前周仍落在第 1 周; 首表自动置默认 (避免"无默认表")。
 *  commitSelection=false → 不动选中 (新建→编辑→可丢弃动线, MainActivity:314)。 */
export async function createEmptyTable(commitSelection = true): Promise<number> {
  const tables = await db.timetables.orderBy('id').toArray()
  const names = new Set(tables.map((tb) => tb.name))
  let index = tables.length + 1
  let name = String(i18next.t('default_table_with_num', { v1: index }))
  while (names.has(name)) {
    index += 1
    name = String(i18next.t('default_table_with_num', { v1: index }))
  }
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7)
  const p = (x: number) => String(x).padStart(2, '0')
  const isFirstTable = tables.length === 0
  const id = await insertTable({
    name,
    startDate: `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`,
    timeJson: DEFAULT_TIME_JSON,
    smartConfigJson: '',
    isDefault: 0,
    nodeCount: 12,
    maxWeek: 20,
    createdAt: Date.now(),
  })
  // Web 的"当前课表"就是 DB 的 isDefault (Android 的 selectedTableId 是 VM 内存态)
  if (isFirstTable || commitSelection) await setDefault(id)
  return id
}

/** discardNewTable — ScheduleViewModel.discardNewTable 1:1 (ScheduleViewModel.kt:227-241)。
 *  删掉从未被用户保存的新表, 选中落回原默认表 (原表已不在 → 现存默认表 → 第一张剩余表)。 */
export async function discardNewTable(newId: number, fallbackId: number | null): Promise<void> {
  await deleteTable(newId)
  const remaining = await db.timetables.orderBy('id').toArray()
  const targetId =
    fallbackId != null && remaining.some((tb) => tb.id === fallbackId)
      ? fallbackId
      : remaining.find((tb) => tb.isDefault === 1)?.id ?? remaining[0]?.id
  if (targetId != null && targetId !== remaining.find((tb) => tb.isDefault === 1)?.id) {
    await setDefault(targetId)
  }
}
