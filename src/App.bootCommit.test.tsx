import { Profiler } from 'react'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { App } from './App'
import { initI18n } from './i18n'
import { useBackStack } from './state/backStack'
import { usePrefsStore } from './state/prefsStore'
import { DEFAULT_PREFS } from './data/types'
import { setViewport } from './testUtils/viewport'

vi.mock('./views/ScheduleView', () => ({ ScheduleView: () => <button>Prepared schedule</button> }))
vi.mock('./components/glass/GlassControls', () => ({ GlassControls: () => null }))
vi.mock('./components/glass/GlassNavigation', async () => {
  const { forwardRef } = await import('react')
  return { GlassNavigation: forwardRef(() => null) }
})
vi.mock('./domain/reminders/scheduler', () => ({ startReminderEngine() {}, stopReminderEngine() {} }))

beforeAll(() => { initI18n('zh-CN') })
afterEach(() => { cleanup(); useBackStack.getState().reset() })

it.each(['', '#/课表'])('commits the default shell once without a navigation recovery update for %s', hash => {
  setViewport(402, 874)
  useBackStack.getState().reset()
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS }, loaded: true })
  history.replaceState(null, '', hash || '/')
  const committed = vi.fn()
  render(<Profiler id="app" onRender={committed}><App /></Profiler>)
  expect(screen.getByRole('button', { name: 'Prepared schedule' })).toBeTruthy()
  expect(committed).toHaveBeenCalledOnce()
  expect(useBackStack.getState().stack).toEqual([])
  expect(decodeURI(location.hash)).toBe('#/课表')
})
