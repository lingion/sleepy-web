import 'fake-indexeddb/auto'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { initI18n } from '../i18n'
import { useBackStack } from '../state/backStack'
import { db } from '../data/db'
import { DEFAULT_PREFS, type Course } from '../data/types'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import { usePrefsStore } from '../state/prefsStore'
import { useScheduleSessionStore } from '../state/scheduleSessionStore'
import { discardInitialScheduleData, prepareInitialScheduleData } from '../startup/scheduleData'

const loaded = vi.hoisted(() => ({ add: vi.fn(), entry: vi.fn(), share: vi.fn(), edit: vi.fn() }))
const pending = vi.hoisted(() => {
  let entryReady!: () => void, manualReady!: () => void
  const entry = new Promise<void>(resolve => { entryReady = resolve })
  const manual = new Promise<void>(resolve => { manualReady = resolve })
  return { entry, entryReady, manual, manualReady }
})
vi.mock('./AddCourseView', async () => {
  loaded.add()
  await pending.manual
  return { AddCourseView: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Close lazy editor</button> }
})
vi.mock('./ImportView', async () => {
  loaded.entry()
  await pending.entry
  return { ImportView: ({ onManualAdd, onDone }: { onManualAdd: () => void; onDone: () => void }) => <>
    <h2>Lazy import entry</h2><button onClick={onManualAdd}>Open manual form</button><button onClick={onDone}>Close import entry</button>
  </> }
})
vi.mock('./ExportView', () => { loaded.share(); return { ShareScheduleSheetView: () => null } })
vi.mock('./EditTableView', () => { loaded.edit(); return { EditTableView: () => null } })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useBackStack.getState().reset(); vi.restoreAllMocks() })

it('renders the schedule without evaluating any editor, import directory or exporter', async () => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const { ScheduleView } = await import('./ScheduleView')
  render(<ScheduleView />)
  expect(await screen.findByRole('button', { name: '导入第一张课表' })).toBeTruthy()
  for (const load of Object.values(loaded)) expect(load).not.toHaveBeenCalled()
})

it('keeps the schedule and entry during slow loads, cancels a pending route on back, and returns one level', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(history, 'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')))
  const { ScheduleView } = await import('./ScheduleView')
  render(<ScheduleView />)
  fireEvent.click(await screen.findByRole('button', { name: '导入第一张课表' }))
  await waitFor(() => expect(loaded.entry).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: '导入第一张课表' }).closest('[style*="display: none"]')).toBeNull()
  history.replaceState({}, '', '#/课表')
  fireEvent.popState(window)
  await act(async () => { pending.entryReady(); await pending.entry })
  expect(screen.queryByText('Lazy import entry')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '导入第一张课表' }))
  await screen.findByText('Lazy import entry')
  fireEvent.click(screen.getByRole('button', { name: 'Open manual form' }))
  await waitFor(() => expect(loaded.add).toHaveBeenCalledOnce())
  expect(screen.getByText('Lazy import entry').closest('[style*="display: none"]')).toBeNull()
  await act(async () => { pending.manualReady(); await pending.manual })
  fireEvent.click(await screen.findByRole('button', { name: 'Close lazy editor' }))
  expect(await screen.findByText('Lazy import entry')).toBeTruthy()
  expect(useBackStack.getState().stack).toEqual(['addCourse'])
  fireEvent.click(screen.getByRole('button', { name: 'Close import entry' }))
  expect(await screen.findByRole('button', { name: '导入第一张课表' })).toBeTruthy()
  expect(useBackStack.getState().stack).toEqual([])
})

it('commits the prepared courses with real width and all three swipeable weeks', async () => {
  const observeScroll = vi.fn()
  let resizeScroll: ResizeObserverCallback | undefined
  let viewportWidth = 402
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) {
      if (element.hasAttribute('data-schedule-scroll')) { observeScroll(); resizeScroll = this.callback }
    }
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-schedule-scroll') ? viewportWidth : viewportWidth - 16
  })
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS }, loaded: true })
  useScheduleSessionStore.getState().setWeek(2)
  await db.timetables.put({ id: 1, name: 'Prepared timetable', isDefault: 1, startDate: '2026-11-02', timeJson: DEFAULT_TIME_JSON, nodeCount: 12, maxWeek: 20, createdAt: 0, smartConfigJson: '' })
  await db.courses.put({ id: 1, tableId: 1, groupId: 'prepared', courseName: 'Prepared course', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 20, type: 0, teacher: '', room: '', note: '', alias: '', color: '', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0 } as Course)
  await prepareInitialScheduleData()
  try {
    const { ScheduleView } = await import('./ScheduleView')
    const { container } = render(<StrictMode><ScheduleView /></StrictMode>)
    expect([...container.querySelectorAll<HTMLElement>('[data-grid-week]')].map(grid => Number(grid.dataset.gridWeek))).toEqual([1, 2, 3])
    expect(container.querySelector('[data-grid-week="2"] [data-course-id="1"]')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '导入第一张课表' })).toBeNull()
    expect(observeScroll).toHaveBeenCalledOnce()
    const wheel = new WheelEvent('wheel', { deltaX: 10, deltaY: 0, bubbles: true, cancelable: true })
    act(() => container.querySelector('[data-schedule-scroll]')!.dispatchEvent(wheel))
    expect(wheel.defaultPrevented).toBe(true)
    act(() => usePrefsStore.setState({ prefs: { ...usePrefsStore.getState().prefs, showDate: false } }))
    expect(observeScroll).toHaveBeenCalledOnce()
    viewportWidth = 360
    act(() => resizeScroll!([{ contentRect: { width: viewportWidth } } as ResizeObserverEntry], {} as ResizeObserver))
    const grid = container.querySelector<HTMLElement>('[data-grid-week="2"]')!
    const used = Number(grid.dataset.gridTime) + Number(grid.dataset.gridCol) * 7 + Number(grid.dataset.gridGap) * 8
    expect(used).toBeCloseTo(viewportWidth - 32, 6)
    expect(observeScroll).toHaveBeenCalledOnce()
  } finally {
    cleanup()
    discardInitialScheduleData()
    useScheduleSessionStore.getState().setWeek(null)
    await db.delete()
    await db.open()
  }
})
