/**
 * PeriodTableEditView v1.0.56 T6 第三 Tab「作息表」— 取入契约。
 *
 * 行为契约 (PeriodTableEditScreen.kt:284-300 1:1):
 *  - 当库中存在其他作息表时, TimeSlotSection 渲染第三 Tab「作息表」
 *  - 列表里排除当前编辑的作息表 (禁自引用)
 *  - 选中某作息表 → rowsDraft 替换为该表节次, smartConfig 同步 (decodeSmartConfig
 *    ?? inferSmartConfig fallback)
 *  - 选「未绑定」清除选中态, rowsDraft 不变
 *  - 保存不直接写库 — 走 handleSave 弹 PreviewConfirmDialog, 确认后才落库
 *
 * 不变量:
 *  - 自己不出现在候选列表 (excludePeriodTableId 生效)
 *  - 取入内容是另一张表的节次, 不是当前表的
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../../data/db'
import { PeriodTableEditView } from './PeriodTableEditView'
import { initI18n } from '../../i18n'
import { useUndoStore } from '../../data/undoStore'

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

const TIME_8 = JSON.stringify([
  { node: 1, start: '08:00', end: '08:45' },
  { node: 2, start: '08:55', end: '09:40' },
  { node: 3, start: '10:00', end: '10:45' },
  { node: 4, start: '10:55', end: '11:40' },
  { node: 5, start: '14:00', end: '14:45' },
  { node: 6, start: '14:55', end: '15:40' },
  { node: 7, start: '16:00', end: '16:45' },
  { node: 8, start: '16:55', end: '17:40' },
])

const TIME_10 = JSON.stringify([
  { node: 1, start: '08:30', end: '09:15' },
  { node: 2, start: '09:25', end: '10:10' },
  { node: 3, start: '10:30', end: '11:15' },
  { node: 4, start: '11:25', end: '12:10' },
  { node: 5, start: '14:30', end: '15:15' },
  { node: 6, start: '15:25', end: '16:10' },
  { node: 7, start: '16:30', end: '17:15' },
  { node: 8, start: '17:25', end: '18:10' },
  { node: 9, start: '19:30', end: '20:15' },
  { node: 10, start: '20:25', end: '21:10' },
])

/** 等 liveQuery 首帧数据到达 (视图在 periodTable 到达前渲染 padding 占位) */
async function waitForView() {
  await waitFor(() => expect(screen.getByText('节次时间表')).toBeTruthy())
}

/** 第三 Tab「作息表」— 页面标题 (SettingsScaffold) 与 SegmentedSwitcher 选项撞名,
 *  取 getAllByText 的最后一项 = switcher 选项 */
function switcherTab(): HTMLElement {
  const all = screen.getAllByText('作息表')
  return all[all.length - 1]!
}

describe('PeriodTableEditView v1.0.56 T6 第三 Tab「作息表」取入', () => {
  it('候选列表排除自己 (excludePeriodTableId 生效)', async () => {
    await db.periodTables.bulkAdd([
      { id: 1, name: '本表', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
      { id: 2, name: '候选A', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
      { id: 3, name: '候选B', nodesPerDay: 10, timeJson: TIME_10, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
    ])
    render(<PeriodTableEditView id={1} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitForView()
    // 切到第三 Tab「作息表」
    fireEvent.click(switcherTab())
    // 等 liveQuery 候选列表渲染
    await waitFor(() => {
      expect(screen.queryByText('候选A')).toBeTruthy()
    })
    // 候选列表显示 A + B, 不显示「本表」
    expect(screen.getByText('候选A')).toBeTruthy()
    expect(screen.getByText('候选B')).toBeTruthy()
    // 「未绑定」选项常驻
    expect(screen.getByText('未绑定（使用本表作息）')).toBeTruthy()
    // 本表不出现在候选里 — 靠查询 DOM 确认
    expect(screen.queryByText('本表')).toBeNull()
  })

  it('选中候选 → rowsDraft 被替换为该表节次内容', async () => {
    await db.periodTables.bulkAdd([
      { id: 1, name: '本表', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
      { id: 2, name: '候选A_8节', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
      { id: 3, name: '候选B_10节', nodesPerDay: 10, timeJson: TIME_10, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
    ])
    render(<PeriodTableEditView id={1} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitForView()
    // 切回手动 Tab, 看 rowsDraft = 8 节 (本表)
    fireEvent.click(screen.getByText('手动模式'))
    let inputs1 = document.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>
    expect(inputs1.length).toBe(16) // 8 节 × (start + end)
    // 切到「作息表」Tab, 选候选B
    fireEvent.click(switcherTab())
    await waitFor(() => expect(screen.queryByText('候选B_10节')).toBeTruthy())
    fireEvent.click(screen.getByText('候选B_10节'))
    // 切回手动 Tab, rowsDraft 现在 = 10 节
    fireEvent.click(screen.getByText('手动模式'))
    let inputs2 = document.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>
    expect(inputs2.length).toBe(20) // 10 节 × (start + end)
    // 第 9 节 start = 19:30 (来自 TIME_10)
    const ninthStart = inputs2[16] as HTMLInputElement
    expect(ninthStart.value).toBe('19:30')
  })

  it('选「未绑定」清除选中态, rowsDraft 不变', async () => {
    await db.periodTables.bulkAdd([
      { id: 1, name: '本表', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
      { id: 2, name: '候选A_8节', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
    ])
    render(<PeriodTableEditView id={1} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitForView()
    fireEvent.click(switcherTab())
    await waitFor(() => expect(screen.queryByText('候选A_8节')).toBeTruthy())
    // 选候选 → 选中态对勾在该行
    fireEvent.click(screen.getByText('候选A_8节'))
    // 切回手动 Tab, rowsDraft 还是 8 节
    fireEvent.click(screen.getByText('手动模式'))
    let inputs = document.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>
    expect(inputs.length).toBe(16)
    // 再切回作息表 Tab, 点「未绑定」
    fireEvent.click(switcherTab())
    fireEvent.click(screen.getByText('未绑定（使用本表作息）'))
    // rowsDraft 仍是 8 节 (取入动作是单向 — 选未绑定不清空已取入内容, 留着供用户
    // 编辑/取消保存前回到 Android 原语义; 测试锁的是: rowsDraft 不会因取消选中被改写)
    fireEvent.click(screen.getByText('手动模式'))
    const inputsAfter = document.querySelectorAll('input[type="time"]') as NodeListOf<HTMLInputElement>
    expect(inputsAfter.length).toBe(16)
  })

  it('无其他作息表 → 第三 Tab 不渲染', async () => {
    await db.periodTables.add({ id: 1, name: '独苗', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 })
    render(<PeriodTableEditView id={1} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitForView()
    // 模式切换只有手动/自动两 Tab
    expect(screen.getByText('手动模式')).toBeTruthy()
    expect(screen.getByText('自动模式')).toBeTruthy()
    // 页面标题恒为「作息表」(SettingsScaffold) — 第三 Tab 不渲染 = 标题是唯一匹配
    expect(screen.getAllByText('作息表')).toHaveLength(1)
  })

  it('取入后点保存 → 弹 PreviewConfirmDialog, 确认才写入新 timeJson', async () => {
    await db.periodTables.bulkAdd([
      { id: 1, name: '本表', nodesPerDay: 8, timeJson: TIME_8, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
      { id: 2, name: '候选B_10节', nodesPerDay: 10, timeJson: TIME_10, smartConfigJson: '', createdAt: 0, updatedAt: 0 },
    ])
    render(<PeriodTableEditView id={1} onBack={vi.fn()} onSaved={vi.fn()} />)
    await waitForView()
    fireEvent.click(switcherTab())
    await waitFor(() => expect(screen.queryByText('候选B_10节')).toBeTruthy())
    fireEvent.click(screen.getByText('候选B_10节'))
    // 落库前必走预览, 不直写 — PreviewConfirmDialog 出现
    // 保存按钮 = edit_table_save「保存课表设置」(PeriodTableEditView 复用课表侧 key)
    fireEvent.click(screen.getByText('保存课表设置'))
    await waitFor(() => expect(screen.queryByText('保存前预览')).toBeTruthy())
    // 此时数据库仍是旧 8 节, 未确认前不应写
    const ptBefore = (await db.periodTables.toArray()).find((p) => p.id === 1)!
    expect(ptBefore.nodesPerDay).toBe(8)
    fireEvent.click(screen.getByText('确认保存'))
    // 等异步落库
    for (let i = 0; i < 50; i++) {
      const pt = (await db.periodTables.toArray()).find((p) => p.id === 1)!
      if (pt.nodesPerDay === 10) break
      await new Promise((r) => setTimeout(r, 20))
    }
    const pt = (await db.periodTables.toArray()).find((p) => p.id === 1)!
    expect(pt.nodesPerDay).toBe(10)
  })
})