import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db } from '../../data/db'
import { usePrefsStore } from '../../state/prefsStore'
import { GeneralSettingsPage } from './GeneralSettingsPage'
import { ScheduleDisplayPage } from './ScheduleDisplayPage'
import { initI18n } from '../../i18n'
beforeAll(() => {
  initI18n('zh-CN')
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
beforeEach(async () => { await db.prefs.clear(); await usePrefsStore.getState().load() })
afterEach(cleanup)
function switchOf(label: string): HTMLElement {
  let current: HTMLElement | null = screen.getByText(label)
  while (current && !current.querySelector('[role="switch"]')) current = current.parentElement
  return current!.querySelector('[role="switch"]')!
}
describe('1.0.64 settings grouping', () => {
  it('keeps general settings limited to language, performance and editing', () => {
    render(<GeneralSettingsPage onBack={() => {}} />)
    expect(screen.getByText('高刷新率')).toBeTruthy()
    expect(screen.queryByText('课表自适应行高')).toBeNull()
    expect(screen.queryByText('创建完整备份')).toBeNull()
  })
  it('opens a separate anchored language window and removes it before changing language', async () => {
    const { container } = render(<GeneralSettingsPage onBack={() => {}} />)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))
    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5)
    fireEvent.click(screen.getByRole('menuitemradio', { name: '日本語' }))
    expect(usePrefsStore.getState().prefs.lang).toBe('zh-CN')
    await waitFor(() => expect(usePrefsStore.getState().prefs.lang).toBe('ja'))
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('cancels the language menu with Escape without writing the current preference', async () => {
    render(<GeneralSettingsPage onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(usePrefsStore.getState().prefs.lang).toBe('zh-CN')
  })
  it('saves grid controls on the schedule display page', async () => {
    render(<ScheduleDisplayPage onBack={() => {}} />)
    fireEvent.click(switchOf('课表自适应行高'))
    fireEvent.click(switchOf('双指捏放调整行高'))
    fireEvent.click(switchOf('自动收起空白晚间'))
    await waitFor(() => {
      expect(usePrefsStore.getState().prefs.gridAdaptiveHeight).toBe(true)
      expect(usePrefsStore.getState().prefs.gridPinchZoom).toBe(true)
      expect(screen.getByText('晚间起始时间')).toBeTruthy()
    })
  })
  it('keeps at least one visible day on the shared display page', async () => {
    await usePrefsStore.getState().update({ visibleDays: [1] })
    render(<ScheduleDisplayPage onBack={() => {}} />)
    fireEvent.click(screen.getByText('显示星期'))
    fireEvent.click(switchOf('周一'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([1]))
    fireEvent.click(switchOf('周日'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([1, 7]))
    fireEvent.click(switchOf('周一'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([7]))
  })
})
