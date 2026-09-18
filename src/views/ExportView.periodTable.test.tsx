/**
 * ExportView v1.0.56 T11 作息表导出 — UI 渲染契约。
 *
 * 行为契约 (ExportScreen.kt 2026-09-16 展开框重构 1:1):
 *  - 选表弹窗 = 上半全部课表 + 分隔线 + 下半全部作息表 (课表优先展开完)
 *  - 选中作息表 → 顶部卡副题变「作息表 · N 节/天」
 *  - 选中作息表 → 格式区只剩两项 (原生 + JSON); 选中课表 → 完整四项
 *  - 作息表行 subtitle = 「作息表」(period_tables_title)
 *
 * 文件下载行为不在此测 (jsdom 无真实下载), 只锁 UI 分流。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { ExportView } from './ExportView'
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

const TIME_JSON = JSON.stringify([
  { node: 1, start: '08:00', end: '08:45' },
  { node: 2, start: '08:55', end: '09:40' },
])

async function seed() {
  await db.timetables.add({
    id: 1, name: '课表A', isDefault: 1, periodTableId: null,
    timeJson: TIME_JSON, smartConfigJson: '', startDate: '2026-09-07',
    nodeCount: 12, maxWeek: 20, createdAt: 0,
  })
  await db.periodTables.add({
    id: 7, name: '寒假作息', nodesPerDay: 2, timeJson: TIME_JSON,
    smartConfigJson: '', createdAt: 0, updatedAt: 0,
  })
}

/** 渲染并等 liveQuery 首帧 (课程数据到位后主视图渲染) */
async function renderView() {
  render(<ExportView onBack={vi.fn()} />)
  await waitFor(() => expect(screen.getByText('课表A')).toBeTruthy())
}

describe('ExportView v1.0.56 T11 作息表导出 (issue#40 §4.4)', () => {
  it('选表弹窗: 上半课表 + 分隔线下半作息表, 行 subtitle = 作息表', async () => {
    await seed()
    await renderView()
    fireEvent.click(screen.getByText('课表A'))
    await waitFor(() => expect(screen.getByText('选择要导出的课表')).toBeTruthy())
    // 上半: 课表A; 下半: 寒假作息 + 「作息表」徽标
    expect(screen.getByText('寒假作息')).toBeTruthy()
    expect(screen.getByText('作息表')).toBeTruthy()
  })

  it('选中作息表 → 副题「作息表 · N 节/天」, 格式只剩两项', async () => {
    await seed()
    await renderView()
    fireEvent.click(screen.getByText('课表A'))
    await waitFor(() => expect(screen.getByText('选择要导出的课表')).toBeTruthy())
    fireEvent.click(screen.getByText('寒假作息'))
    // 顶部卡副题切换
    await waitFor(() => expect(screen.getByText(/2 节\/天/)).toBeTruthy())
    // 格式两项: 原生 + JSON (锁标题)
    expect(screen.getByText('Sleepy 原生格式')).toBeTruthy()
    expect(screen.getByText('JSON 格式')).toBeTruthy()
    // 课表四项里的 ICS / 分享文本不再出现
    expect(screen.queryByText('ICS 日历')).toBeNull()
  })

  it('选中课表 (默认态) → 完整四项格式', async () => {
    await seed()
    await renderView()
    // 默认选中课表A — 四项全在
    expect(screen.getByText('WakeUp 兼容 JSON')).toBeTruthy()
    expect(screen.getByText('分享文本')).toBeTruthy()
    expect(screen.getByText('Sleepy 原生格式')).toBeTruthy()
  })
})