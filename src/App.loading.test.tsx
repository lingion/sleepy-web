import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { App, preloadInitialRoute } from './App'
import { initI18n } from './i18n'
import { useBackStack } from './state/backStack'
import { setViewport } from './testUtils/viewport'

const pending = vi.hoisted(() => {
  let mineReady!: () => void, agendaReady!: () => void
  const mine = new Promise<void>(resolve => { mineReady = resolve })
  const agenda = new Promise<void>(resolve => { agendaReady = resolve })
  return { mine, mineReady, agenda, agendaReady }
})
vi.mock('./views/ScheduleView', () => ({ ScheduleView: () => <p>Current timetable</p> }))
vi.mock('./views/MineView', async () => {
  await pending.mine
  return { MineView: () => <p>Settings destination</p>, preloadMineRoute: async () => {} }
})
vi.mock('./views/DailyAgendaPage', async () => {
  await pending.agenda
  return { DailyAgendaPage: () => <p>Notification agenda</p> }
})
beforeAll(() => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); useBackStack.getState().reset() })

it('keeps the current tab visible until the first settings download completes', async () => {
  setViewport(390, 844)
  history.replaceState(null, '', '#/课表')
  await preloadInitialRoute()
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '我的' }))
  expect(screen.getByText('Current timetable').style.display).not.toBe('none')
  expect(screen.queryByText('Settings destination')).toBeNull()
  await act(async () => { pending.mineReady(); await pending.mine })
  expect(await screen.findByText('Settings destination')).toBeTruthy()
})

it('keeps the current timetable visible while a notification destination loads', async () => {
  setViewport(390, 844)
  history.replaceState(null, '', '#/课表')
  await preloadInitialRoute()
  render(<App />)
  act(() => window.dispatchEvent(new CustomEvent('sleepy:open-agenda', { detail: '#/今日/课程汇总/2026-11-10' })))
  expect(screen.getByText('Current timetable').closest('[style*="display: none"]')).toBeNull()
  await act(async () => { pending.agendaReady(); await pending.agenda })
  expect(await screen.findByText('Notification agenda')).toBeTruthy()
})
