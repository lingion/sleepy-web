/**
 * legacy 两行表头共轴渲染契约 (ref #102, Android e03adccd / v1.0.61 定稿).
 *
 * 锁定行为: 整列所有行 dash 落同一 X (共轴), 标签同轴居中, 两行墨迹按
 * legacyColumnVerticalFit 整体垂直解绝对定位 — 不再逐卡 flex 居中。
 * 红绿验证: CardsGridView legacy 分支回退为 alignItems:center → 行内 left/top 消失, 断言全红。
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CardsGridView } from './CardsGridView'
import { estimatePeriodHeaderTextWidth } from './periodHeader'
import { initI18n } from '../../i18n'
import { usePrefsStore } from '../../state/prefsStore'
import { DEFAULT_TIME_JSON } from '../../domain/timeTable'

beforeAll(() => {
  initI18n('zh-CN')
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })
  }
  if (!('ResizeObserver' in window)) {
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: class { observe() {} unobserve() {} disconnect() {} },
    })
  }
})

afterEach(() => {
  cleanup()
  usePrefsStore.setState({
    prefs: { ...usePrefsStore.getState().prefs, periodHeaderLayout: 'legacy' },
    loaded: true,
  })
})

function renderGrid() {
  usePrefsStore.setState({
    prefs: { ...usePrefsStore.getState().prefs, periodHeaderLayout: 'legacy' },
    loaded: true,
  })
  const { container } = render(
    <CardsGridView
      courses={[]}
      timeJson={DEFAULT_TIME_JSON}
      startDate=""
      currentWeek={1}
      containerWidth={1000}
    />,
  )
  const labels = Array.from(container.querySelectorAll('[data-period-header-line="label"]')) as HTMLElement[]
  const times = Array.from(container.querySelectorAll('[data-period-header-line="time"]')) as HTMLElement[]
  return { labels, times }
}

describe('legacy 表头共轴渲染 (ref #102)', () => {
  it('时间串逐行行内定位且 dash 全列同一 X', () => {
    const { times } = renderGrid()
    expect(times.length).toBeGreaterThan(6)
    // 估算口径下所有 displayStart 同宽 → 行内 left 相等 = dash 共轴的渲染事实
    const lefts = times.map((el) => parseFloat(el.style.left))
    expect(lefts.every((left) => left === lefts[0])).toBe(true)
    // 定位不再是 flex 居中 (旧实现 left 为空)
    expect(lefts[0]).toBeCloseTo(3 + 34.1 - 31.9 - 2.2, 4)
  })

  it('标签中心与时间串 dash 中心同轴 (逐行标签宽不同)', () => {
    const { labels, times } = renderGrid()
    expect(labels.length).toBe(times.length)
    labels.forEach((label, i) => {
      const labelPx = estimatePeriodHeaderTextWidth(label.textContent ?? '', 12)
      const labelCenter = parseFloat(label.style.left) + labelPx / 2
      const dashCenter = parseFloat(times[i].style.left) + estimatePeriodHeaderTextWidth('08:00', 11) + estimatePeriodHeaderTextWidth('-', 11) / 2
      expect(labelCenter).toBeCloseTo(dashCenter, 2)
    })
    // 标签 left 随标签宽变化 — 证明是共轴对齐而非逐行同值
    const labelLefts = labels.map((el) => parseFloat(el.style.left))
    expect(new Set(labelLefts.map((left) => left.toFixed(2))).size).toBeGreaterThan(1)
  })

  it('两行墨迹按 union 垂直解定位 (行高 52 → 内容 46, gap 2, 整体居中)', () => {
    const { labels, times } = renderGrid()
    // contentH=46, union=14+13+2=29 → top=(46-29)/2=8.5 (+pad 3); 安卓 legacy 行高 label14/time13
    expect(parseFloat(labels[0].style.top)).toBeCloseTo(11.5, 3)
    expect(parseFloat(times[0].style.top)).toBeCloseTo(27.5, 3)
    // 行高足够 → fontScale=1 → 基准字号 12/11, 行盒 14/13 (headerLabelStyle/headerTimeStyle)
    expect(parseFloat(labels[0].style.fontSize)).toBeCloseTo(12, 3)
    expect(parseFloat(times[0].style.fontSize)).toBeCloseTo(11, 3)
    expect(parseFloat(labels[0].style.lineHeight)).toBeCloseTo(14, 3)
    expect(parseFloat(times[0].style.lineHeight)).toBeCloseTo(13, 3)
  })
})
