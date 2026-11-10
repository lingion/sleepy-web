import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { DEFAULT_PREFS } from '../data/types'
import { usePrefsStore } from '../state/prefsStore'

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await db.delete()
  await db.open()
})

it('hydrates the prepared preferences without rereading them and leaves later loads fresh', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const prepared = { ...DEFAULT_PREFS, themeMode: 'light' as const, gridScale: 1.2 }
  const read = vi.spyOn(db.prefs, 'get')
  await usePrefsStore.getState().load(prepared)
  expect(usePrefsStore.getState().prefs.gridScale).toBe(1.2)
  expect(read.mock.calls.filter((args: readonly unknown[]) => args[0] === 'prefs')).toHaveLength(0)
  await db.prefs.put({ key: 'prefs', value: JSON.stringify({ ...prepared, gridScale: 0.8 }) })
  await usePrefsStore.getState().load()
  expect(usePrefsStore.getState().prefs.gridScale).toBe(0.8)
  expect(read.mock.calls.filter((args: readonly unknown[]) => args[0] === 'prefs')).toHaveLength(1)
})
