import { beforeEach, expect, it, vi } from 'vitest'

const control = vi.hoisted(() => ({
  gated: false, granted: false,
  prefs: { lang: 'es' }, open: vi.fn(), read: vi.fn(),
}))
vi.mock('../data/db', () => ({
  db: { open: () => control.open() },
  loadPrefs: () => control.read(),
}))
vi.mock('../publicAccess', () => ({
  publicAccessRequired: () => control.gated,
  publicAccessGranted: () => control.granted,
}))
beforeEach(() => {
  vi.resetModules()
  control.gated = false
  control.granted = false
  control.open.mockReset().mockResolvedValue(undefined)
  control.read.mockReset().mockResolvedValue(control.prefs)
})

it('opens and reads preferences before the renderer, sharing the same completed promise', async () => {
  const early = await import('./database')
  await vi.waitFor(() => expect(control.read).toHaveBeenCalledOnce())
  const first = early.loadStartupPrefs(), second = early.loadStartupPrefs()
  expect(second).toBe(first)
  expect(await first).toBe(control.prefs)
  expect(control.open).toHaveBeenCalledOnce()
  expect(control.read).toHaveBeenCalledOnce()
})

it('does no disk work before access and starts the shared read after authorization', async () => {
  control.gated = true
  const early = await import('./database')
  await Promise.resolve()
  expect(control.open).not.toHaveBeenCalled()
  expect(control.read).not.toHaveBeenCalled()
  control.granted = true
  expect(await early.loadStartupPrefs()).toBe(control.prefs)
  expect(control.open).toHaveBeenCalledOnce()
  expect(control.read).toHaveBeenCalledOnce()
})

it('propagates an early disk failure to Bootstrap rather than opening an empty timetable', async () => {
  const failure = new Error('Disk unavailable')
  control.open.mockRejectedValue(failure)
  const early = await import('./database')
  await expect(early.loadStartupPrefs()).rejects.toBe(failure)
  expect(control.read).not.toHaveBeenCalled()
})
