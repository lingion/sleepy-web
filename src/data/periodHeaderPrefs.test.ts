import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, loadPrefs, savePrefs } from './db'
import { DEFAULT_PREFS, type Prefs } from './types'
import { usePrefsStore } from '../state/prefsStore'
import { applyPrefsFiles, collectPrefsFiles } from '../domain/migration/prefsCodec'
import { exportBackup, importBackup } from '../domain/migration/backupExecutor'

beforeEach(async () => {
  await db.delete(); await db.open(); localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, themeMode: 'light' }, loaded: false })
})
afterEach(async () => { await db.delete(); localStorage.clear(); vi.unstubAllGlobals() })

describe('旧式节次表头隐藏时间偏好', () => {
  it('defaults off in a fresh database and in existing prefs without the field', async () => {
    expect(DEFAULT_PREFS.periodHeaderHideTime).toBe(false)
    expect((await loadPrefs()).periodHeaderHideTime).toBe(false)
    await db.prefs.put({ key: 'prefs', value: JSON.stringify({ periodHeaderLayout: 'three_line', gridScale: 1.2 }) })
    expect(await loadPrefs()).toMatchObject({ periodHeaderHideTime: false, periodHeaderLayout: 'three_line', gridScale: 1.2 })
  })

  it.each([false, 'true', 'false', 1, null])('does not enable hiding from malformed or false stored value %j', async raw => {
    await db.prefs.put({ key: 'prefs', value: JSON.stringify({ periodHeaderHideTime: raw }) })
    expect((await loadPrefs()).periodHeaderHideTime).toBe(false)
  })

  it('persists both toggle values across store reload without altering the selected layout', async () => {
    await usePrefsStore.getState().update({ periodHeaderHideTime: true, periodHeaderLayout: 'three_line' })
    expect((await loadPrefs()).periodHeaderHideTime).toBe(true)
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, themeMode: 'light' } })
    await usePrefsStore.getState().load()
    expect(usePrefsStore.getState().prefs).toMatchObject({ periodHeaderHideTime: true, periodHeaderLayout: 'three_line' })
    await usePrefsStore.getState().update({ periodHeaderHideTime: false })
    expect((await loadPrefs()).periodHeaderHideTime).toBe(false)
    await usePrefsStore.getState().update({ periodHeaderHideTime: 'false' } as unknown as Partial<Prefs>)
    expect(usePrefsStore.getState().prefs.periodHeaderHideTime).toBe(false)
  })

  it('uses the exact Android boolean key for preferences import and export', async () => {
    await savePrefs({ ...DEFAULT_PREFS, periodHeaderHideTime: true })
    const snapshot = await collectPrefsFiles()
    expect(snapshot.files.sleepy_prefs.entries.period_header_hide_time).toEqual({ type: 'BOOL', bool: true })
    await applyPrefsFiles({ files: { sleepy_prefs: { entries: { period_header_hide_time: { type: 'BOOL', bool: false } } } } }, false)
    expect((await loadPrefs()).periodHeaderHideTime).toBe(false)
  })

  it('round-trips the actual preferences backup with hiding enabled', async () => {
    await savePrefs({ ...DEFAULT_PREFS, periodHeaderHideTime: true, periodHeaderLayout: 'legacy' })
    const { bytes } = await exportBackup(['preferences'])
    await savePrefs({ ...DEFAULT_PREFS, periodHeaderHideTime: false })
    await importBackup(bytes, 'OVERWRITE')
    expect(await loadPrefs()).toMatchObject({ periodHeaderHideTime: true, periodHeaderLayout: 'legacy' })
  })
})
