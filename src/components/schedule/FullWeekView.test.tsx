/**
 * 周视图日期显示契约测试 (ref sleepy#191)。
 *
 * 锁定行为: showDate=true 时, WeekStrip 摘要卡只显示天名 (不再带日期);
 * DetailDayCard 详情卡天名后跟 "·M月d日" (固定中文格式, Android shortDateChinese 同构,
 * 不随语言切换)。showDate=false 时详情卡日期整体隐藏。
 * 红绿验证: 去掉 FullWeekView.tsx 中 DetailDayCard 的 `·${shortDateChinese(date)}` → 对应断言全红;
 * 给 DaySummaryCell 加回日期 → 摘要卡无日期断言变红。
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
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

describe('FullWeekView 日期显示 — 摘要卡无日期 + DetailDayCard 中文日期 (ref sleepy#191)', () => {
  it('showDate=true → 摘要卡只有天名, 不带日期', () => {
    setPrefs({ showDate: true })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate={START} currentWeek={1} />
    )
    const strip = container.querySelector('div[style*="gap"]') ?? container
    const stripText = Array.from(strip.querySelectorAll('span')).map((el) => el.textContent ?? '').join('|')
    expect(stripText).toContain('周一')
    expect(stripText).not.toMatch(/10[月/]/)
  })

  it('showDate=true → 详情卡标题出现 周三·10月14日 (· 今天 后缀共存)', () => {
    setPrefs({ showDate: true })
    // 冻结系统时间到 2026-10-14 (周三): "今天"判定依赖 new Date(),不锁时钟则断言只在当天为周三时成立
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    try {
      const { container } = render(
        <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate={START} currentWeek={1} />
      )
      const todayCard = Array.from(container.querySelectorAll('.m3-title-small')).find(
        (el) => el.textContent === '周三·10月14日· 今天'
      )
      expect(todayCard).not.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('showDate=false → 详情卡日期整体隐藏, 只剩天名', () => {
    setPrefs({ showDate: false })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate={START} currentWeek={1} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('周三')
    expect(text).not.toContain('10月14日')
    expect(text).not.toContain('月')
  })

  it('startDate 未设置 (空串) → 不显示日期数字, 不崩溃', () => {
    setPrefs({ showDate: true })
    const { container } = render(
      <FullWeekView courses={[COURSE]} timeJson={TIME_JSON} startDate="" currentWeek={1} />
    )
    const text = container.textContent ?? ''
    expect(text).toContain('周三')
    // "周三· 今天" 中的 · 是 today_suffix (而非日期), 不应带日期数字
    expect(text).not.toContain('10月14日')
    expect(text).not.toContain('10月12日')
  })

  it('DetailDayCard 独立渲染 (两栏 DayColumn 同一路径) → 标题带 ·M月d日', () => {
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
    expect(container.textContent).toContain('周三·10月14日')
  })
})
