/**
 * 顶栏左缘图标契约 (用户 2026-10-27 定案):
 * 安卓 ScheduleScreen.kt:512 顶栏最左 = WeekNavButton(Icons.Outlined.CalendarMonth),
 * 网页版对齐安卓必须用同源 Material 日历图标, 禁品牌位图 logo —
 * SleepyLogo 位图走运行时拼接绝对路径, 在官网 /preview 反代前缀下解析到 Pages 根 404,
 * 线上呈现为挂掉的破图。锁的是「顶栏图标 = CalendarMonth 矢量且无 img 位图」这一形态本身。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { db } from '../data/db'
import { ScheduleView } from './ScheduleView'
import { initI18n } from '../i18n'

beforeAll(() => {
  initI18n('zh-CN')
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试替身
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

afterEach(async () => {
  cleanup()
  await db.delete()
  await db.open()
})

async function seedOneTable() {
  await db.timetables.add({
    id: 1,
    name: '课表A',
    isDefault: 1,
    periodTableId: null,
    timeJson: JSON.stringify([{ node: 1, start: '08:00', end: '08:45' }]),
    smartConfigJson: '',
    startDate: '2026-09-07',
    nodeCount: 12,
    maxWeek: 20,
    createdAt: 0,
  })
}

// Material CalendarMonth outlined 24px path 前缀 (与安卓 Icons.Outlined.CalendarMonth 同源, icons.tsx)
const CALENDAR_PATH_PREFIX = 'M19,4h-1V2h-2v2H8V2H6v2H5'

describe('顶栏左缘图标 — 对齐安卓 CalendarMonth', () => {
  it('普通态: 切换课表按钮内是 CalendarMonth 矢量图标, 无位图 img', async () => {
    await seedOneTable()
    render(<ScheduleView />)
    const btn = await screen.findByTitle('切换课表')
    expect(btn.querySelector('svg path')).toBeTruthy()
    expect(btn.querySelector('svg path')!.getAttribute('d')!.startsWith(CALENDAR_PATH_PREFIX)).toBe(true)
    expect(btn.querySelector('img')).toBeNull()
  })

  it('只读态(public 分享部署): 整个文档不允许出现 sleepy-logo 位图', async () => {
    await seedOneTable()
    render(<ScheduleView readOnly />)
    // hasTable 异步落地后再查
    await screen.findByText('课表A').catch(() => null)
    const imgs = Array.from(document.querySelectorAll('img'))
    expect(imgs.some((i) => i.getAttribute('src')?.includes('sleepy-logo'))).toBe(false)
  })

  it('源码层锁死: icons.tsx 不再导出位图 SleepyLogo 组件', async () => {
    const mod = await import('../components/icons')
    expect('SleepyLogo' in mod).toBe(false)
  })
})
