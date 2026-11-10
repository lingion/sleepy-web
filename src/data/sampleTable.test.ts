import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import i18next from 'i18next'
import { db } from './db'
import { seedSampleTable } from './sampleTable'
import type { Course } from './types'

beforeEach(async () => {
  await db.timetables.clear()
  await db.courses.clear()
  await db.prefs.clear()
})
afterEach(() => vi.restoreAllMocks())

function orphanCourse(id: number): Course {
  return {
    id, tableId: 99, groupId: 'saved-course', courseName: '保留课程',
    teacher: '原教师', room: '原教室', note: '不得覆盖', alias: '',
    day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0,
    color: '#ff123456', colorMode: 2, ownTime: false,
    isIrregularNode: false, isIrregularTime: false,
    startTime: '', endTime: '', credit: 2, level: 0,
  }
}

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
    // "已开学一周": 起点必须早于本周一 → 当前周次 ≥ 2 (指令 2026-09-15)
    const now = new Date()
    const dow = now.getDay() === 0 ? 7 : now.getDay()
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - (dow - 1))
    thisMonday.setHours(0, 0, 0, 0)
    expect(new Date(tables[0].startDate + 'T00:00:00').getTime()).toBeLessThan(thisMonday.getTime())

    const courses = await db.courses.where('tableId').equals(tables[0].id).toArray()
    expect(courses).toHaveLength(9)
    // 单周/双周语义锁 (type: 1=单周 2=双周)
    expect(courses.filter((c) => c.type === 1).length).toBe(1)
    expect(courses.filter((c) => c.type === 2).length).toBe(1)
    // 同名课共享 groupId (组色共享)
    const ds = courses.filter((c) => c.courseName === '数据结构')
    expect(ds).toHaveLength(2)
    expect(ds[0].groupId).toBe(ds[1].groupId)
    expect(await db.prefs.get('sampleTableSeeded')).toEqual({ key: 'sampleTableSeeded', value: '1' })
    expect(await db.prefs.get('sampleTableId')).toEqual({ key: 'sampleTableId', value: String(tables[0].id) })
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
    expect(await db.prefs.get('sampleTableId')).toBeUndefined()

    await db.timetables.clear()
    await seedSampleTable()
    expect(await db.timetables.count()).toBe(0)
  })

  it.each(['', '0'])('防重标记行存在即跳过，即使 value 为 %j', async value => {
    const flag = { key: 'sampleTableSeeded', value }
    await db.prefs.put(flag)

    await seedSampleTable()

    expect(await db.timetables.count()).toBe(0)
    expect(await db.courses.count()).toBe(0)
    expect(await db.prefs.toArray()).toEqual([flag])
  })

  it('空课表但有孤立课程时从最大课程 ID 之后分配，不覆盖任何旧行', async () => {
    const saved = [orphanCourse(1), orphanCourse(42)]
    await db.courses.bulkPut(saved)

    await seedSampleTable()

    expect(await db.courses.bulkGet([1, 42])).toEqual(saved)
    const courses = await db.courses.where('tableId').equals(1).toArray()
    expect(courses.map(course => course.id)).toEqual([43, 44, 45, 46, 47, 48, 49, 50, 51])
    expect(await db.courses.count()).toBe(11)
  })

  it('空库首开只使用一次原生读写事务和一次课程批量写入', async () => {
    // Dexie binds the native transaction function when opening the DB. Attach
    // before reopening, then exclude schema inspection from the seed budget.
    db.close()
    const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction')
    await db.open()
    transactions.mockClear()
    const bulkWrite = vi.spyOn(db.courses, 'bulkPut')

    await seedSampleTable()

    expect(transactions).toHaveBeenCalledTimes(1)
    const [stores, mode] = transactions.mock.calls[0]
    expect(Array.from(stores).sort()).toEqual(['courses', 'prefs', 'timetables'])
    expect(mode).toBe('readwrite')
    expect(bulkWrite).toHaveBeenCalledTimes(1)
    expect(bulkWrite.mock.calls[0][0]).toHaveLength(9)
  })

  it.each(['课程写入', '最后示例 ID 写入'])('%s失败时回滚全部 seed 写入，保留旧数据且可重试', async stage => {
    const saved = orphanCourse(42)
    const preferences = { key: 'prefs', value: '{"lang":"en"}' }
    await db.courses.put(saved)
    await db.prefs.put(preferences)
    const failure = new Error('seed write failed')
    const failCourse = (_key: number, course: Course) => {
      if (stage === '课程写入' && course.courseName === '体育') throw failure
    }
    const failMetadata = (_key: string, row: { key: string }) => {
      if (stage === '最后示例 ID 写入' && row.key === 'sampleTableId') throw failure
    }
    db.courses.hook('creating', failCourse)
    db.prefs.hook('creating', failMetadata)
    try {
      await expect(seedSampleTable()).rejects.toThrow('seed write failed')
    } finally {
      db.courses.hook('creating').unsubscribe(failCourse)
      db.prefs.hook('creating').unsubscribe(failMetadata)
    }

    expect(await db.timetables.count()).toBe(0)
    expect(await db.courses.toArray()).toEqual([saved])
    expect(await db.prefs.toArray()).toEqual([preferences])

    await seedSampleTable()
    expect(await db.timetables.count()).toBe(1)
    expect(await db.courses.count()).toBe(10)
    expect(await db.courses.get(saved.id)).toEqual(saved)
    expect(await db.prefs.get('sampleTableSeeded')).toEqual({ key: 'sampleTableSeeded', value: '1' })
    expect(await db.prefs.get('sampleTableId')).toEqual({ key: 'sampleTableId', value: '1' })
  })

  it('使用调用前已准备好的语言命名，不在事务里重置为系统语言', async () => {
    await i18next.init({
      lng: 'en', fallbackLng: false, initImmediate: false,
      resources: { en: { translation: { sample_table_name: 'Sample timetable' } } },
    })

    await seedSampleTable()

    expect((await db.timetables.get(1))?.name).toBe('Sample timetable')
    expect(i18next.language).toBe('en')
  })
})
