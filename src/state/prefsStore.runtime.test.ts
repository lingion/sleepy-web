import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS, type Prefs } from '../data/types'

const control = vi.hoisted(() => ({ prepare: vi.fn(), save: vi.fn(), read: vi.fn(), theme: vi.fn() }))
vi.mock('../components/glass/runtime', () => ({ prepareGlassRuntime: control.prepare }))
vi.mock('../data/db', () => ({ loadPrefs: control.read, savePrefs: control.save }))
vi.mock('../data/undoStore', () => ({ undoManager: { applyMaxDepth() {} } }))
vi.mock('../i18n', () => ({ changeLang() {} }))
vi.mock('../theme/themes', () => ({ applyTheme: control.theme }))
vi.mock('../data/courseHueStore', () => ({ refreshCourseHues: async () => 0, observeCourseHues() {} }))

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  control.prepare.mockResolvedValue(undefined)
  control.read.mockResolvedValue({ ...DEFAULT_PREFS, themeMode: 'light' })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
  document.documentElement.dataset.uiStyle = 'classic'
})
afterEach(() => vi.unstubAllGlobals())

async function store() {
  const { usePrefsStore } = await import('./prefsStore')
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, themeMode: 'light' }, loaded: false })
  return usePrefsStore
}

it('publishes neither loaded nor saved liquid preferences until the runtime is ready', async () => {
  const runtime = deferred()
  control.prepare.mockReturnValue(runtime.promise)
  const prefs = await store()
  const published: Array<{ loaded: boolean; style: string }> = []
  prefs.subscribe(state => published.push({ loaded: state.loaded, style: state.prefs.uiStyle }))
  const loading = prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'liquid_glass' })
  expect(prefs.getState().loaded).toBe(false)
  expect(prefs.getState().prefs.uiStyle).toBe('classic')
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  expect(published).toEqual([])
  runtime.resolve()
  await loading
  expect(prefs.getState().loaded).toBe(true)
  expect(prefs.getState().prefs.uiStyle).toBe('liquid_glass')
  expect(document.documentElement.dataset.uiStyle).toBe('liquid_glass')
  expect(published.every(state => state.loaded && state.style === 'liquid_glass')).toBe(true)
})

it('leaves a failed load unpublished and permits an independent retry', async () => {
  const prefs = await store()
  control.prepare.mockRejectedValueOnce(new Error('optical chunk unavailable'))
  const saved: Prefs = { ...DEFAULT_PREFS, uiStyle: 'liquid_glass' }
  await expect(prefs.getState().load(saved)).rejects.toThrow('optical chunk unavailable')
  expect(prefs.getState().loaded).toBe(false)
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  await prefs.getState().load(saved)
  expect(prefs.getState().prefs.uiStyle).toBe('liquid_glass')
})

it('keeps the active style and persistence unchanged on failure, then retries successfully', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const changing = prefs.getState().update({ uiStyle: 'liquid_glass' })
  const failure = expect(changing).rejects.toThrow('download failed')
  void failure.catch(() => {})
  expect(prefs.getState().prefs.uiStyle).toBe('classic')
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  expect(control.save).not.toHaveBeenCalled()
  runtime.reject(new Error('download failed'))
  await failure
  expect(prefs.getState().prefs.uiStyle).toBe('classic')
  await prefs.getState().update({ uiStyle: 'liquid_glass' })
  expect(prefs.getState().prefs.uiStyle).toBe('liquid_glass')
  expect(control.save.mock.lastCall?.[0].uiStyle).toBe('liquid_glass')
})

it('rebases a prepared style on preferences edited while loading', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const changing = prefs.getState().update({ uiStyle: 'liquid_glass' })
  await prefs.getState().update({ gridScale: 1.2, theme: 'ocean' as Prefs['theme'] })
  expect(prefs.getState().prefs.uiStyle).toBe('classic')
  runtime.resolve()
  await changing
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'liquid_glass', gridScale: 1.2, theme: 'ocean' })
  expect(control.save.mock.lastCall?.[0]).toMatchObject({ uiStyle: 'liquid_glass', gridScale: 1.2, theme: 'ocean' })
})

it.each([false, true])('keeps a newer classic intent and the non-style fields of a stale patch (failure=%s)', async fail => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const changing = prefs.getState().update({ uiStyle: 'liquid_glass', gridScale: 1.2 })
  await prefs.getState().update({ uiStyle: 'classic', weekScale: 1.1 })
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', weekScale: 1.1 })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  if (fail) runtime.reject(new Error('superseded download failed'))
  else runtime.resolve()
  await changing
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', gridScale: 1.2, weekScale: 1.1 })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  expect(control.save.mock.lastCall?.[0]).toMatchObject({ uiStyle: 'classic', gridScale: 1.2, weekScale: 1.1 })
})

it('honors the final liquid intent when liquid, classic and liquid overlap', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValue(runtime.promise)
  const first = prefs.getState().update({ uiStyle: 'liquid_glass', gridScale: 1.2 })
  await prefs.getState().update({ uiStyle: 'classic' })
  const last = prefs.getState().update({ uiStyle: 'liquid_glass' })
  await prefs.getState().update({ weekScale: 1.1 })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  runtime.resolve()
  await Promise.all([first, last])
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'liquid_glass', gridScale: 1.2, weekScale: 1.1 })
  expect(document.documentElement.dataset.uiStyle).toBe('liquid_glass')
})

it('retains the empty-patch refresh used after recalculating course colors', async () => {
  const prefs = await store(), before = prefs.getState().prefs
  await prefs.getState().update({})
  expect(prefs.getState().prefs).not.toBe(before)
  expect(control.save).toHaveBeenCalledWith(prefs.getState().prefs)
})

it('rebases a pending external liquid load on newer completed preference edits before first publication', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const loading = prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'liquid_glass', gridScale: 0.8, weekScale: 0.9, showDate: false })
  await prefs.getState().update({ uiStyle: 'classic', gridScale: 1.2 })
  await prefs.getState().update({ weekScale: 1.1 })
  expect(prefs.getState().loaded).toBe(false)
  runtime.resolve()
  await loading
  expect(prefs.getState().loaded).toBe(true)
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', gridScale: 1.2, weekScale: 1.1, showDate: false })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
})

it('does not undo newer edits when an irrelevant external liquid preparation fails', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const loading = prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'liquid_glass', showDate: false })
  void loading.catch(() => {})
  await prefs.getState().update({ uiStyle: 'classic', gridScale: 1.2 })
  runtime.reject(new Error('superseded external load failed'))
  await loading
  expect(prefs.getState().loaded).toBe(true)
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', gridScale: 1.2, showDate: false })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
})

it('keeps the latest completed load when an older liquid load finishes later', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const older = prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'liquid_glass', gridScale: 0.8 })
  await prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'classic', gridScale: 1.2 })
  runtime.resolve()
  await older
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', gridScale: 1.2 })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
})

it('lets a newer load supersede a pending liquid update including its mixed fields', async () => {
  const prefs = await store(), runtime = deferred()
  control.prepare.mockReturnValueOnce(runtime.promise)
  const older = prefs.getState().update({ uiStyle: 'liquid_glass', gridScale: 0.8 })
  await prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'classic', gridScale: 1.2 })
  runtime.resolve()
  await older
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', gridScale: 1.2 })
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
})

it('does not publish readiness or side effects from a fully superseded load while the newer read is pending', async () => {
  const prefs = await store(), runtime = deferred()
  let finishRead!: (prefs: Prefs) => void
  const reading = new Promise<Prefs>(done => { finishRead = done })
  control.read.mockReturnValueOnce(reading)
  control.prepare.mockReturnValueOnce(runtime.promise)
  const initial = prefs.getState().prefs, published = vi.fn()
  const unsubscribe = prefs.subscribe(published)
  const older = prefs.getState().load({ ...DEFAULT_PREFS, uiStyle: 'liquid_glass', gridScale: 0.8 })
  const newer = prefs.getState().load()
  expect(control.read).toHaveBeenCalledOnce()
  runtime.resolve()
  await older
  expect(prefs.getState().loaded).toBe(false)
  expect(prefs.getState().prefs).toBe(initial)
  expect(published).not.toHaveBeenCalled()
  expect(control.theme).not.toHaveBeenCalled()
  expect(document.documentElement.dataset.uiStyle).toBe('classic')
  finishRead({ ...DEFAULT_PREFS, uiStyle: 'classic', gridScale: 1.2 })
  await newer
  expect(prefs.getState().loaded).toBe(true)
  expect(prefs.getState().prefs).toMatchObject({ uiStyle: 'classic', gridScale: 1.2 })
  expect(control.theme).toHaveBeenCalledOnce()
  unsubscribe()
})
