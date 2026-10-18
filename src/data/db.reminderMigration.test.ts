/**
 * DB v3→v4 迁移测试 — Room TableReminderMigrationTest.kt (v10→v11) 的 web 对位 (ref #143)。
 * 锁定: 升级后所有旧行 reminderEnabled=1 (Android「升级行为不变」), 新读路径缺列回退 true。
 * fake-indexeddb 不校验 Dexie 版本顺序 → 用「低版本 schema 建库写行 → 以 v4 重开」走真 upgrade。
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { db } from './db'

interface V3Row {
  id: number
  name: string
  isDefault: number
}

describe('db v4 迁移 — timetables.reminderEnabled 回填 (ref #143)', () => {
  it('v3 老库升级后所有表 reminderEnabled=1', async () => {
    await db.delete()

    // 1) 以 v3 形态建库并写入两行 (无 reminderEnabled 列的旧数据)
    const legacy = new Dexie('sleepy')
    legacy.version(1).stores({ timetables: 'id, isDefault' })
    await legacy.open()
    await legacy.table('timetables').bulkPut([
      { id: 1, name: '旧表A', isDefault: 1 },
      { id: 2, name: '旧表B', isDefault: 0 },
    ] satisfies V3Row[])
    await legacy.close()

    // 2) 以当前 schema (含 version(4) upgrade) 重开 → 触发迁移
    await db.open()
    const rows = await db.timetables.toArray()
    expect(rows).toHaveLength(2)
    // 3) 旧行一律回填 1 = 升级零行为变化 (Android DEFAULT 1 同语义)
    expect(rows.map((r) => r.reminderEnabled).sort()).toEqual([1, 1])

    await db.delete()
  })
})
