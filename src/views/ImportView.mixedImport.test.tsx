/**
 * ImportView v1.0.56 T10 混合导入 (P 区块 + 课程) — ImportAsNew 自动建作息表并绑定。
 *
 * 行为契约 (ImportSheet.kt:1493-1506 1:1):
 *  - 解析端 periodTable 非空 + 选 ImportAsNew → 自动建 periodTables (suggestUniqueName 顺跳)
 *  - 新建课表 periodTableId 直接指向该作息表
 *  - timetables count = +1, periodTables count = +1
 *  - 旧格式 (periodTable=null) → 不建作息表 (用课表兼容列, 不误共享)
 *
 * UI 测试利用 exportSleepyV1File 生成带 P 行 + C 行的真实 sleepy-v1 文本作为粘贴输入,
 * 端到端验证混合导入路径。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { ImportView } from './ImportView'
import { initI18n } from '../i18n'
import { useUndoStore } from '../data/undoStore'
import { exportSleepyV1File } from '../domain/import/sleepyNativeExporter'
import type { Course } from '../data/types'

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

import { DEFAULT_TIME_JSON } from '../domain/timeTable'

// PERIOD_EXPORT.timeJson = DEFAULT_TIME_JSON → matchesNdPreset 命中 → 写 Pd (规范折叠)
// 空 timeJson 不写任何 Pd/Pn → parser 拼不出 periodTable (periodNodeTimes.size === 0 → null)
const PERIOD_EXPORT = { id: 42, name: '春季作息', nodesPerDay: 12, timeJson: DEFAULT_TIME_JSON }

// 课表兼容列: 4 节稀疏 (触发 N 行而非 Nd, 与作息表 P 区块形态区分)
const TIME_JSON = JSON.stringify([
  { node: 1, start: '08:00', end: '08:45' },
  { node: 2, start: '08:55', end: '09:40' },
  { node: 3, start: '10:00', end: '10:45' },
  { node: 12, start: '21:45', end: '22:30' },
])

function mkCourse(p: Partial<Course> & { courseName: string }): Course {
  return {
    id: 0, groupId: p.groupId ?? '', tableId: 1, courseName: p.courseName,
    teacher: p.teacher ?? '', room: p.room ?? '', note: p.note ?? '', alias: p.alias ?? '',
    day: p.day ?? 1, startNode: p.startNode ?? 1, step: p.step ?? 2,
    startWeek: p.startWeek ?? 1, endWeek: p.endWeek ?? 16, type: p.type ?? 0,
    color: p.color ?? '#FF6750A4', colorMode: 0,
    ownTime: p.ownTime ?? false, startTime: p.startTime ?? '', endTime: p.endTime ?? '',
    isIrregularNode: false, isIrregularTime: false, credit: 0, level: 0,
  }
}

/** 打开粘贴区 + 填文本 + 点「预览导入」 */
async function paste(text: string, onDone?: () => void) {
  render(<ImportView onDone={onDone ?? vi.fn()} />)
  fireEvent.click(screen.getByText('粘贴课表文本'))
  const ta = screen.getByLabelText('粘贴课表文本') as HTMLTextAreaElement
  fireEvent.change(ta, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '预览导入' }))
}

/** onDone 信号 — await 它保证 applyPreview 全链 (含 endBatch) 在 afterEach 关库前跑完,
 *  避免 liveQuery 尾巴撞上 db.delete() 抛 DatabaseClosedError 未处理拒绝 */
function makeDone(): { promise: Promise<void>; done: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, done: resolve }
}

describe('ImportView v1.0.56 T10 混合导入 (issue#40 §6 + T10)', () => {
  it('P 区块 + 课程 → ImportAsNew 自动建作息表, 新课表 periodTableId 指向该表', async () => {
    // 用真实 exporter 生成带 P 行的 sleepy-v1 文本
    const text = exportSleepyV1File(
      '混合课表', '2026-09-07', 20, 12, TIME_JSON,
      [mkCourse({ courseName: '高等数学' })],
      PERIOD_EXPORT,
    )
    expect(text).toContain('P春季作息|42|12')

    const { promise: doneP, done } = makeDone()
    await paste(text, done)
    // 解析端非纯作息 → 进 PreviewDialog (不是命名框); 标题 = import_preview_title「导入预览」。
    // (PreviewDialog 1:1 只显示课程数指标, 不列课名 — 课名断言放落库环节)
    await waitFor(() => expect(screen.getByText('导入预览')).toBeTruthy())
    expect(screen.queryByText('导入作息表')).toBeNull()

    // 无已有表 → 唯一按钮「导入为新课表」
    fireEvent.click(screen.getByRole('button', { name: '导入为新课表' }))

    // 确认弹窗 (ImportAsNew 走 ConfirmDialog)
    await waitFor(() => expect(screen.getByText('确认导入')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    // 等异步落库
    let savedPid: number | undefined
    for (let i = 0; i < 50; i++) {
      const tables = await db.timetables.toArray()
      const periods = await db.periodTables.toArray()
      if (tables.length === 1 && periods.length === 1) {
        savedPid = periods[0].id
        break
      }
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(savedPid).toBeDefined()
    await doneP

    const table = (await db.timetables.toArray())[0]
    const period = (await db.periodTables.toArray())[0]
    expect(table.name).toBe('混合课表')
    expect(table.periodTableId).toBe(period.id)
    expect(period.name).toBe('春季作息')
    expect(period.nodesPerDay).toBe(12)
  })

  it('旧格式 (无 P 区块) → ImportAsNew 不建作息表, 新课表 periodTableId=null', async () => {
    const text = exportSleepyV1File(
      '纯课表', '2026-09-07', 20, 12, TIME_JSON,
      [mkCourse({ courseName: '线性代数' })],
      null, // 无 periodTable
    )
    expect(text).not.toContain('P')

    const { promise: doneP, done } = makeDone()
    await paste(text, done)
    await waitFor(() => expect(screen.getByText('导入预览')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '导入为新课表' }))
    await waitFor(() => expect(screen.getByText('确认导入')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    let tableCount = 0
    for (let i = 0; i < 50; i++) {
      tableCount = await db.timetables.count()
      if (tableCount === 1) break
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(tableCount).toBe(1)
    expect(await db.periodTables.count()).toBe(0)
    await doneP
    const table = (await db.timetables.toArray())[0]
    expect(table.periodTableId).toBeNull()
    expect(table.name).toBe('纯课表')
  })

  it('混合导入撞名: 作息表名顺跳 2, 不撞既有课表名', async () => {
    await db.timetables.add({
      id: 1, name: '春季作息', isDefault: 1, periodTableId: null,
      timeJson: '[]', smartConfigJson: '', startDate: '2026-09-07',
      nodeCount: 12, maxWeek: 20, createdAt: 0,
    })
    const text = exportSleepyV1File(
      '新混合', '2026-09-07', 20, 12, TIME_JSON,
      [mkCourse({ courseName: '高数' })],
      PERIOD_EXPORT,
    )
    const { promise: doneP, done } = makeDone()
    await paste(text, done)
    await waitFor(() => expect(screen.getByText('导入预览')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '导入为新课表' }))
    await waitFor(() => expect(screen.getByText('确认导入')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }))

    let periodName: string | undefined
    for (let i = 0; i < 50; i++) {
      const periods = await db.periodTables.toArray()
      if (periods.length === 1) { periodName = periods[0].name; break }
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(periodName).toBe('春季作息2')
    await doneP
  })
})
