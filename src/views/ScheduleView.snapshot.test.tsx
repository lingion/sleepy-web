import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { DEFAULT_PREFS, type Course, type Table } from '../data/types'
import { initI18n } from '../i18n'
import { useBackStack } from '../state/backStack'
import { useHolidayStore } from '../state/holidayStore'
import { usePrefsStore } from '../state/prefsStore'
import { useScheduleSessionStore } from '../state/scheduleSessionStore'
import { discardInitialScheduleData, getInitialScheduleData, prepareInitialScheduleData } from '../startup/scheduleData'
import { buildGridGeometry } from '../components/schedule/gridGeometry'
import { CardsGridView } from '../components/schedule/CardsGridView'
import { configureCourseHues } from '../data/courseHueCache'
import { ScheduleView } from './ScheduleView'

const queried = vi.hoisted(() => ({ snapshots: [] as unknown[] }))
// Observe completed queries while retaining Dexie's real liveQuery subscription.
vi.mock('dexie-react-hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('dexie-react-hooks')>()
  return {
    ...actual,
    useLiveQuery: (query: () => unknown, deps?: unknown[], initial?: unknown) => actual.useLiveQuery(async () => {
      const result = await query()
      if (result && typeof result === 'object' && 'tables' in result && 'courses' in result) queried.snapshots.push(result)
      return result
    }, deps ?? [], initial),
  }
})
vi.mock('../components/schedule/gridGeometry', async importOriginal => {
  const actual = await importOriginal<typeof import('../components/schedule/gridGeometry')>()
  return { ...actual, buildGridGeometry: vi.fn(actual.buildGridGeometry) }
})
vi.mock('../components/schedule/CardsGridView', async importOriginal => {
  const actual = await importOriginal<typeof import('../components/schedule/CardsGridView')>()
  return { ...actual, CardsGridView: vi.fn(actual.CardsGridView) }
})

const observers: Array<{ callback: ResizeObserverCallback; element: Element }> = []
let viewportWidth = 402
let isDark = false

const times = '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:50","end":"09:35"}]'
const table: Table = { id: 1, name: 'First timetable', isDefault: 1, startDate: '2026-11-02', timeJson: times, nodeCount: 2, maxWeek: 20, createdAt: 0, smartConfigJson: '', periodTableId: 7 }
const course: Course = {
  id: 1, tableId: 1, groupId: 'first', courseName: 'First course', teacher: '', room: '', note: '', alias: '',
  day: 1, startNode: 1, step: 1, startWeek: 1, endWeek: 20, type: 0, color: '', colorMode: 0,
  ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
}

beforeEach(async () => {
  initI18n('zh-CN')
  observers.length = 0
  viewportWidth = 402
  isDark = false
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) { observers.push({ callback: this.callback, element }) }
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: isDark, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-schedule-scroll') ? viewportWidth : viewportWidth - 16
  })
  vi.spyOn(useHolidayStore.getState(), 'load').mockResolvedValue(undefined)
  useHolidayStore.setState({ entries: {}, status: {}, overrides: [] })
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, startView: 'cards' }, loaded: true })
  useScheduleSessionStore.getState().setWeek(2)
  await db.periodTables.put({ id: 7, name: 'Shared periods', nodesPerDay: 2, timeJson: times, createdAt: 0, smartConfigJson: '', updatedAt: 0 })
  await db.timetables.bulkPut([table, { ...table, id: 2, name: 'Second timetable', isDefault: 0 }])
  await db.courses.bulkPut([course, { ...course, id: 2, tableId: 2, groupId: 'second', courseName: 'Second course' }])
  await db.prefs.put({ key: 'sampleTableId', value: '1' })
  await prepareInitialScheduleData()
  queried.snapshots.length = 0
  vi.mocked(buildGridGeometry).mockClear()
  vi.mocked(CardsGridView).mockClear()
})

afterEach(async () => {
  cleanup()
  configureCourseHues(0, {})
  discardInitialScheduleData()
  useBackStack.getState().reset()
  useScheduleSessionStore.getState().setWeek(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await db.delete()
  await db.open()
})

async function firstLiveResult() {
  await waitFor(() => expect(queried.snapshots.length).toBeGreaterThan(0))
  await act(async () => {})
}

it('keeps all three geometries on the first equal query and updates real course, period, table and sample changes', async () => {
  const initial = getInitialScheduleData()
  const { container } = render(<ScheduleView />)
  expect([...container.querySelectorAll<HTMLElement>('[data-grid-week]')].map(grid => Number(grid.dataset.gridWeek))).toEqual([1, 2, 3])
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)
  discardInitialScheduleData()
  await firstLiveResult()
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)
  expect(queried.snapshots.at(-1)).toBe(initial)

  await act(async () => { await db.courses.update(1, { courseName: 'Edited course', room: 'Changed room', fixedDate: null }) })
  await waitFor(() => expect(screen.getAllByText('Edited course')).toHaveLength(3))
  expect(buildGridGeometry).toHaveBeenCalledTimes(6)
  expect(screen.getAllByText('Changed room')).toHaveLength(3)

  const changedTimes = times.replaceAll('08:', '10:').replaceAll('09:', '11:')
  await act(async () => { await db.periodTables.update(7, { timeJson: changedTimes, updatedAt: 1 }) })
  await waitFor(() => expect([...container.querySelectorAll('[data-period-header-line]')].map(line => line.textContent).join(' ')).toContain('10:00'))
  expect(buildGridGeometry).toHaveBeenCalledTimes(9)

  await act(async () => {
    await db.transaction('rw', db.timetables, async () => {
      await db.timetables.update(1, { isDefault: 0 })
      await db.timetables.update(2, { isDefault: 1 })
    })
  })
  await waitFor(() => expect(screen.getAllByText('Second course')).toHaveLength(3))
  expect(buildGridGeometry).toHaveBeenCalledTimes(12)
  expect(screen.queryByText('Edited course')).toBeNull()

  await act(async () => { await db.prefs.put({ key: 'sampleTableId', value: '2' }) })
  await screen.findByText(/这是一张示例课表/)
  expect(buildGridGeometry).toHaveBeenCalledTimes(15)
  await act(async () => { await db.prefs.put({ key: 'sampleBannerDismissed', value: '1' }) })
  await waitFor(() => expect(screen.queryByText(/这是一张示例课表/)).toBeNull())
  expect(buildGridGeometry).toHaveBeenCalledTimes(18)

  await act(async () => { await db.courses.delete(2) })
  await waitFor(() => expect(container.querySelector('[data-grid-week]')).toBeNull())
  expect(screen.queryByText('Second course')).toBeNull()
})

it('does not keep a mounted view snapshot after leaving and switching the default table', async () => {
  const first = render(<ScheduleView />)
  await firstLiveResult()
  first.unmount()
  discardInitialScheduleData()
  await db.transaction('rw', db.timetables, async () => {
    await db.timetables.update(1, { isDefault: 0 })
    await db.timetables.update(2, { isDefault: 1 })
  })
  queried.snapshots.length = 0
  render(<ScheduleView />)
  expect(screen.queryByText('First course')).toBeNull()
  await waitFor(() => expect(screen.getAllByText('Second course')).toHaveLength(3))
  expect(screen.queryByText('First course')).toBeNull()
})

it('ignores a fractional observer report for the same client width and still resizes all three pages', async () => {
  const { container } = render(<ScheduleView />)
  await firstLiveResult()
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  const scroll = container.querySelector('[data-schedule-scroll]')!
  const observer = observers.find(item => item.element === scroll)!
  act(() => observer.callback([{ contentRect: { width: 401.984375 } } as ResizeObserverEntry], {} as ResizeObserver))
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)

  viewportWidth = 360
  act(() => observer.callback([{ contentRect: { width: 359.984375 } } as ResizeObserverEntry], {} as ResizeObserver))
  expect([...container.querySelectorAll<HTMLElement>('[data-grid-week]')].map(grid => Number(grid.dataset.gridWeek))).toEqual([1, 2, 3])
  for (const grid of container.querySelectorAll<HTMLElement>('[data-grid-week]')) {
    const used = Number(grid.dataset.gridTime) + Number(grid.dataset.gridCol) * 7 + Number(grid.dataset.gridGap) * 8
    expect(used).toBeCloseTo(viewportWidth - 32, 6)
  }
  const wheel = new WheelEvent('wheel', { deltaX: 200, deltaY: 0, bubbles: true, cancelable: true })
  act(() => scroll.dispatchEvent(wheel))
  expect(wheel.defaultPrevented).toBe(true)
  await waitFor(() => expect(useScheduleSessionStore.getState().week).toBe(3))
  expect([...container.querySelectorAll<HTMLElement>('[data-grid-week]')].map(grid => Number(grid.dataset.gridWeek))).toEqual([2, 3, 4])
})

it.each([0, 6, 15])('reserves a %ipx scrollbar gutter before measuring the empty pager and keeps all seven lanes', async scrollbarWidth => {
  // jsdom has no scrollbar layout. Model the browser transition in the trace:
  // before the pages mount there is no overflow; after mounting, a classic
  // scrollbar reduces the client width unless its gutter was reserved already.
  let overflowing = true
  const scrollMeasurements: Array<{ width: number; hasPages: boolean }> = []
  const availableWidth = (scroll: HTMLElement) => viewportWidth -
    (scroll.style.scrollbarGutter === 'stable' || overflowing && !!scroll.querySelector('[data-schedule-week]') ? scrollbarWidth : 0)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-schedule-scroll')) {
      const width = availableWidth(this)
      scrollMeasurements.push({ width, hasPages: !!this.querySelector('[data-schedule-week]') })
      return width
    }
    const scroll = this.closest<HTMLElement>('[data-schedule-scroll]')
    return scroll ? availableWidth(scroll) - 16 : viewportWidth - 16
  })
  const { container } = render(<ScheduleView />)
  const scroll = container.querySelector<HTMLElement>('[data-schedule-scroll]')!
  const width = viewportWidth - scrollbarWidth
  // Assert the geometry inputs and number of layouts before checking CSS.
  // Without reservation the first three inputs are 370px, then each grid
  // corrects to 364px with a 6px scrollbar, matching the production trace.
  expect(vi.mocked(buildGridGeometry).mock.calls.map(call => call[3])).toEqual([width - 32, width - 32, width - 32])
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  expect(scrollMeasurements[0]).toEqual({ width, hasPages: false })
  expect(scroll.style.scrollbarGutter).toBe('stable')
  expect(scroll.style.overflowY).toBe('auto')
  expect(scroll.style.overflowX).toBe('hidden')
  expect(container.querySelectorAll('[style*="scrollbar-gutter"]')).toHaveLength(1)

  const pages = [...scroll.querySelectorAll<HTMLElement>('[data-schedule-week]')]
  expect(pages.map(page => Number(page.dataset.scheduleWeek))).toEqual([1, 2, 3])
  expect(pages[0].parentElement!.style.width).toBe('300%')
  for (const page of pages) {
    expect(parseFloat(page.style.width)).toBeCloseTo(100 / 3, 6)
    expect(page.style.flexShrink).toBe('0')
    const grid = page.querySelector<HTMLElement>('[data-grid-week]')!
    expect(JSON.parse(grid.dataset.gridDays!)).toEqual([1, 2, 3, 4, 5, 6, 7])
    const used = Number(grid.dataset.gridTime) + Number(grid.dataset.gridCol) * 7 + Number(grid.dataset.gridGap) * 8
    expect(used + 32).toBeCloseTo(width, 6)
  }
  await firstLiveResult()
  const observer = observers.find(item => item.element === scroll)!
  act(() => observer.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver))
  overflowing = false
  act(() => observer.callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver))
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)

  const wheel = new WheelEvent('wheel', { deltaX: 200, deltaY: 0, bubbles: true, cancelable: true })
  act(() => scroll.dispatchEvent(wheel))
  expect(wheel.defaultPrevented).toBe(true)
  const track = pages[0].parentElement!
  expect(track.style.transform).toContain(`${-width}px`)
  await waitFor(() => expect(useScheduleSessionStore.getState().week).toBe(3))
  expect([...scroll.querySelectorAll<HTMLElement>('[data-schedule-week]')].map(page => Number(page.dataset.scheduleWeek))).toEqual([2, 3, 4])
})

it('supplies scaled content width before mounting each grid instead of correcting three layouts', async () => {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, gridScale: 1.3 }, loaded: true })
  const { container } = render(<ScheduleView />)
  await firstLiveResult()
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)
  for (const grid of container.querySelectorAll<HTMLElement>('[data-grid-week]')) {
    const used = Number(grid.dataset.gridTime) + Number(grid.dataset.gridCol) * 7 + Number(grid.dataset.gridGap) * 8
    expect(used).toBeCloseTo(viewportWidth - 16 - 16 * 1.3, 6)
  }
})

it('keeps grid bodies and geometry on a hue notification while subscribed course colors still change', async () => {
  configureCourseHues(1, { first: 20 })
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, courseColorMode: 1 }, loaded: true })
  const { container } = render(<ScheduleView />)
  await firstLiveResult()
  const card = container.querySelector<HTMLElement>('[data-grid-week="2"] [data-course-id="1"] > div')!
  const before = card.style.background
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  act(() => {
    configureCourseHues(1, { first: 220 })
    usePrefsStore.setState({ prefs: { ...usePrefsStore.getState().prefs } })
  })
  expect(card.style.background).not.toBe(before)
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)

  const light = card.style.background
  act(() => {
    isDark = true
    usePrefsStore.setState({ prefs: { ...usePrefsStore.getState().prefs } })
  })
  expect(card.style.background).not.toBe(light)
  expect(CardsGridView).toHaveBeenCalledTimes(3)

  act(() => usePrefsStore.setState({ prefs: { ...usePrefsStore.getState().prefs, gridScale: 1.3, gridSubInfo: 'none' } }))
  expect(vi.mocked(CardsGridView).mock.calls.slice(3).map(([props]) => props.currentWeek)).toEqual(expect.arrayContaining([1, 2, 3]))
  expect(container.querySelector<HTMLElement>('[data-grid-week="2"] [data-course-id="1"]')!.style.padding).toBe('2.6px')
})

it('reuses equivalent grey days after holiday fetch but redraws the affected week and range overrides', async () => {
  const { container } = render(<ScheduleView />)
  await firstLiveResult()
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  act(() => useHolidayStore.setState({ entries: { 2026: [{ date: '2026-01-01', name: 'Outside pager', type: 'public_holiday' }] } }))
  expect(CardsGridView).toHaveBeenCalledTimes(3)
  vi.mocked(CardsGridView).mockClear()
  act(() => useHolidayStore.setState({ entries: { 2026: [{ date: '2026-11-09', name: 'Visible holiday', type: 'public_holiday' }] } }))
  expect(CardsGridView).toHaveBeenCalled()
  expect(new Set(vi.mocked(CardsGridView).mock.calls.map(([props]) => props.currentWeek))).toEqual(new Set([2]))
  const card = container.querySelector<HTMLElement>('[data-grid-week="2"] [data-course-id="1"] > div')!
  expect(card.style.opacity).toBe('0.6')
  vi.mocked(CardsGridView).mockClear()
  act(() => useHolidayStore.setState({ overrides: [{ id: 'remove-holiday', name: '', startDate: '2026-11-09', endDate: '2026-11-09', type: 'removed', sourceKey: 'holiday:2026-11-09' }] }))
  expect(card.style.opacity).toBe('1')
  expect(CardsGridView).toHaveBeenCalled()
  expect(new Set(vi.mocked(CardsGridView).mock.calls.map(([props]) => props.currentWeek))).toEqual(new Set([2]))
  expect(buildGridGeometry).toHaveBeenCalledTimes(3)
})
