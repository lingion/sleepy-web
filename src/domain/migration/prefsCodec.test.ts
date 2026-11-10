import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, loadPrefs, savePrefs } from '../../data/db'
import { DEFAULT_PREFS, type Prefs } from '../../data/types'
import { exportBackup, importBackup, type ImportMode } from './backupExecutor'
import { collectPrefsFiles, type PrefsFileSnapshot, type PrefsSnapshot } from './prefsCodec'
import { readZipEntries, writeZip } from './zipCodec'

// Android v1.0.64 (77b878fd): util/AppPrefs.kt uses putInt(KEY_UNDO_DEPTH)
// and putString(KEY_PERIOD_HEADER_TIME_ALIGNMENT); MigrationPrefsCodec keeps their types.
function nativePreferencesBackup(entries: PrefsFileSnapshot['entries']): Uint8Array {
  return writeZip([
    ['manifest.json', JSON.stringify({
      format: 'sleepy-migration', version: 1, createdAt: 1700000000000, modules: ['preferences'],
    })],
    ['modules/preferences.json', JSON.stringify({ files: { sleepy_prefs: { entries } } })],
  ])
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

afterEach(async () => {
  await db.delete()
  localStorage.clear()
})

describe('Android undo depth and period header alignment preferences', () => {
  it.each([
    [-1, 'center'],
    [0, 'dash'],
    [5, 'dash'],
    [37, 'center'],
  ] as const)('exports depth %i and alignment %s with exact native keys and types', async (undoDepth, periodHeaderTimeAlignment) => {
    await savePrefs({ ...DEFAULT_PREFS, undoDepth, periodHeaderTimeAlignment })

    const { entries } = (await collectPrefsFiles()).files.sleepy_prefs

    expect(entries.undo_depth).toEqual({ type: 'INT', number: undoDepth })
    expect(entries.period_header_time_alignment).toEqual({ type: 'STRING', string: periodHeaderTimeAlignment })
    expect(entries).not.toHaveProperty('undoDepth')
    expect(entries).not.toHaveProperty('periodHeaderTimeAlignment')
  })

  it.each<ImportMode>(['OVERWRITE', 'MERGE'])('imports native typed envelopes into persisted prefs in %s mode', async mode => {
    await savePrefs({ ...DEFAULT_PREFS, undoDepth: 0, periodHeaderTimeAlignment: 'dash' })
    // Android Json.encodeDefaults=true includes unused envelope members too.
    const bytes = nativePreferencesBackup({
      undo_depth: { type: 'INT', bool: false, number: -1, float: 0, string: '', stringSet: [] },
      period_header_time_alignment: { type: 'STRING', bool: false, number: 0, float: 0, string: 'center', stringSet: [] },
      before_class_mode: { type: 'STRING', string: 'fluid' },
      period_header_hide_time: { type: 'BOOL', bool: true },
    })

    const report = await importBackup(bytes, mode)

    expect(report.appliedModules).toEqual(['preferences'])
    expect(report.counts.prefKeys).toBe(4)
    expect(await loadPrefs()).toMatchObject({ undoDepth: -1, periodHeaderTimeAlignment: 'center', periodHeaderHideTime: true })
    expect(localStorage.getItem('sleepy_before_class_mode')).toBe('fluid')
    expect(JSON.parse((await db.prefs.get('prefs'))!.value)).toMatchObject({ undoDepth: -1, periodHeaderTimeAlignment: 'center' })
  })

  const modes: ImportMode[] = ['OVERWRITE', 'MERGE']
  const cases: Array<Pick<Prefs, 'undoDepth' | 'periodHeaderTimeAlignment'>> = [
    { undoDepth: -1, periodHeaderTimeAlignment: 'center' },
    { undoDepth: 0, periodHeaderTimeAlignment: 'center' },
    { undoDepth: 37, periodHeaderTimeAlignment: 'dash' },
  ]
  describe.each(modes)('actual preferences ZIP round-trip in %s mode', mode => {
    it.each(cases)('restores $undoDepth and $periodHeaderTimeAlignment after local values change', async expected => {
      await savePrefs({ ...DEFAULT_PREFS, ...expected, periodHeaderHideTime: true })
      localStorage.setItem('sleepy_before_class_mode', 'fluid')
      const { bytes, modules } = await exportBackup(['preferences'], 1700000000000)
      const snapshot = JSON.parse(readZipEntries(bytes)['modules/preferences.json']) as PrefsSnapshot

      expect(modules).toEqual(['preferences'])
      expect(snapshot.files.sleepy_prefs.entries).toMatchObject({
        undo_depth: { type: 'INT', number: expected.undoDepth },
        period_header_time_alignment: { type: 'STRING', string: expected.periodHeaderTimeAlignment },
        before_class_mode: { type: 'STRING', string: 'fluid' },
      })
      await savePrefs({
        ...DEFAULT_PREFS,
        undoDepth: 9,
        periodHeaderTimeAlignment: expected.periodHeaderTimeAlignment === 'dash' ? 'center' : 'dash',
      })
      localStorage.setItem('sleepy_before_class_mode', 'banner')

      await importBackup(bytes, mode)

      expect(await loadPrefs()).toMatchObject({ ...expected, periodHeaderHideTime: true })
      expect(localStorage.getItem('sleepy_before_class_mode')).toBe('fluid')
      const restored = (await collectPrefsFiles()).files.sleepy_prefs.entries
      expect(restored.undo_depth).toEqual(snapshot.files.sleepy_prefs.entries.undo_depth)
      expect(restored.period_header_time_alignment).toEqual(snapshot.files.sleepy_prefs.entries.period_header_time_alignment)
    })
  })

  it.each<ImportMode>(['OVERWRITE', 'MERGE'])('keeps fresh defaults when a legacy preferences ZIP omits both keys in %s mode', async mode => {
    const bytes = nativePreferencesBackup({ theme_mode: { type: 'STRING', string: 'dark' } })

    await importBackup(bytes, mode)

    expect(await loadPrefs()).toMatchObject({ themeMode: 'dark', undoDepth: 5, periodHeaderTimeAlignment: 'dash' })
  })
})
