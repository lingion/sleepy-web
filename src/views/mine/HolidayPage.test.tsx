/**
 * HolidayPage — HolidaySettingsScreen.kt 1:1 (issue#44 第二轮) + HolidaySettingsContractTest 行为对位。
 * 锁定: 卡序、无表提示、下拉顺序(补班日 → 无 → 其他日期…)、按表落盘、孤儿卡清除、无 Empty 文案。
 */

import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../data/db'
import { insertTable } from '../../data/repository'
import { initI18n } from '../../i18n'
import { usePrefsStore } from '../../state/prefsStore'
import { useHolidayStore } from '../../state/holidayStore'
import { HolidayPage } from './HolidayPage'

const year = new Date().getFullYear()
const iso = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const label = (m: number, d: number) => `${m}/${d} (${dayNames[(new Date(year, m - 1, d).getDay() + 6) % 7]})`

beforeAll(() => {
  initI18n('zh-CN')
  ;(window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({
    matches: q.includes('dark'),
  })
})

beforeEach(async () => {
  localStorage.clear()
  await db.timetables.clear()
  // 磁盘缓存命中 → load() 不走网络 (HolidayManager 磁盘层同构)
  localStorage.setItem(
    `sleepy_holiday_cn_${year}`,
    JSON.stringify({
      dates: [
        { date: iso(5, 1), name: '劳动节', type: 'public_holiday' },
        { date: iso(5, 2), name: '劳动节', type: 'public_holiday' },
        { date: iso(4, 26), name: '劳动节', type: 'transfer_workday' },
        { date: iso(5, 9), name: '劳动节', type: 'transfer_workday' },
      ],
    }),
  )
  useHolidayStore.setState({ entries: {}, status: {}, overrides: [] })
  await usePrefsStore.getState().load()
})

afterEach(() => {
  cleanup()
})

function addTable(name: string, isDefault: 0 | 1, createdAt: number) {
  return insertTable({ name, timeJson: '[]', smartConfigJson: '', isDefault, startDate: '', nodeCount: 12, maxWeek: 20, createdAt })
}

function anchorFor(m: number, d: number): HTMLElement {
  const row = screen.getByText(label(m, d)).parentElement as HTMLElement
  return within(row).getByRole('button', { expanded: false })
}

describe('HolidayPage 1:1', () => {
  it('cards follow Android order and show the no-table hint', async () => {
    render(<HolidayPage onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('请先创建课表，再设置调休')).toBeTruthy())
    const text = document.body.textContent ?? ''
    const order = [String(year), '数据源', '法定节假日课程灰显', '调休日按哪天上课', '灰显样式', '劳动节', '添加自定义日期']
    const positions = order.map((s) => text.indexOf(s))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(screen.queryByText('该年份暂无节假日和补班日数据')).toBeNull()
  })

  it('dropdown lists every workday, then 无, then 其他日期…, and writes the default table key', async () => {
    await addTable('旧表', 0, 1)
    const defaultId = await addTable('当前表', 1, 2)
    render(<HolidayPage onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText(label(5, 1))).toBeTruthy())
    await waitFor(() => expect(screen.getByText('每张课表单独设置。未设置的放假日按当天星期取课，不会替你猜。')).toBeTruthy())
    // 多表 → 切换器按 createdAt DESC
    const switcherText = document.body.textContent ?? ''
    expect(switcherText.indexOf('当前表')).toBeLessThan(switcherText.indexOf('旧表'))

    fireEvent.click(anchorFor(5, 1))
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual([label(4, 26), label(5, 9), '无', '其他日期…'])

    fireEvent.click(screen.getByRole('menuitem', { name: label(5, 9) }))
    expect(JSON.parse(localStorage.getItem(`sleepy_holiday_transfers_${defaultId}`) ?? '[]')).toEqual([
      { sourceDate: iso(5, 1), targetDate: iso(5, 9), segmentId: expect.any(String) },
    ])
    expect(screen.queryByRole('menu')).toBeNull()

    // 同一补班日被另一放假日选走 → 互斥, 先前映射让位
    fireEvent.click(anchorFor(5, 2))
    fireEvent.click(screen.getByRole('menuitem', { name: label(5, 9) }))
    const stored = JSON.parse(localStorage.getItem(`sleepy_holiday_transfers_${defaultId}`) ?? '[]') as { sourceDate: string }[]
    expect(stored.map((e) => e.sourceDate)).toEqual([iso(5, 2)])

    fireEvent.click(anchorFor(5, 2))
    fireEvent.click(screen.getByRole('menuitem', { name: '无' }))
    expect(localStorage.getItem(`sleepy_holiday_transfers_${defaultId}`)).toBe('[]')
  })

  it('table switcher only appears with more than one table', async () => {
    await addTable('唯一表', 1, 1)
    render(<HolidayPage onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('每张课表单独设置。未设置的放假日按当天星期取课，不会替你猜。')).toBeTruthy())
    expect(screen.queryByText('唯一表')).toBeNull()
  })

  it('orphan mappings are listed and cleared manually', async () => {
    const id = await addTable('当前表', 1, 1)
    localStorage.setItem(
      `sleepy_holiday_transfers_${id}`,
      JSON.stringify([{ sourceDate: iso(1, 1), targetDate: iso(1, 4), segmentId: 'old' }]),
    )
    render(<HolidayPage onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('失效的映射')).toBeTruthy())
    expect(screen.getByText(`1/1 → ${label(1, 4)}`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
    await waitFor(() => expect(screen.queryByText('失效的映射')).toBeNull())
    expect(localStorage.getItem(`sleepy_holiday_transfers_${id}`)).toBe('[]')
  })
})
