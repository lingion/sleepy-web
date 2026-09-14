/**
 * 新建课表待保存动线契约 — MainActivity.kt:237/271-277/311-317 + ScheduleViewModel.kt:171-241。
 *
 * 锁的是规则本身 (用户 2026-09: 二级页面功能全部对齐安卓):
 *   任一「新建课表」入口 = createEmptyTable(commitSelection=false) → 跳 EditTable;
 *   没保存就返回 → 表被删掉且选中落回原表; 保存了 → 表留下、标记清空。
 * 红绿验证: 把 abandonPendingTable 的 discardNewTable 调用删掉 → 第 4 条必须红。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../data/db'
import { createEmptyTable, getDefaultTable, insertTable } from '../data/repository'
import { abandonPendingTable, beginNewTable, usePendingTable } from './pendingTable'
import { initI18n } from '../i18n'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'

/** LocalDate.with(MONDAY).minusWeeks(1) — 本周一再往前一周 */
function lastWeekMonday(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function seedTable(name: string, isDefault: 0 | 1 = 0): Promise<number> {
  return insertTable({
    name,
    startDate: '2026-09-07',
    timeJson: DEFAULT_TIME_JSON,
    smartConfigJson: '',
    isDefault,
    nodeCount: 12,
    maxWeek: 20,
    createdAt: Date.now(),
  })
}

beforeAll(() => initI18n('zh-CN'))

beforeEach(async () => {
  await db.courses.clear()
  await db.timetables.clear()
  usePendingTable.getState().clear()
})

describe('createEmptyTable — ScheduleViewModel.createEmptyTable 1:1', () => {
  it('首表: 名称走 default_table_with_num (✗硬编码「课表 N」), 自动置默认, 开学日=上周一', async () => {
    const id = await createEmptyTable()
    const tb = await db.timetables.get(id)
    expect(tb?.name).toBe('默认1')
    expect(tb?.isDefault).toBe(1)
    expect(tb?.startDate).toBe(lastWeekMonday())
  })

  it('commitSelection=false: 建表但不抢选中 (新建→编辑动线用)', async () => {
    const first = await seedTable('我的课表', 1)
    const id = await createEmptyTable(false)
    expect((await db.timetables.get(id))?.name).toBe('默认2')
    expect((await getDefaultTable())?.id).toBe(first)
  })

  it('名称查重递增: 默认2 已被占用 → 新表叫默认3', async () => {
    await seedTable('A', 1)
    await seedTable('默认2')
    const id = await createEmptyTable(false)
    expect((await db.timetables.get(id))?.name).toBe('默认3')
  })
})

describe('待保存新建 → 返回丢弃 / 保存保留', () => {
  it('beginNewTable 记住原默认表; abandonPendingTable 删表并把选中落回原表', async () => {
    const first = await seedTable('原课表', 1)
    const newId = await beginNewTable()
    const st = usePendingTable.getState()
    expect(st.pendingId).toBe(newId)
    expect(st.previousId).toBe(first)

    await abandonPendingTable()

    expect(await db.timetables.get(newId)).toBeUndefined()
    expect((await getDefaultTable())?.id).toBe(first)
    expect(usePendingTable.getState().pendingId).toBeNull()
  })

  it('保存路径 (EditTableView.settle → clear): 表保留, 标记清空, 不再被丢弃', async () => {
    await seedTable('原课表', 1)
    const newId = await beginNewTable()
    usePendingTable.getState().clear()
    await abandonPendingTable()
    expect(await db.timetables.get(newId)).toBeDefined()
  })

  it('原默认表已不在 → 落回现存默认表 (✗ 丢进无表状态)', async () => {
    const first = await seedTable('原课表', 1)
    const newId = await beginNewTable()
    await db.timetables.update(first, { isDefault: 0 })
    await abandonPendingTable()
    expect(await db.timetables.get(newId)).toBeUndefined()
    const rest = await db.timetables.toArray()
    expect(rest.length).toBe(1)
    expect(rest[0].isDefault).toBe(1)
  })
})
