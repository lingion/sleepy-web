import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from './db'
import { seedSampleTable } from './sampleTable'

beforeEach(async () => {
  await db.timetables.clear()
  await db.courses.clear()
  await db.prefs.clear()
})

describe('seedSampleTable — 首次打开默认示例课表', () => {
  it('空库首调: seed 一张默认表 + 9 门示例课 + 打防重标记', async () => {
    await seedSampleTable()

    const tables = await db.timetables.toArray()
    expect(tables).toHaveLength(1)
    expect(tables[0].isDefault).toBe(1)
    expect(tables[0].name).toBeTruthy()
    expect(tables[0].startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // startDate 必须是周一 (周次语义正确性)
    expect(new Date(tables[0].startDate + 'T00:00:00').getDay()).toBe(1)

    const courses = await db.courses.where('tableId').equals(tables[0].id).toArray()
    expect(courses).toHaveLength(9)
    // 单周/双周语义锁 (type: 1=单周 2=双周)
    expect(courses.filter((c) => c.type === 1).length).toBe(1)
    expect(courses.filter((c) => c.type === 2).length).toBe(1)
    // 同名课共享 groupId (组色共享)
    const ds = courses.filter((c) => c.courseName === '数据结构')
    expect(ds).toHaveLength(2)
    expect(ds[0].groupId).toBe(ds[1].groupId)
  })

  it('防重: 已 seed 再调不复活不重复', async () => {
    await seedSampleTable()
    // 用户删了示例表
    await db.timetables.clear()
    await db.courses.clear()
    await seedSampleTable()

    expect(await db.timetables.count()).toBe(0)
    expect(await db.courses.count()).toBe(0)
  })

  it('老用户已有表: 只打标记不塞数据', async () => {
    await db.timetables.put({
      id: 1, name: '我的表', startDate: '2026-09-07', timeJson: '[]',
      isDefault: 1, maxWeek: 20, createdAt: 1, smartConfigJson: '', nodeCount: 12,
    })
    await seedSampleTable()

    const tables = await db.timetables.toArray()
    expect(tables).toHaveLength(1)
    expect(tables[0].name).toBe('我的表')
    expect(await db.courses.count()).toBe(0)
    expect(await db.prefs.get('sampleTableSeeded')).toBeTruthy()
  })
})
