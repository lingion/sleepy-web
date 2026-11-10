import 'fake-indexeddb/auto'
import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App, preloadInitialRoute } from './App'
import { initI18n, i18next } from './i18n'
import { useBackStack } from './state/backStack'
import { usePrefsStore } from './state/prefsStore'
import { setViewport } from './testUtils/viewport'

beforeAll(() => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches:false, addEventListener() {}, removeEventListener() {} }))
})
beforeEach(() => {
  setViewport(390, 844)
  useBackStack.getState().reset()
  usePrefsStore.setState({ loaded: true })
})
afterEach(() => { cleanup(); useBackStack.getState().reset() })

describe('lazy initial routes', () => {
  it.each([
    ['#/我的/提醒/提醒课表', ['reminder', 'tableReminder'], 'settings_table_reminder_scope'],
    ['#/我的/外观/课表显示/节次表头', ['appearance', 'scheduleDisplay', 'periodHeader'], 'appearance_period_header'],
    ['#/我的/桌面小组件/管理/添加', ['widgets', 'widgetManagement', 'widgetGallery'], 'widget_gallery_title'],
    ['#/今日/课程汇总/2026-11-10', ['dailyAgenda'], 'agenda_title'],
  ] as const)('renders %s on the first commit with its complete return chain', async (hash, chain, title) => {
    history.replaceState(null, '', hash)
    await preloadInitialRoute(hash)
    const pushed = vi.spyOn(history, 'pushState')
    render(<StrictMode><App /></StrictMode>)
    expect(screen.getByText(i18next.t(title))).toBeTruthy()
    expect(useBackStack.getState().stack).toEqual([...chain])
    expect(pushed).toHaveBeenCalledTimes(chain.length)
    expect(document.querySelectorAll('nav')).toHaveLength(0)
    pushed.mockRestore()
  })

  it('returns one level from a cold settings deep link', async () => {
    const hash = '#/我的/提醒/提醒课表'
    history.replaceState(null, '', hash)
    await preloadInitialRoute(hash)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: i18next.t('back') }))
    await screen.findByText(i18next.t('reminder_title'))
    expect(useBackStack.getState().stack).toEqual(['reminder'])
    expect(document.querySelectorAll('nav')).toHaveLength(0)
  })

  it('handles browser back while a lazily loaded settings pane is active', async () => {
    const hash = '#/我的/提醒/提醒课表'
    history.replaceState(null, '', hash)
    await preloadInitialRoute(hash)
    render(<App />)
    act(() => {
      history.replaceState({ sleepyBack: true, key: 'reminder' }, '', '#/我的/提醒')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(screen.getByText(i18next.t('reminder_title'))).toBeTruthy())
    expect(useBackStack.getState().stack).toEqual(['reminder'])
  })

  it.each([
    ['#/我的/通用设置/节假日', ['general', 'holiday'], ['mine_general']],
    ['#/我的/桌面小组件/管理/添加', ['widgets', 'widgetManagement', 'widgetGallery'], ['widget_manage_title', 'mine_widget']],
    ['#/我的/外观/课表显示/节次表头', ['appearance', 'scheduleDisplay', 'periodHeader'], ['appearance_section_schedule_display', 'mine_appearance']],
  ] as const)('returns through every parent of a cold %s deep link', async (hash, chain, titles) => {
    const browserBack = vi.spyOn(history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')))
    try {
      history.replaceState(null, '', hash)
      await preloadInitialRoute(hash)
      render(<App />)
      for (let i = 0; i < titles.length; i++) {
        fireEvent.click(screen.getByRole('button', { name: i18next.t('back') }))
        await screen.findByText(i18next.t(titles[i]), {}, { timeout: 5000 })
        expect(useBackStack.getState().stack).toEqual(chain.slice(0, -(i + 1)))
      }
      fireEvent.click(screen.getByRole('button', { name: i18next.t('back') }))
      expect(await screen.findByRole('heading', { name: i18next.t('tab_mine') })).toBeTruthy()
      expect(useBackStack.getState().stack).toEqual([])
    } finally { browserBack.mockRestore() }
  })

  it('browser back from a cold general-settings holiday link preserves its parent', async () => {
    const hash = '#/我的/通用设置/节假日'
    history.replaceState(null, '', hash)
    await preloadInitialRoute(hash)
    render(<App />)
    act(() => {
      history.replaceState({ sleepyBack:true, key:'general' }, '', '#/我的/通用设置')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(await screen.findByText(i18next.t('mine_general'))).toBeTruthy()
    expect(useBackStack.getState().stack).toEqual(['general'])
  })
})
