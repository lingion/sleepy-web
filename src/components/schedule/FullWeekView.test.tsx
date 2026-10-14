/**
 * 周视图日卡日期显示契约测试 (feat/weekly-card-date)。
 *
 * 锁定行为本身: showDate=true 时, WeekStrip 摘要卡与 DetailDayCard 详情卡的
 * 天名后必须跟 "·M/D" 形式日期 (用户 2026-10-14 需求: "周一·10-13 这样子");
 * showDate=false 时整体隐藏 — 与网格视图 DayHeadCell 共用同一开关与格式。
 * 红绿验证: 去掉 FullWeekView.tsx 中任一 `·${shortDate(date)}` 拼接 → 对应断言全红。
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { FullWeekView, DetailDayCard } from './FullWeekView'
import { initI18n } from '../../i18n'
import { usePrefsStore } from '../../state/prefsStore'
import type { Course } from '../../data/types'

const TIME_JSON = JSON.stringify([
  { node: 1, startTime: '08:00', endTime: '08:50' },
  { node: 2, startTime: '09:00', endTime: '09:50' },
])

/** startDate=2026-10-12 是周一; week 1 → 周一=10-12, 周三=10-14 */
const START = '2026-10-12'
const COURSE: Course = {
  id: 1,
  groupId: 'g1',
  tableId: 1,
  courseName: '高等数学',
  teacher: '张三',
  room: 'A101',
  note: '',
  alias: '',
  day: 3,
  startNode: 1,
  step: 2,
  startWeek: 1,
  endWeek: 16,
  type: 0,
  color: '#4085F2',
  colorMode: 0,
  ownTime: false,
  isIrregularNode: false,
  isIrregularTime: false,
  startTime: '',
  endTime: '',
  credit: 0,
  level: 0,
}

function setPrefs(patch: Record<string, unknown>) {
  usePrefsStore.setState({
    prefs: { ...usePrefsStore.getState().prefs, ...patch },
    loaded: true,
  })
}

function stubMatchMedia(matches = false) {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (q: string) => ({
      matches,
      media: q,
      onchange: null,
      addListener: () => {}, // legacy
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }
}

beforeAll(() => {
  initI18n('zh-CN')
  stubMatchMedia()
  if (!('ResizeObserver' in window)) {
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    })
  }
})

afterEach(() => {
  cleanup()
  setPrefs({ showDate: true })
})

describe('FullWeekView 日期显示 — WeekStrip 摘要 + DetailDayCard 详情', () => {
  it('showDate=true → 摘要卡出现 周一·10/12 周三·10/14', () => {
    setPrefs({ showDate: true })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate={START} currentWeek={1} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('周一·10/12')
    expect(text).toContain('周三·10/14')
  })

  it('showDate=true → 详情卡标题出现 周三·10/14 (· 今天 后缀共存)', () => {
    setPrefs({ showDate: true })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate={START} currentWeek={1} />
    )
    const todayCard = Array.from(container.querySelectorAll('.m3-title-small')).find(
      (el) => el.textContent === '周三·10/14· 今天'
    )
    expect(todayCard).not.toBeUndefined()
  })

  it('showDate=false → 日期整体隐藏, 只剩天名 (与网格视图同开关)', () => {
    setPrefs({ showDate: false })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate={START} currentWeek={1} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('周三')
    expect(text).not.toContain('周三·10/14')
    expect(text).not.toContain('·10/')
  })

  it('startDate 未设置 (空串) → 不显示日期数字, 不崩溃', () => {
    setPrefs({ showDate: true })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate="" currentWeek={1} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('周三')
    // "周三· 今天" 中的 · 是 today_suffix (而非日期), 不应带 M/D 数字
    expect(text).not.toContain('10/14')
    expect(text).not.toContain('10/12')
  })

  it('DetailDayCard 独立渲染 (两栏 DayColumn 同一路径) → 标题带 ·M/D', () => {
    setPrefs({ showDate: true })
    const { container } = render(
      <DetailDayCard
        day={3}
        courses={[COURSE]}
        isToday={false}
        date={new Date(2026, 9, 14)}
        timeJson={TIME_JSON}
        scale={1}
        cornerRatio={1}
      />
    )
    expect(container.textContent).toContain('周三·10/14')
  })
})
