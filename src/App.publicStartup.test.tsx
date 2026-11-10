import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App, preloadInitialRoute } from './App'
import { initI18n } from './i18n'
import { useBackStack } from './state/backStack'
import { usePrefsStore } from './state/prefsStore'
import { DEFAULT_PREFS } from './data/types'
import { setViewport } from './testUtils/viewport'

vi.mock('./startup/publicMode', () => ({ publicScheduleEnabled: () => true }))
vi.mock('./views/ScheduleView', () => ({ ScheduleView: ({ readOnly }: { readOnly: boolean }) => <button>{readOnly ? 'Public schedule' : 'Editable schedule'}</button> }))
vi.mock('./views/DailyAgendaPage', () => ({ DailyAgendaPage: () => <h2>Private agenda</h2> }))
vi.mock('./components/glass/GlassControls', () => ({ GlassControls: () => null }))
vi.mock('./components/glass/GlassNavigation', async () => {
  const { forwardRef } = await import('react')
  return { GlassNavigation: forwardRef(() => <nav />) }
})
vi.mock('./domain/reminders/scheduler', () => ({ startReminderEngine() {}, stopReminderEngine() {} }))

beforeAll(() => { initI18n('zh-CN') })
afterEach(() => { cleanup(); useBackStack.getState().reset() })

it.each(['#/今日/课程汇总/2026-11-10', '#/我的/提醒/提醒课表'])('public startup ignores the private deep link %s', async hash => {
  setViewport(402, 874)
  useBackStack.getState().reset()
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS }, loaded: true })
  history.replaceState(null, '', hash)
  await preloadInitialRoute(hash)
  render(<App />)
  expect(screen.getByRole('button', { name: 'Public schedule' })).toBeTruthy()
  expect(screen.queryByText('Private agenda')).toBeNull()
  expect(document.querySelector('nav')).toBeNull()
  expect(useBackStack.getState().stack).toEqual([])
  expect(decodeURI(location.hash)).toBe('#/课表')
})
