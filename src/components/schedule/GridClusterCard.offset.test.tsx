/**
 * 重叠簇逐卡行定位契约 (ref #146 #147, Android 2b5882be / v1.0.61 定稿).
 *
 * 锁定行为: 簇 Box 绝对定位在锚点行 (baseRowFrac), 内容原点经 clusterYOffset =
 * (minStartRow − baseRowFrac) 回退到最早行; 簇内每卡 y = spanDpOf(minStartRow,
 * startRowFrac) — 1-2 节 + 2-4 节同格 → 两卡分别落第 1、2 行起点, 不再全卡
 * top:0 互相压死。锚定规则 v5: 「右下」是相对**该课自身区间**的方位。
 * ownTime 成员按 timeToFractionalRows 小数行定位, 簇内 dp 全走加权轴。
 * 红绿验证: ClusterItem 回退 top:0 → top 断言全红。
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { CardsGridView } from './CardsGridView'
import { initI18n } from '../../i18n'
import { usePrefsStore } from '../../state/prefsStore'
import { DEFAULT_PREFS } from '../../data/types'
import { DEFAULT_TIME_JSON } from '../../domain/timeTable'
import type { Course } from '../../data/types'

function mkCourse(partial: Partial<Course>): Course {
  return {
    id: 1, groupId: 'g1', tableId: 1, courseName: '课', teacher: 'T', room: 'R',
    note: '', alias: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16,
    type: 0, color: '', colorMode: 0, ownTime: false, isIrregularNode: false,
    isIrregularTime: false, startTime: '', endTime: '', credit: 0, level: 0,
    ...partial,
  }
}

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
})

// #146 报障原样: 周一 1-2 节短课 + 2-4 节长课同格。
// findClusters 簇内序 = 主课判定序 (step 降) → courses[0] = 2-4 长课 (锚点 base=第 2 行)。
const shortA = mkCourse({ id: 101, courseName: '短课甲', day: 1, startNode: 1, step: 2 })
const longB = mkCourse({ id: 102, courseName: '长课乙', day: 1, startNode: 2, step: 3 })

// scale=1 几何基线 (gridGeometry.test 同源): rowH=56, gapH=4; colW 由容器宽推导。
const ROW_H = 56
const GAP_H = 4

function setStyle(style: 'rail' | 'stack' | 'fold') {
  usePrefsStore.setState({
    prefs: { ...usePrefsStore.getState().prefs, periodHeaderLayout: 'legacy', conflictStyle: style },
    loaded: true,
  })
}

function renderCluster(style: 'rail' | 'stack' | 'fold', courses: Course[] = [shortA, longB]) {
  setStyle(style)
  const { container } = render(
    <CardsGridView
      courses={courses}
      timeJson={DEFAULT_TIME_JSON}
      startDate=""
      currentWeek={1}
      containerWidth={1000}
    />,
  )
  const cardOf = (id: number) =>
    container.querySelector(`[data-grid-cluster-card="${id}"]`) as HTMLElement | null
  const markOf = (id: number) =>
    container.querySelector(`[data-grid-cluster-mark="${id}"]`) as HTMLElement | null
  return { cardOf, markOf, container }
}

describe('重叠簇逐卡行定位 (ref #146 #147)', () => {
  it('rail: 1-2 节沉底卡 top=0, 2-4 节顶卡 top=1 行高 (旧实现全 top:0 → 红)', () => {
    const { cardOf } = renderCluster('rail')
    const a = cardOf(shortA.id)
    const b = cardOf(longB.id)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(parseFloat(a!.style.top)).toBeCloseTo(0, 3)
    expect(parseFloat(b!.style.top)).toBeCloseTo(ROW_H, 3)
    expect(parseFloat(a!.style.height)).toBeCloseTo(2 * ROW_H - GAP_H, 3)
    expect(parseFloat(b!.style.height)).toBeCloseTo(3 * ROW_H - GAP_H, 3)
  })

  it('rail: 顶卡右缘收窄 railInset, 沉底卡全宽 (形态只改宽窄)', () => {
    const { cardOf } = renderCluster('rail')
    const a = cardOf(shortA.id)!
    const b = cardOf(longB.id)!
    expect(parseFloat(a.style.width) - parseFloat(b.style.width)).toBeCloseTo(DEFAULT_PREFS.conflictRailInset, 3)
  })

  it('stack: 顶卡锚自身区间左上缩 d, 沉卡锚自身区间右下缩 d (v5 锚定规则)', () => {
    const { cardOf } = renderCluster('stack')
    const inset = DEFAULT_PREFS.conflictStackInset
    const a = cardOf(shortA.id)! // 沉卡右下锚: y = ownY + inset
    const b = cardOf(longB.id)!  // 顶卡左上锚: y = ownY
    expect(parseFloat(b.style.top)).toBeCloseTo(ROW_H, 3)
    expect(parseFloat(b.style.left)).toBeCloseTo(0, 3)
    expect(parseFloat(b.style.height)).toBeCloseTo(3 * ROW_H - GAP_H - inset, 3)
    expect(parseFloat(a.style.top)).toBeCloseTo(inset, 3)
    expect(parseFloat(a.style.left)).toBeCloseTo(inset, 3)
    expect(parseFloat(a.style.height)).toBeCloseTo(2 * ROW_H - GAP_H - inset, 3)
    // 沉卡下缘严格在自身区间底 (1-2 节), 不伸进第 3 节
    expect(parseFloat(a.style.top) + parseFloat(a.style.height)).toBeCloseTo(2 * ROW_H - GAP_H, 3)
  })

  it('fold: hidden 课虚线轮廓锚自身区间 (1-2 节高 ±2dp 内缩), 不再覆盖整簇框', () => {
    const { markOf, cardOf } = renderCluster('fold')
    const b = cardOf(longB.id)!
    const a = markOf(shortA.id)
    expect(a).not.toBeNull()
    expect(parseFloat(b.style.top)).toBeCloseTo(ROW_H, 3)
    // DashOutline: offset(y = cardYOf + 2) size(h = ownH − 4)
    expect(parseFloat(a!.style.top)).toBeCloseTo(2, 3)
    expect(parseFloat(a!.style.height)).toBeCloseTo(2 * ROW_H - GAP_H - 4, 3)
  })

  it('不变量: 簇容器绝对定位在锚点行, 内容原点回退到最早行 (clusterYOffset = min − base)', () => {
    const { cardOf, container } = renderCluster('rail')
    const a = cardOf(shortA.id)!
    const b = cardOf(longB.id)!
    const topA = parseFloat(a.style.top)
    const topB = parseFloat(b.style.top)
    expect(topA).toBeLessThan(topB)
    expect(topA + parseFloat(a.style.height)).toBeGreaterThan(topB) // 真重叠保留
    // 锚点 = 主课 2-4 (第 2 行) → 容器 top = 56; 内容回退 −56 后 A 卡绝对位置 = 第 1 行
    const clusterBox = container.querySelector('[data-grid-cluster]') as HTMLElement
    expect(parseFloat(clusterBox.style.top)).toBeCloseTo(ROW_H, 3)
    expect(topA).toBeCloseTo(0, 3)
  })

  it('ownTime 成员按小数行定位: 08:30 起点 → 行 0.667×rowH, 非整格吸附 (加权轴)', () => {
    // 常规 1-2 节 (行 0-2) + ownTime 08:30-09:30 → frac [0.667, 1.778]
    const normal = mkCourse({ id: 104, courseName: '常规丁', day: 3, startNode: 1, step: 2 })
    const own = mkCourse({
      id: 103, courseName: '非常规丙', day: 3, startNode: 1, step: 2,
      ownTime: true, isIrregularTime: true, startTime: '08:30', endTime: '09:30',
    })
    const { cardOf } = renderCluster('rail', [normal, own])
    const ownEl = cardOf(own.id)
    const normalEl = cardOf(normal.id)
    expect(ownEl).not.toBeNull()
    expect(normalEl).not.toBeNull()
    expect(parseFloat(normalEl!.style.top)).toBeCloseTo(0, 3)
    expect(parseFloat(ownEl!.style.top)).toBeCloseTo((30 / 45) * ROW_H, 2)
    expect(parseFloat(ownEl!.style.height)).toBeCloseTo((1.7777778 - 0.6666667) * ROW_H - GAP_H, 1)
  })

  it('laneMode (ref #142): ownTime 重叠簇并排分栏, 两卡各占 1/2 栏宽全部可见', () => {
    const normal = mkCourse({ id: 104, courseName: '常规丁', day: 3, startNode: 1, step: 2 })
    const own = mkCourse({
      id: 103, courseName: '非常规丙', day: 3, startNode: 1, step: 2,
      ownTime: true, isIrregularTime: true, startTime: '08:30', endTime: '09:30',
    })
    const { cardOf, container } = renderCluster('rail', [normal, own])
    const lanesBox = container.querySelector('[data-grid-cluster-lanes]')
    expect(lanesBox).not.toBeNull() // laneMode 分支标记
    const normalEl = cardOf(normal.id)!
    const ownEl = cardOf(own.id)!
    // 分栏后两卡同屏可见: 旧层叠语义下 ownTime 短课 hidden → 真卡收窄/沉底;
    // 新语义两卡各占 laneW = colW/2, x 分别为 0 与 laneW
    const wN = parseFloat(normalEl.style.width)
    const wO = parseFloat(ownEl.style.width)
    expect(wN).toBeCloseTo(wO, 3)
    const xN = parseFloat(normalEl.style.left)
    const xO = parseFloat(ownEl.style.left)
    expect(Math.abs(xN - xO)).toBeCloseTo(wN, 3) // 栏距 = 栏宽 → 恰 2 栏不重叠
  })

  it('纯节点冲突簇不触发 laneMode (无 data-grid-cluster-lanes)', () => {
    const { container } = renderCluster('stack') // shortA + longB 均常规
    expect(container.querySelector('[data-grid-cluster-lanes]')).toBeNull()
  })
})
