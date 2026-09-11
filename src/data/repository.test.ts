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
  // 每测重建数据库 + undo 栈
  useUndoStore.setState({ undoStack: [], redoStack: [], batchDepth: 0, lastLabel: null })
  await Promise.all([db.timetables.clear(), db.courses.clear(), db.prefs.clear()])
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

  it('assignGroupIds: 同名课共享 groupId', () => {
    const out = assignGroupIds([mkCourse({ courseName: '体育' }), mkCourse({ courseName: '体育' }), mkCourse({ courseName: '英语' })])
    expect(out[0].groupId).toBe(out[1].groupId)
    expect(out[0].groupId).not.toBe(out[2].groupId)
  })
})

describe('undo/redo — 撤回链', () => {
  it('insertCourse 后 undo 恢复空, redo 恢复', async () => {
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    await insertCourse(mkCourse({ tableId }))
    expect(await db.courses.count()).toBe(1)
    expect(await useUndoStore.getState().undo()).toBe(true)
    expect(await db.courses.count()).toBe(0)
    expect(await useUndoStore.getState().redo()).toBe(true)
    expect(await db.courses.count()).toBe(1)
  })

  it('批内只保首个快照 (beginBatch/endBatch)', async () => {
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    useUndoStore.getState().beginBatch()
    await insertCourse(mkCourse({ tableId, courseName: '一' }))
    await insertCourse(mkCourse({ tableId, courseName: '二' }))
    await insertCourse(mkCourse({ tableId, courseName: '三' }))
    await useUndoStore.getState().endBatch()
    // 一次 undo 撤回整批
    await useUndoStore.getState().undo()
    expect(await db.courses.count()).toBe(0)
    // 批前快照在 (首表插入), 再 undo 撤掉表
    expect(await useUndoStore.getState().undo()).toBe(true)
    expect(await db.timetables.count()).toBe(0)
  })

  it('undo 到空后返回 false', async () => {
    expect(await useUndoStore.getState().undo()).toBe(false)
  })

  it('新动作清空 redo 栈', async () => {
    const tableId = await insertTable({ name: 'A', timeJson: '[]', smartConfigJson: '', isDefault: 1, startDate: '', nodeCount: 12, maxWeek: 20, createdAt: 1 })
    await insertCourse(mkCourse({ tableId }))
    await useUndoStore.getState().undo()
    expect(useUndoStore.getState().canRedo()).toBe(true)
    await insertCourse(mkCourse({ tableId, courseName: 'new' }))
    expect(useUndoStore.getState().canRedo()).toBe(false)
  })
})
