import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const control = vi.hoisted(() => ({
  public: false, gated: false, uiStyle: 'classic',
  language: Promise.resolve(), data: Promise.resolve(), route: Promise.resolve(), colors: Promise.resolve(), snapshot: Promise.resolve(), optics: Promise.resolve(),
  opticsLoad: vi.fn(), prefsPublish: vi.fn(),
  seed: vi.fn(), publicLoad: vi.fn(), routeLoad: vi.fn(), languageLoad: vi.fn(), snapshotLoad: vi.fn(), snapshotDiscard: vi.fn(), databaseOpen: vi.fn(),
  rootRender: vi.fn(), flushDepth: 0,
}))

vi.mock('react-dom/client', () => ({ default: { createRoot: () => ({ render: (node: unknown) => control.rootRender(node, control.flushDepth) }) } }))
vi.mock('react-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return { ...actual, flushSync: <T,>(callback: () => T) => {
    control.flushDepth++
    try { return actual.flushSync(callback) } finally { control.flushDepth-- }
  } }
})
vi.mock('./App', () => ({
  App: () => <button>Interactive timetable</button>,
  preloadInitialRoute: () => { control.routeLoad(); return control.route },
}))
vi.mock('./i18n', () => ({ prepareI18n: (lang: string) => { control.languageLoad(lang); return control.language } }))
vi.mock('./data/db', () => ({ db: { open: async () => { control.databaseOpen() } }, loadPrefs: async () => ({ lang: 'es', uiStyle: control.uiStyle }) }))
vi.mock('./components/glass/runtime', () => ({ prepareGlassRuntime: (style: string) => { control.opticsLoad(style); return control.optics } }))
vi.mock('./data/sampleTable', () => ({ seedSampleTable: () => { control.seed(); return control.data } }))
vi.mock('./publicSchedule', () => ({ loadPublicSchedule: () => { control.publicLoad(); return control.data } }))
vi.mock('./startup/publicMode', () => ({ publicScheduleEnabled: () => control.public }))
vi.mock('./startup/scheduleData', () => ({
  prepareInitialScheduleData: () => { control.snapshotLoad(); return control.snapshot },
  discardInitialScheduleData: () => control.snapshotDiscard(),
}))
vi.mock('./publicAccess', () => ({ publicAccessRequired: () => control.gated, publicAccessGranted: () => false, grantPublicAccess: async () => true }))
vi.mock('./state/prefsStore', async () => {
  const { create } = await import('zustand')
  const usePrefsStore = create<{ loaded: boolean; load: () => Promise<void> }>(set => ({
    loaded: false,
    load: async () => { control.prefsPublish(); set({ loaded: true }); await control.colors },
  }))
  return { usePrefsStore }
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  Object.assign(control, { public: false, gated: false, uiStyle: 'classic', language: Promise.resolve(), data: Promise.resolve(), route: Promise.resolve(), colors: Promise.resolve(), snapshot: Promise.resolve(), optics: Promise.resolve() })
})
afterEach(cleanup)

it('starts authorized data preparation before mounting React and joins that same work', async () => {
  const language = deferred()
  control.language = language.promise
  const { Bootstrap } = await import('./main')
  await waitFor(() => expect(control.languageLoad).toHaveBeenCalledWith('es'))
  expect(control.seed).not.toHaveBeenCalled()
  render(<Bootstrap />)
  await act(async () => { language.resolve(); await language.promise })
  await screen.findByRole('button', { name: 'Interactive timetable' })
  expect(control.languageLoad).toHaveBeenCalledOnce()
  expect(control.seed).toHaveBeenCalledOnce()
})

it('joins StrictMode startup and waits for real data, current language, route and course colors', async () => {
  const language = deferred(), data = deferred(), route = deferred(), colors = deferred(), snapshot = deferred()
  Object.assign(control, { language: language.promise, data: data.promise, route: route.promise, colors: colors.promise, snapshot: snapshot.promise })
  const { Bootstrap } = await import('./main')
  render(<StrictMode><Bootstrap /></StrictMode>)
  await waitFor(() => expect(control.routeLoad).toHaveBeenCalledOnce())
  expect(control.languageLoad).toHaveBeenCalledWith('es')
  expect(control.seed).not.toHaveBeenCalled()
  await act(async () => { language.resolve(); await language.promise })
  await waitFor(() => expect(control.seed).toHaveBeenCalledOnce())
  await act(async () => { data.resolve(); route.resolve(); await Promise.all([data.promise, route.promise]) })
  expect(control.snapshotLoad).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Interactive timetable' })).toBeNull()
  await act(async () => { colors.resolve(); await colors.promise })
  expect(screen.queryByRole('button', { name: 'Interactive timetable' })).toBeNull()
  await act(async () => { snapshot.resolve(); await snapshot.promise })
  expect(await screen.findByRole('button', { name: 'Interactive timetable' })).toBeTruthy()
  expect(control.seed).toHaveBeenCalledOnce()
})

it('shows public validation failure without reporting a ready timetable', async () => {
  control.public = true
  const data = deferred()
  control.data = data.promise.then(() => { throw new Error('Public schedule CRC mismatch') })
  const { Bootstrap } = await import('./main')
  render(<StrictMode><Bootstrap /></StrictMode>)
  await waitFor(() => expect(control.publicLoad).toHaveBeenCalledOnce())
  await act(async () => { data.resolve(); await data.promise })
  expect((await screen.findByRole('alert')).textContent).toContain('Public schedule CRC mismatch')
  expect(screen.queryByRole('button', { name: 'Interactive timetable' })).toBeNull()
  expect(control.seed).not.toHaveBeenCalled()
})

it('does not prepare data or routes before the public access gate is granted', async () => {
  control.public = true
  control.gated = true
  const { Bootstrap } = await import('./main')
  render(<Bootstrap />)
  expect(control.routeLoad).not.toHaveBeenCalled()
  expect(control.publicLoad).not.toHaveBeenCalled()
  expect(control.snapshotLoad).not.toHaveBeenCalled()
  expect(control.databaseOpen).not.toHaveBeenCalled()
  expect(control.opticsLoad).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '进入课表' }))
  expect(await screen.findByRole('button', { name: 'Interactive timetable' })).toBeTruthy()
  expect(control.publicLoad).toHaveBeenCalledOnce()
  expect(control.snapshotLoad).toHaveBeenCalledOnce()
  expect(control.databaseOpen).toHaveBeenCalledOnce()
})

it('prepares saved liquid optics alongside seed data and waits before prefs publication and the first commit', async () => {
  const data = deferred(), optics = deferred()
  Object.assign(control, { uiStyle: 'liquid_glass', data: data.promise, optics: optics.promise })
  const { prepareStartup } = await import('./main')
  await waitFor(() => expect(control.seed).toHaveBeenCalledOnce())
  expect(control.opticsLoad).toHaveBeenCalledWith('liquid_glass')
  expect(control.prefsPublish).not.toHaveBeenCalled()
  data.resolve()
  await act(async () => { await data.promise })
  expect(control.prefsPublish).not.toHaveBeenCalled()
  expect(control.rootRender).not.toHaveBeenCalled()
  optics.resolve()
  await act(async () => { await prepareStartup() })
  expect(control.prefsPublish).toHaveBeenCalledOnce()
  expect(control.rootRender).toHaveBeenCalledOnce()
  expect(control.rootRender.mock.calls[0][1]).toBeGreaterThan(0)
  render(control.rootRender.mock.calls[0][0])
  expect(screen.getByRole('button', { name: 'Interactive timetable' })).toBeTruthy()
})

it('reports an optical preparation failure without publishing liquid prefs or a usable page', async () => {
  const optics = deferred()
  Object.assign(control, { uiStyle: 'liquid_glass', optics: optics.promise.then(() => { throw new Error('optical chunk unavailable') }) })
  const { prepareStartup } = await import('./main')
  optics.resolve()
  await expect(prepareStartup()).rejects.toThrow('optical chunk unavailable')
  await waitFor(() => expect(control.rootRender).toHaveBeenCalledOnce())
  expect(control.prefsPublish).not.toHaveBeenCalled()
  render(control.rootRender.mock.calls[0][0])
  expect(screen.getByRole('alert').textContent).toContain('optical chunk unavailable')
  expect(screen.queryByRole('button', { name: 'Interactive timetable' })).toBeNull()
})

it('uses an already prepared startup on its first render without a blank effect commit', async () => {
  const { Bootstrap, prepareStartup } = await import('./main')
  await prepareStartup()
  render(<Bootstrap />)
  expect(screen.getByRole('button', { name: 'Interactive timetable' })).toBeTruthy()
  expect(control.snapshotDiscard).toHaveBeenCalledOnce()
})

it('waits for prepared data without an empty root commit and synchronously submits the full first page', async () => {
  const snapshot = deferred()
  control.snapshot = snapshot.promise
  const { prepareStartup } = await import('./main')
  await waitFor(() => expect(control.snapshotLoad).toHaveBeenCalledOnce())
  expect(control.rootRender).not.toHaveBeenCalled()
  await act(async () => { snapshot.resolve(); await prepareStartup() })
  expect(control.rootRender).toHaveBeenCalledOnce()
  expect(control.rootRender.mock.calls[0][1]).toBeGreaterThan(0)
  render(control.rootRender.mock.calls[0][0])
  expect(screen.getByRole('button', { name: 'Interactive timetable' })).toBeTruthy()
})

it('commits a preparation failure directly as the existing Material error page', async () => {
  control.public = true
  const data = deferred()
  control.data = data.promise.then(() => { throw new Error('Public schedule CRC mismatch') })
  const { prepareStartup } = await import('./main')
  data.resolve()
  await expect(prepareStartup()).rejects.toThrow('Public schedule CRC mismatch')
  await waitFor(() => expect(control.rootRender).toHaveBeenCalledOnce())
  render(control.rootRender.mock.calls[0][0])
  expect(screen.getByRole('alert').textContent).toContain('Public schedule CRC mismatch')
  expect(screen.getByRole('button', { name: '重新加载' }).className).toContain('m3-button-filled')
})
