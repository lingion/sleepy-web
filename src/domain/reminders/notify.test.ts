import { afterEach, expect, it, vi } from 'vitest'
import { postNotify } from './notify'
afterEach(() => vi.unstubAllGlobals())
it('opens the absolute agenda date when a notification is clicked', () => {
  let instance: FakeNotification | undefined
  class FakeNotification {
    static permission = 'granted'
    onclick?: () => void
    close = vi.fn()
    constructor() { instance = this }
  }
  vi.stubGlobal('Notification', FakeNotification)
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
  const listener = vi.fn()
  window.addEventListener('sleepy:open-agenda', listener)
  postNotify({ tag: 'summary', title: 'title', body: 'body', targetHash: '#/今日/课程汇总/2026-11-10' })
  instance?.onclick?.()
  expect(focus).toHaveBeenCalledOnce()
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe('#/今日/课程汇总/2026-11-10')
  expect(instance?.close).toHaveBeenCalledOnce()
  window.removeEventListener('sleepy:open-agenda', listener)
  focus.mockRestore()
})
