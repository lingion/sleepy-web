import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from './db'
import {
  insertTable,
  updateTable,
  deleteTable,
  setDefault,
  insertCourse,
  insertCourses,
  insertCoursesKeepingGroups,
  replaceCoursesKeepingGroups,
  updateCourse,
  updateCourseGroup,
  deleteCourse,
  deleteCourseGroup,
  applyDiff,
  replaceCourses,
  getCourses,
  getGroupCourses,
  tableCount,
  assignGroupIds,
  getDefaultTable,
  duplicateTable,
  loadPeriodTables,
  getPeriodTable,
  insertPeriodTable,
  updatePeriodTable,
  deletePeriodTable,
  bindPeriodTable,
  updateTableMetadataAndBind,
  savePeriodTableForTable,
  updatePeriodTableContent,
  copyPeriodTableAs,
  loadImportDrafts,
  saveImportDraft,
  deleteImportDraft,
} from './repository'
import { useUndoStore } from './undoStore'
import type { Course } from './types'

function mkCourse(partial: Partial<Course>): Omit<Course, 'id'> {
  return {
    id: 0,
    groupId: 'g1',
    tableId: 1,
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
    color: '',
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

beforeEach(async () => {
  // 每测重建数据库 + undo 单槽
  useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
  await Promise.all([db.timetables.clear(), db.courses.clear(), db.prefs.clear(), db.periodTables.clear(), db.importDrafts.clear()])
})

describe('课表 CRUD (capture 1-5)', () => {
  it('insertTable: 首表自动 isDefault=1', async () => {
    const id = await insertTable({ name: '大三上', timeJson: '[]', smartConfigJson: '', isDefault: 0, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: Date.now() })
    const t = await db.timetables.get(id)
    expect(t?.isDefault).toBe(1)
  })

  it('insertTable: 第二张表不抢默认', async () => {
    await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 0, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: Date.now() })
    const id2 = await insertTable({ name: 'B', timeJson: '[]', smartConfigJson: '', isDefault: 0, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: Date.now() })
    const b = await db.timetables.get(id2)
    expect(b?.isDefault).toBe(0)
  })

  it('updateTable / setDefault', async () => {
    const id = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    const id2 = await insertTable({ name: 'B', timeJson: '[]', smartConfigJson: '', isDefault: 0, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 2 })
    await setDefault(id2)
    expect((await getDefaultTable())?.id).toBe(id2)
    await updateTable({ id, name: 'A2', timeJson: '[]', smartConfigJson: '', isDefault: 0, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    expect((await db.timetables.get(id))?.name).toBe('A2')
  })

  it('deleteTable: CASCADE 删课', async () => {
    const id = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    await insertCourse(mkCourse({ tableId: id }))
    await deleteTable(id)
    expect(await tableCount()).toBe(0)
    expect(await db.courses.count()).toBe(0)
  })

  it('deleteTable: 同步清该表调休映射 (issue#44), 他表不动', async () => {
    const id = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    const entry = '[{"sourceDate":"2026-05-01","targetDate":"2026-05-09","segmentId":"x"}]'
    localStorage.setItem(`sleepy_holiday_transfers_${id}`, entry)
    localStorage.setItem(`sleepy_holiday_transfers_${id + 1}`, entry)
    await deleteTable(id)
    expect(localStorage.getItem(`sleepy_holiday_transfers_${id}`)).toBeNull()
    expect(localStorage.getItem(`sleepy_holiday_transfers_${id + 1}`)).toBe(entry)
    localStorage.removeItem(`sleepy_holiday_transfers_${id + 1}`)
  })
})

describe('课程 CRUD (capture 6-14)', () => {
  let tableId: number
  beforeEach(async () => {
    tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
  })

  it('insertCourse / getCourses / getGroupCourses', async () => {
    await insertCourse(mkCourse({ tableId, groupId: 'grp1', courseName: '数学' }))
    await insertCourse(mkCourse({ tableId, groupId: 'grp1', courseName: '数学' }))
    await insertCourse(mkCourse({ tableId, groupId: 'grp2', courseName: '物理' }))
    expect(await getCourses(tableId)).toHaveLength(3)
    expect(await getGroupCourses(tableId, 'grp1')).toHaveLength(2)
  })

  it('updateCourse', async () => {
    const id = await insertCourse(mkCourse({ tableId, teacher: '张三' }))
    const c = await db.courses.get(id)
    await updateCourse({ ...c!, teacher: '李四' })
    expect((await db.courses.get(id))?.teacher).toBe('李四')
  })

  it('updateCourseGroup: 整组覆盖', async () => {
    await insertCourse(mkCourse({ tableId, groupId: 'grp1', day: 1 }))
    await insertCourse(mkCourse({ tableId, groupId: 'grp1', day: 3 }))
    await updateCourseGroup(tableId, 'grp1', [mkCourse({ tableId, groupId: 'grp1', day: 2, courseName: '数学B' })])
    const group = await getGroupCourses(tableId, 'grp1')
    expect(group).toHaveLength(1)
    expect(group[0].day).toBe(2)
  })

  it('deleteCourse / deleteCourseGroup', async () => {
    const id1 = await insertCourse(mkCourse({ tableId, groupId: 'grp1' }))
    await insertCourse(mkCourse({ tableId, groupId: 'grp1' }))
    await insertCourse(mkCourse({ tableId, groupId: 'grp2' }))
    await deleteCourse(id1)
    expect(await getCourses(tableId)).toHaveLength(2)
    await deleteCourseGroup(tableId, 'grp1')
    expect(await getCourses(tableId)).toHaveLength(1)
    expect((await getCourses(tableId))[0].groupId).toBe('grp2')
  })

  it('insertCourses / insertCoursesKeepingGroups 返回自增 ids', async () => {
    const ids1 = await insertCourses([mkCourse({ tableId }), mkCourse({ tableId })])
    const ids2 = await insertCoursesKeepingGroups([
      { ...mkCourse({ tableId, groupId: 'keep1' }), id: 0 },
      { ...mkCourse({ tableId, groupId: 'keep1' }), id: 0 },
    ] as Course[])
    expect(new Set([...ids1, ...ids2]).size).toBe(4)
  })

  it('replaceCourses / replaceCoursesKeepingGroups: 清空再灌', async () => {
    await insertCourses([mkCourse({ tableId }), mkCourse({ tableId }), mkCourse({ tableId })])
    await replaceCourses(tableId, [mkCourse({ tableId, courseName: '新' })])
    expect(await getCourses(tableId)).toHaveLength(1)
    await replaceCoursesKeepingGroups(tableId, [
      { ...mkCourse({ tableId, groupId: 'k' }), id: 1 },
    ] as Course[])
    const out = await getCourses(tableId)
    expect(out).toHaveLength(1)
    expect(out[0].groupId).toBe('k')
  })

  it('applyDiff: 增删改一体', async () => {
    const id1 = await insertCourse(mkCourse({ tableId, courseName: '改' }))
    const id2 = await insertCourse(mkCourse({ tableId, courseName: '删' }))
    await applyDiff(tableId, {
      toAdd: [mkCourse({ tableId, courseName: '增' })],
      toUpdate: [{ ...mkCourse({ tableId, courseName: '改2' }), id: id1 } as Course],
      toDeleteIds: [id2],
    })
    const out = await getCourses(tableId)
    expect(out.map((c) => c.courseName).sort()).toEqual(['增', '改2'])
  })

  it('assignGroupIds: 同名课共享 groupId (Android ScheduleRepository.kt:356 语义)', () => {
    // 空值 → 按名分 key 共享随机 UUID
    const a = assignGroupIds([
      mkCourse({ courseName: '体育', groupId: '' }),
      mkCourse({ courseName: '体育', groupId: '' }),
      mkCourse({ courseName: '英语', groupId: '' }),
    ])
    expect(a[0].groupId).toBe(a[1].groupId)
    expect(a[0].groupId).not.toBe(a[2].groupId)
    // 原值非空 → 保留原值 (Kotlin c.groupId.takeIf { it.isNotBlank() } ?: UUID)
    const b = assignGroupIds([
      mkCourse({ courseName: '体育', groupId: 'g1' }),
      mkCourse({ courseName: '英语', groupId: 'g2' }),
    ])
    expect(b[0].groupId).toBe('g1')
    expect(b[1].groupId).toBe('g2')
  })
})

describe('undo — 单级撤回 (UndoManager.kt v7.10.16w 1:1)', () => {
  it('insertCourse 后 undo 恢复空', async () => {
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    await insertCourse(mkCourse({ tableId }))
    expect(await db.courses.count()).toBe(1)
    expect(await useUndoStore.getState().undo()).toBe(true)
    expect(await db.courses.count()).toBe(0)
  })

  it('单级语义: 撤回后无快照可再撤 (无 redo)', async () => {
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    await insertCourse(mkCourse({ tableId }))
    expect(await useUndoStore.getState().undo()).toBe(true)
    expect(await useUndoStore.getState().undo()).toBe(false)
    expect(useUndoStore.getState().canUndo()).toBe(false)
  })

  it('批内只保首个快照, 且锚定批开始前时点 (beginBatch/endBatch)', async () => {
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    useUndoStore.getState().beginBatch()
    await insertCourse(mkCourse({ tableId, courseName: '一' }))
    await insertCourse(mkCourse({ tableId, courseName: '二' }))
    await insertCourse(mkCourse({ tableId, courseName: '三' }))
    await useUndoStore.getState().endBatch()
    expect(await db.courses.count()).toBe(3)
    // Android v7.10.16w: 批内首拍锚定"本批开始前"(= 建表后空课), 非旧动作快照。
    // 一次 undo = 撤整批: 三门课全消失, 表保留 (表是批外动作建的)
    await useUndoStore.getState().undo()
    expect(await db.courses.count()).toBe(0)
    expect(await db.timetables.count()).toBe(1)
    expect(await useUndoStore.getState().undo()).toBe(false)
  })

  it('v7.10.16w 撤回锚定: 批开始前旧快照作废 — 复制课表→批内导入→撤回回到导入前(副本仍在)', async () => {
    // 旧实现 `batchDepth > 0 && undoStack.length > 0` 直接 return — 复制课表(复合批)
    // 留下的旧快照会被本批误当成动作起点, 撤回跳过本动作直接回到更早, 副本被连根拔。
    // 现在 beginBatch 时把旧快照过期: 本动作首拍必落到"本动作开始前"的库态 —
    // 每个用户动作的撤回点 = 该动作自己开始前, 动作链上不跳步。
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    await insertCourse(mkCourse({ tableId, courseName: '原课' }))
    const dupId = await duplicateTable(tableId) // 复合批动作: 留下"复制开始前"快照
    expect(await db.timetables.count()).toBe(2)
    // 下一用户动作: 批内追加导入 (两拍都静默, 首拍锚定"导入开始前"= 两张表+两门课)
    useUndoStore.getState().beginBatch()
    await insertCourse(mkCourse({ tableId: dupId, courseName: '导入一' }))
    await insertCourse(mkCourse({ tableId: dupId, courseName: '导入二' }))
    await useUndoStore.getState().endBatch()
    expect(await db.courses.count()).toBe(4)
    // 一次 undo = 回到"导入动作开始前" — 副本与其复制的原课仍在, 导入的两门被撤
    expect(await useUndoStore.getState().undo()).toBe(true)
    expect(await db.timetables.count()).toBe(2)
    expect(await db.courses.count()).toBe(2)
    const names = (await db.courses.toArray()).map((c) => c.courseName).sort()
    expect(names).toEqual(['原课', '原课'])
  })

  it('undo 恢复默认表指向 (isDefault 随快照回滚)', async () => {
    const a = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    const b = await insertTable({ name: 'B', timeJson: '[]', smartConfigJson: '', isDefault: 0, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 2 })
    const { setDefault } = await import('./repository')
    await setDefault(b)
    expect((await db.timetables.get(b))?.isDefault).toBe(1)
    await useUndoStore.getState().undo() // 撤回 setDefault 前的最后动作 — 快照= B 建表前
    const tables = await db.timetables.toArray()
    expect(tables.find((t) => t.id === a)?.isDefault).toBe(1)
    expect(tables.find((t) => t.id === b)).toBeUndefined()
  })

  it('undo 到空后返回 false', async () => {
    expect(await useUndoStore.getState().undo()).toBe(false)
  })
})

describe('作息表 PeriodTable (issue#40 v8) — 6 方法 + undo 覆盖', () => {
  const mkPT = (over: Partial<Parameters<typeof insertPeriodTable>[0]> = {}) => ({
    name: '标准',
    nodesPerDay: 12,
    timeJson: '[1,"08:00",2,"09:50"]',
    smartConfigJson: '',
    createdAt: 1,
    updatedAt: 1,
    ...over,
  })

  it('insertPeriodTable + loadPeriodTables + getPeriodTable', async () => {
    const id1 = await insertPeriodTable(mkPT({ name: '夏季', createdAt: 100 }))
    const id2 = await insertPeriodTable(mkPT({ name: '冬季', createdAt: 200 }))
    const all = await loadPeriodTables()
    expect(all.map((p) => p.id)).toEqual([id1, id2]) // 按 createdAt 升序
    const got = await getPeriodTable(id1)
    expect(got?.name).toBe('夏季')
  })

  it('updatePeriodTable 改节点时间', async () => {
    const id = await insertPeriodTable(mkPT({ name: '原' }))
    const pt = (await getPeriodTable(id))!
    await updatePeriodTable({ ...pt, name: '改', timeJson: '[]', updatedAt: 999 })
    const after = await getPeriodTable(id)
    expect(after?.name).toBe('改')
    expect(after?.timeJson).toBe('[]')
    expect(after && after.updatedAt >= 999).toBe(true) // updatedAt 刷新为当前时刻 (Date.now())
  })

  it('deletePeriodTable: 被绑定时拒绝 (Android 悬空引用守卫), 解绑后可删', async () => {
    const ptId = await insertPeriodTable(mkPT())
    const tId = await insertTable({
      name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1,
      startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1, periodTableId: ptId,
    })
    await insertCourse(mkCourse({ tableId: tId, courseName: '保留' }))
    expect((await db.timetables.get(tId))?.periodTableId).toBe(ptId)
    // 被绑定 → 拒绝删除, PT 与绑定都原样 (Android ScheduleRepository.deletePeriodTable 同)
    expect(await deletePeriodTable(ptId)).toBe(false)
    expect(await getPeriodTable(ptId)).toBeDefined()
    // 解绑 → 可删
    await bindPeriodTable(tId, null)
    expect(await deletePeriodTable(ptId)).toBe(true)
    expect(await getPeriodTable(ptId)).toBeUndefined()
    // 课表与其课程原样保留
    const t = await db.timetables.get(tId)
    expect(t).toBeDefined()
    expect((await db.courses.toArray()).find((c) => c.courseName === '保留')).toBeDefined()
  })

  it('bindPeriodTable 单向写: 改 periodTableId 不动节点数据/课程', async () => {
    const ptA = await insertPeriodTable(mkPT({ name: 'A表', timeJson: '[1,"08:00",2,"09:50"]' }))
    const tId = await insertTable({
      name: '课', timeJson: '[1,"08:00",2,"09:50"]', smartConfigJson: 'X', isDefault: 1,
      startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1,
    })
    const cId = await insertCourse(mkCourse({ tableId: tId, startNode: 1, step: 2 }))
    const before = await db.timetables.get(tId)
    expect(before?.periodTableId == null).toBe(true)
    // 绑定
    await bindPeriodTable(tId, ptA)
    const after = await db.timetables.get(tId)
    expect(after?.periodTableId).toBe(ptA)
    expect(after?.timeJson).toBe(before?.timeJson) // 节点数据原样
    expect(after?.smartConfigJson).toBe(before?.smartConfigJson) // 配置原样
    expect(after?.nodeCount).toBe(before?.nodeCount) // 节数原样
    // 课程零变化
    const c = await db.courses.get(cId)
    expect(c?.startNode).toBe(1)
    expect(c?.step).toBe(2)
  })

  it('savePeriodTableForTable 从课表当前 timeJson 另存为新作息表', async () => {
    const tId = await insertTable({
      name: 'A', timeJson: '[1,"08:30",2,"10:00"]', smartConfigJson: 'smart', isDefault: 1,
      startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1,
    })
    const newId = await savePeriodTableForTable(tId, 'A 副本')
    expect(newId).toBeGreaterThan(0)
    const saved = await getPeriodTable(newId)
    expect(saved?.name).toBe('A 副本')
    expect(saved?.timeJson).toBe('[1,"08:30",2,"10:00"]')
    expect(saved?.smartConfigJson).toBe('smart')
    expect(saved?.nodesPerDay).toBe(12)
  })

  it('undo 恢复 periodTables + 恢复顺序 periodTables→time_tables→courses', async () => {
    const ptId = await insertPeriodTable(mkPT({ name: '将被撤', createdAt: 100 }))
    const tId = await insertTable({
      name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1,
      startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1,
    })
    expect((await loadPeriodTables()).length).toBe(1)
    // 第二次插入: 单槽覆盖, snapshot 此时 = 1 张 PT + 1 张 timetable
    await insertPeriodTable(mkPT({ name: 'B', createdAt: 200 }))
    expect((await loadPeriodTables()).length).toBe(2)
    // 撤回 = 回到第二次 insert 之前: 1 张 PT
    expect(await useUndoStore.getState().undo()).toBe(true)
    const pts = await loadPeriodTables()
    expect(pts.length).toBe(1)
    expect(pts[0].name).toBe('将被撤')
    expect(pts[0].id).toBe(ptId)
    // 课表也回 1 张
    expect((await db.timetables.toArray()).length).toBe(1)
    expect((await db.timetables.get(tId))?.name).toBe('A')
  })

  it('updatePeriodTableContent 同步覆写绑定课表的节点数据 (issue#40 共享生效)', async () => {
    const ptId = await insertPeriodTable(mkPT({ name: '共享', timeJson: '[1,"08:00",2,"08:45"]' }))
    const tId = await insertTable({
      name: '绑它', timeJson: '[1,"08:00",2,"08:45"]', smartConfigJson: 'cfg1', isDefault: 1,
      startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1, periodTableId: ptId,
    })
    const otherId = await insertTable({
      name: '没绑', timeJson: '[1,"09:00",2,"09:45"]', smartConfigJson: 'cfg2', isDefault: 0,
      startDate: '', nodeCount: 10, maxWeek: 20, createdAt: 2,
    })
    const cId = await insertCourse(mkCourse({ tableId: tId, courseName: '不动课程' }))
    const pt = (await getPeriodTable(ptId))!
    const affected = await updatePeriodTableContent({
      ...pt, nodesPerDay: 10, timeJson: '[1,"08:30",2,"09:15"]', smartConfigJson: 'cfg9',
    })
    expect(affected).toBe(1) // 只影响绑定的那张
    const bound = await db.timetables.get(tId)
    expect(bound?.timeJson).toBe('[1,"08:30",2,"09:15"]')
    expect(bound?.nodeCount).toBe(10)
    expect(bound?.smartConfigJson).toBe('cfg9')
    // 未绑定课表零变化
    const other = await db.timetables.get(otherId)
    expect(other?.timeJson).toBe('[1,"09:00",2,"09:45"]')
    // 课程行零改动
    const c = await db.courses.get(cId)
    expect(c?.courseName).toBe('不动课程')
    expect(c?.startNode).toBe(1)
  })

  it('copyPeriodTableAs: 名占用返回 -2, 成功返回新 id 且源不动', async () => {
    const srcId = await insertPeriodTable(mkPT({ name: '原表' }))
    const tId = await insertTable({
      name: '占名', timeJson: '[]', smartConfigJson: '', isDefault: 1,
      startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1,
    })
    expect(await copyPeriodTableAs(srcId, '占名')).toBe(-2) // 课表占名
    const newId = await copyPeriodTableAs(srcId, '新副本')
    expect(newId).toBeGreaterThan(0)
    const copy = await getPeriodTable(newId)
    const src = await getPeriodTable(srcId)
    expect(copy?.name).toBe('新副本')
    expect(copy?.timeJson).toBe(src?.timeJson)
    expect(copy?.id).not.toBe(src?.id)
    expect(tId).toBeGreaterThan(0)
  })
})

describe('C2 换绑快照 (preBindSnapshotJson 1:1) — 解绑不丢用户手工作息', () => {
  const mkPT = (over: Partial<Parameters<typeof insertPeriodTable>[0]> = {}) => ({
    name: '共享', nodesPerDay: 12, timeJson: '[1,"08:00",2,"08:45"]',
    smartConfigJson: '', createdAt: 1, updatedAt: 1, ...over,
  })
  const ownTable = async () =>
    insertTable({
      name: '手工表', timeJson: '[1,"07:30",2,"09:00"]', smartConfigJson: 'own-cfg', isDefault: 1,
      startDate: '2026-09-01', nodeCount: 10, maxWeek: 20, createdAt: 1,
    })

  it('首次绑定写快照 {t,n,s}; 解绑恢复兼容列并清空快照', async () => {
    const ptId = await insertPeriodTable(mkPT())
    const tId = await ownTable()
    await bindPeriodTable(tId, ptId)
    const bound = await db.timetables.get(tId)
    expect(bound?.periodTableId).toBe(ptId)
    expect(JSON.parse(bound!.preBindSnapshotJson!)).toEqual({
      t: '[1,"07:30",2,"09:00"]', n: 10, s: 'own-cfg',
    })
    // 绑定期间共享表被改 → 镜像写兼容列 (web 读路径依赖)
    await updatePeriodTableContent({ ...(await getPeriodTable(ptId))!, timeJson: '[1,"09:00",2,"09:45"]' })
    // 解绑 → 恢复绑定前手工作息, 而不是镜像副本
    await bindPeriodTable(tId, null)
    const unbound = await db.timetables.get(tId)
    expect(unbound?.periodTableId).toBeNull()
    expect(unbound?.timeJson).toBe('[1,"07:30",2,"09:00"]')
    expect(unbound?.nodeCount).toBe(10)
    expect(unbound?.smartConfigJson).toBe('own-cfg')
    expect(unbound?.preBindSnapshotJson).toBe('')
  })

  it('换绑 (非null→非null) 不刷新快照', async () => {
    const ptA = await insertPeriodTable(mkPT({ name: 'A' }))
    const ptB = await insertPeriodTable(mkPT({ name: 'B' }))
    const tId = await ownTable()
    await bindPeriodTable(tId, ptA)
    const snap1 = (await db.timetables.get(tId))!.preBindSnapshotJson
    await bindPeriodTable(tId, ptB)
    const after = await db.timetables.get(tId)
    expect(after?.periodTableId).toBe(ptB)
    expect(after?.preBindSnapshotJson).toBe(snap1)
  })

  it('悬空目标拒绝 + 目标未变不动库不拍快照', async () => {
    const ptId = await insertPeriodTable(mkPT())
    const tId = await ownTable()
    const undoBefore = useUndoStore.getState().slot
    await bindPeriodTable(tId, 9999) // 悬空 → 拒绝
    expect((await db.timetables.get(tId))?.periodTableId == null).toBe(true)
    expect(useUndoStore.getState().slot).toBe(undoBefore)
    await bindPeriodTable(tId, ptId) // 有效绑定拍了快照
    const snap = useUndoStore.getState().slot
    await bindPeriodTable(tId, ptId) // 目标未变 → 不再拍
    expect(useUndoStore.getState().slot).toBe(snap)
  })

  it('updateTableMetadataAndBind: 绑定态纯元数据写不动时间域; 解绑态叠编辑时间域', async () => {
    const ptId = await insertPeriodTable(mkPT())
    const tId = await ownTable()
    // 绑定态 (pendingBind==当前): 元数据写, 时间域保持镜像
    await bindPeriodTable(tId, ptId)
    await updatePeriodTableContent({ ...(await getPeriodTable(ptId))!, timeJson: '[1,"09:00",2,"09:45"]' })
    await updateTableMetadataAndBind({
      ...(await db.timetables.get(tId))!, name: '改名', startDate: '2026-09-07', maxWeek: 22,
      timeJson: 'IGNORED', smartConfigJson: 'IGNORED', nodeCount: 3,
    }, ptId)
    let row = await db.timetables.get(tId)
    expect(row?.name).toBe('改名')
    expect(row?.startDate).toBe('2026-09-07')
    expect(row?.maxWeek).toBe(22)
    expect(row?.timeJson).toBe('[1,"09:00",2,"09:45"]') // 时间域未被覆盖
    expect(row?.nodeCount).toBe(12)
    // 解绑 + 用户编辑: 恢复快照后叠编辑值
    await updateTableMetadataAndBind({
      ...(await db.timetables.get(tId))!, name: '再改',
      timeJson: '[1,"06:00",2,"07:00"]', smartConfigJson: 'edited', nodeCount: 8,
    }, null)
    row = await db.timetables.get(tId)
    expect(row?.periodTableId).toBeNull()
    expect(row?.timeJson).toBe('[1,"06:00",2,"07:00"]') // 用户编辑是解绑后真值
    expect(row?.smartConfigJson).toBe('edited')
    expect(row?.nodeCount).toBe(8)
    expect(row?.preBindSnapshotJson).toBe('')
  })

  it('updateTableMetadataAndBind: 首次绑定写快照且 periodContent 落回目标表', async () => {
    const ptId = await insertPeriodTable(mkPT())
    const tId = await ownTable()
    await updateTableMetadataAndBind(
      { ...(await db.timetables.get(tId))!, timeJson: '[1,"10:00",2,"11:00"]', smartConfigJson: 'x', nodeCount: 5 },
      ptId,
      { ...(await getPeriodTable(ptId))!, timeJson: '[1,"10:00",2,"11:00"]', nodesPerDay: 5 },
    )
    const row = await db.timetables.get(tId)
    expect(row?.periodTableId).toBe(ptId)
    expect(JSON.parse(row!.preBindSnapshotJson!)).toEqual({ t: '[1,"07:30",2,"09:00"]', n: 10, s: 'own-cfg' })
    expect((await getPeriodTable(ptId))?.timeJson).toBe('[1,"10:00",2,"11:00"]')
  })

  it('updateTableMetadataAndBind: 悬空 periodTableId / 悬空 periodContent 拒绝', async () => {
    const tId = await ownTable()
    await updateTableMetadataAndBind({ ...(await db.timetables.get(tId))!, name: 'X' }, 9999)
    expect((await db.timetables.get(tId))?.name).toBe('手工表')
  })
})

describe('导入草稿 import_drafts (Room v10 1:1)', () => {
  const mkDraft = (id: string, over: Partial<Parameters<typeof saveImportDraft>[0]> = {}) => ({
    id, sourceType: 'jw', sourceUrl: 'https://jw.example.edu.cn',
    payloadJson: '{"rows":[]}', createdAt: 100, updatedAt: 100, ...over,
  })

  it('save/load/delete + updatedAt 降序', async () => {
    await saveImportDraft(mkDraft('d1', { updatedAt: 100 }))
    await saveImportDraft(mkDraft('d2', { updatedAt: 300 }))
    await saveImportDraft(mkDraft('d3', { updatedAt: 200 }))
    expect((await loadImportDrafts()).map((d) => d.id)).toEqual(['d2', 'd3', 'd1'])
    // 同 id 幂等重试覆盖
    await saveImportDraft(mkDraft('d1', { updatedAt: 400, payloadJson: '{"rows":[1]}' }))
    const all = await loadImportDrafts()
    expect(all).toHaveLength(3)
    expect(all[0].payloadJson).toBe('{"rows":[1]}')
    await deleteImportDraft('d1')
    expect((await loadImportDrafts()).map((d) => d.id)).toEqual(['d2', 'd3'])
  })
})
