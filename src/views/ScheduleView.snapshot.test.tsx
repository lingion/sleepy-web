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

const times = '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:50","end":"09:35"}]'
const table: Table = { id: 1, name: 'First timetable', isDefault: 1, startDate: '2026-11-02', timeJson: times, nodeCount: 2, maxWeek: 20, createdAt: 0, smartConfigJson: '', periodTableId: 7 }
const course: Course = {
  id: 1, tableId: 1, groupId: 'first', courseName: 'First course', teacher: '', room: '', note: '', alias: '',
  day: 1, startNode: 1, step: 1, startWeek: 1, endWeek: 20, type: 0, color: '', colorMode: 0,
  ownTime: false, isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
}

beforeEach(async () => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-schedule-scroll') ? 402 : 386
  })
  vi.spyOn(useHolidayStore.getState(), 'load').mockResolvedValue(undefined)
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, startView: 'cards' }, loaded: true })
  useScheduleSessionStore.getState().setWeek(2)
  await db.periodTables.put({ id: 7, name: 'Shared periods', nodesPerDay: 2, timeJson: times, createdAt: 0, smartConfigJson: '', updatedAt: 0 })
  await db.timetables.bulkPut([table, { ...table, id: 2, name: 'Second timetable', isDefault: 0 }])
  await db.courses.bulkPut([course, { ...course, id: 2, tableId: 2, groupId: 'second', courseName: 'Second course' }])
  await db.prefs.put({ key: 'sampleTableId', value: '1' })
  await prepareInitialScheduleData()
  queried.snapshots.length = 0
  vi.mocked(buildGridGeometry).mockClear()
})

afterEach(async () => {
  cleanup()
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
