import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { CardsGridView } from './CardsGridView'
import { estimatePeriodHeaderTextWidth } from './periodHeader'
import { DEFAULT_PREFS, type Course, type Prefs } from '../../data/types'
import { DEFAULT_TIME_JSON } from '../../domain/timeTable'
import { usePrefsStore } from '../../state/prefsStore'
import { initI18n } from '../../i18n'

// jsdom only. These tests neither start a server/browser nor open a database.
const initial = usePrefsStore.getState()
const observers: Array<{ callback: ResizeObserverCallback; element: Element }> = []
beforeAll(() => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) { observers.push({ callback: this.callback, element }) }
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  observers.length = 0
  usePrefsStore.setState(initial)
})
afterAll(() => vi.unstubAllGlobals())

const courses: Course[] = [1,2,3,4,5,6,7].map(day => ({
  id: day, groupId: `day-${day}`, tableId: 1, courseName: `课程${day}`, teacher: '教师', room: 'A101',
  note: '', alias: '', day, startNode: 1, step: 2, startWeek: 1, endWeek: 20, type: 0,
  color: '', colorMode: 0, ownTime: false, isIrregularNode: false, isIrregularTime: false,
  startTime: '', endTime: '', credit: 0, level: 0,
}))

const scenarios: ReadonlyArray<Partial<Prefs>> = [
  { periodHeaderLayout: 'legacy', gridScale: 1 },
  { periodHeaderLayout: 'legacy', gridScale: 1.3 },
  { periodHeaderLayout: 'legacy', gridScale: 0.7, periodHeaderTimeAlignment: 'center' },
  { periodHeaderLayout: 'legacy', gridScale: 1.3, periodHeaderHideTime: true, periodHeaderShowX: true, periodHeaderStyle: 'financial' },
  ...[-1, 0, 1].flatMap<Partial<Prefs>>(periodHeaderHanging => [
    { periodHeaderLayout: 'three_line', gridScale: 1, periodHeaderHanging },
    { periodHeaderLayout: 'three_line', gridScale: 1.3, periodHeaderHanging, periodHeaderStyle: 'financial', periodHeaderShowX: true },
    { periodHeaderLayout: 'three_line', gridScale: 1.3, gridPinchZoom: true, gridRowScale: 0.7, periodHeaderHanging, periodHeaderStyle: 'roman', periodHeaderShowX: true },
  ]),
]

it.each([320, 360, 402, 600])('%ipx renders equal course lanes and bounded, ordered period text', width => {
  for (const options of scenarios) {
    cleanup()
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, visibleDays: [1,2,3,4,5,6,7], ...options }, loaded: true })
    const { container } = render(<CardsGridView courses={courses} timeJson={DEFAULT_TIME_JSON} startDate="2026-11-09" currentWeek={1} containerWidth={width} />)
    const grid = container.querySelector<HTMLElement>('[data-grid-week]')!
    const time = Number(grid.dataset.gridTime)
    const col = Number(grid.dataset.gridCol)
    const gap = Number(grid.dataset.gridGap)
    expect(time).toBeLessThanOrEqual(col + 1e-6)
    const heads = [...container.querySelectorAll<HTMLElement>('[data-day-header]')]
    expect(heads.map(head => Number(head.dataset.dayHeader))).toEqual([1,2,3,4,5,6,7])
    heads.forEach(head => expect(parseFloat(head.style.width)).toBeCloseTo(col, 6))
    const cards = [...grid.querySelectorAll<HTMLElement>('[data-course-id]')]
    expect(cards).toHaveLength(7)
    cards.forEach((card, i) => {
      expect(parseFloat(card.style.width)).toBeCloseTo(col, 6)
      expect(parseFloat(card.style.left)).toBeCloseTo(time + gap + (col + gap) * i, 6)
    })
    for (const label of grid.querySelectorAll<HTMLElement>('[data-period-header-line="label"]')) {
      const cell = label.parentElement!
      const rowHeight = parseFloat(cell.parentElement!.style.height)
      expect(parseFloat(cell.style.width)).toBeCloseTo(time, 6)
      const lines = [...cell.querySelectorAll<HTMLElement>('[data-period-header-line]')]
      const kinds = lines.map(line => line.dataset.periodHeaderLine)
      expect([['label'], ['label', 'time'], ['start', 'label', 'end']]).toContainEqual(kinds)
      for (const [index, line] of lines.entries()) {
        const left = parseFloat(line.style.left)
        const top = parseFloat(line.style.top)
        const ink = estimatePeriodHeaderTextWidth(line.textContent!, parseFloat(line.style.fontSize), Number(line.style.fontWeight), parseFloat(line.style.letterSpacing))
        expect(line.style.whiteSpace).toBe('nowrap')
        expect(left).toBeGreaterThanOrEqual(0)
        expect(left + ink).toBeLessThanOrEqual(time + 1e-6)
        expect(top).toBeGreaterThanOrEqual(0)
        expect(top + parseFloat(line.style.lineHeight)).toBeLessThanOrEqual(rowHeight + 1e-6)
        if (index) expect(top).toBeGreaterThanOrEqual(parseFloat(lines[index-1].style.top) + parseFloat(lines[index-1].style.lineHeight) - 1e-6)
      }
      if (options.periodHeaderLayout === 'legacy' && options.periodHeaderHideTime) expect(kinds).toEqual(['label'])
    }
  }
})

it('uses the measured content box after resize, including scaled padding', () => {
  usePrefsStore.setState({ prefs: { ...DEFAULT_PREFS, visibleDays: [1,2,3,4,5,6,7], gridScale: 1.3 }, loaded: true })
  const { container } = render(<CardsGridView courses={[]} timeJson={DEFAULT_TIME_JSON} startDate="" currentWeek={1} containerWidth={600} />)
  const root = container.firstElementChild as HTMLElement
  const observer = observers.find(observer => observer.element === root)!
  for (const outerWidth of [320, 402, 600, 360]) {
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: outerWidth })
    act(() => observer.callback([], {} as ResizeObserver))
    const grid = container.querySelector<HTMLElement>('[data-grid-week]')!
    const expected = outerWidth - 16 * 1.3
    const used = Number(grid.dataset.gridTime) + Number(grid.dataset.gridCol) * 7 + Number(grid.dataset.gridGap) * 8
    expect(used).toBeCloseTo(expected, 6)
  }
})
