/**
 * ImportView v1.0.56 T9 纯作息导入 — UI 渲染冒烟 + 落库契约。
 * 解析端 (parseSchedule/P 行族) 已在 sleepyNativePeriod.test.ts 锁 12 用例,
 * 此处仅锁: 纯 P 文本触发纯作息命名框 + 确认只建作息表, 不建空课表。
 *
 * 行为契约 (ImportSheet.kt:419-490 applyPurePeriodImport 1:1):
 *  - 粘贴只含 P 区块的文本 → 弹「导入作息表」标题的命名框
 *  - 预填名 = 全局唯一名(课表∪作息表), 撞名报错, 确认按钮在空名/撞名时禁用
 *  - 确认 → 仅 insertPeriodTable 一行, timetables 不新增
 *  - 含课程的 P 文本 → 走 PreviewDialog(本测试不覆盖, 见 importExport.test.ts)
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { ImportView } from './ImportView'
import { initI18n } from '../i18n'
import { useUndoStore } from '../data/undoStore'

beforeAll(() => {
  initI18n('zh-CN')
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  useUndoStore.setState({ slot: null, batchDepth: 0, batchCaptured: false, restoring: false })
  await db.delete()
  await db.open()
})

/** 打开粘贴区 (默认折叠) + 填文本 + 点「预览导入」 */
async function paste(text: string) {
  render(<ImportView onDone={vi.fn()} />)
  // liveQuery 首帧是 [] — 等预置表到达再操作, 避免判重漏算 (Android getAllTableNamesOnce 等价时点)
  // 空库才显示「将作为新课表创建」提示 → 消失 = 表数据已就位
  for (let i = 0; i < 50; i++) {
    if ((await db.timetables.count()) > 0 && screen.queryByText('（将作为新课表创建）') === null) break
    await new Promise((r) => setTimeout(r, 20))
  }
  // 默认折叠 — 展开
  fireEvent.click(screen.getByText('粘贴课表文本'))
  const ta = screen.getByLabelText('粘贴课表文本') as HTMLTextAreaElement
  fireEvent.change(ta, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '预览导入' }))
}

const PURE_PERIOD_TEXT = '#sleepy-v1\nP春季作息|42|12\nPd'

describe('ImportView v1.0.56 T9 纯作息导入 (issue#40 §6)', () => {
  it('纯 P 文本 → 弹「导入作息表」命名框, 预填解析出的名字', async () => {
    await paste(PURE_PERIOD_TEXT)
    await waitFor(() => expect(screen.getByText('导入作息表')).toBeTruthy())
    const input = screen.getByLabelText('作息表名称') as HTMLInputElement
    expect(input.value).toBe('春季作息')
    expect(screen.getByText(/检测到输入仅包含作息表内容/)).toBeTruthy()
    // 确认/取消按钮
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认导入作息表' })).toBeTruthy()
  })

  it('确认 → 仅 db.periodTables +1, timetables 不动', async () => {
    const initialTables = await db.timetables.count()
    const initialPeriods = await db.periodTables.count()
    await paste(PURE_PERIOD_TEXT)
    await waitFor(() => screen.getByText('导入作息表'))
    fireEvent.click(screen.getByRole('button', { name: '确认导入作息表' }))

    // 轮询等落库 (onConfirm 是 async; waitFor 里放 resolves 断言会吞错误栈)
    let saved: { name: string; nodesPerDay: number; timeJson: string } | undefined
    for (let i = 0; i < 50; i++) {
      const rows = await db.periodTables.toArray()
      if (rows.length === initialPeriods + 1) { saved = rows[rows.length - 1]; break }
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(saved).toBeDefined()
    expect(await db.timetables.count()).toBe(initialTables)
    expect(saved!.name).toBe('春季作息')
    expect(saved!.nodesPerDay).toBe(12)
    expect(JSON.parse(saved!.timeJson)).toHaveLength(12)
  })

  it('解析名撞已存在的课表名 → 预填顺跳 (suggestUniqueName)', async () => {
    await db.timetables.add({
      id: 1, name: '春季作息', isDefault: 1, periodTableId: null,
      timeJson: '[]', smartConfigJson: '', startDate: '2026-09-07',
      nodeCount: 12, maxWeek: 20, createdAt: 0,
    })
    await paste(PURE_PERIOD_TEXT)
    await waitFor(() => screen.getByText('导入作息表'))
    const input = screen.getByLabelText(/作息表名称/) as HTMLInputElement
    expect(input.value).toBe('春季作息2')
  })

  it('撞名错误提示在用户手输与已存在名一致时出现, 确认按钮禁用', async () => {
    await db.timetables.add({
      id: 1, name: '春季作息', isDefault: 1, periodTableId: null,
      timeJson: '[]', smartConfigJson: '', startDate: '2026-09-07',
      nodeCount: 12, maxWeek: 20, createdAt: 0,
    })
    await paste(PURE_PERIOD_TEXT)
    await waitFor(() => screen.getByText('导入作息表'))
    // 清空再手输已存在名 → 撞名 (报错文本挂在同一 label 下, 精确匹配会连坐, 用正则)
    const input = screen.getByLabelText(/作息表名称/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '春季作息' } })
    expect(screen.getByText('该名称已被其他课表或作息表使用')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: '确认导入作息表' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
  })

  it('点取消关闭对话框, 库零变化', async () => {
    const initial = await db.periodTables.count()
    await paste(PURE_PERIOD_TEXT)
    await waitFor(() => screen.getByText('导入作息表'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByText('导入作息表')).toBeNull())
    expect(await db.periodTables.count()).toBe(initial)
  })
})
