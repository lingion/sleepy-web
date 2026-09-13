/**
 * useWeekPager 契约测试 — ScheduleScreen.kt HorizontalPager 跟手翻页同构。
 * 锁翻页动画语义本身: 跟手位移 clamp、回弹、翻页落点、边界。红绿验证: 先红后绿。
 */

import { describe, it, expect } from 'vitest'
import {
  pagerOffset,
  pagerTargetWeek,
  SWIPE_THRESHOLD_PX,
} from './useWeekSwipe'

describe('pagerOffset — 滑动跟手位移 (HorizontalPager 页面实时平移同构)', () => {
  it('横向位移 1:1 跟手', () => {
    expect(pagerOffset(-120, 390)).toBe(-120)
  })

  it('边界外继续拖 = 阻尼 1/3 (Android overscroll 同语义)', () => {
    // 第 1 周右拖 (dx>0, 前面无页) → 阻尼
    expect(pagerOffset(90, 390, false, true)).toBe(30)
    // 第 maxWeek 周左拖 (dx<0, 后面无页) → 阻尼
    expect(pagerOffset(-90, 390, true)).toBe(-30)
  })

  it('边界内不满阻尼', () => {
    expect(pagerOffset(-90, 390)).toBe(-90)
    expect(pagerOffset(90, 390, false)).toBe(90)
  })
})

describe('pagerTargetWeek — 松手翻页落点 (阈值 + 速度语义)', () => {
  it('位移超阈值 = 翻页 (方向同 swipeTargetWeek)', () => {
    expect(pagerTargetWeek(-120, 0, 3, 20)).toBe(4)
    expect(pagerTargetWeek(120, 0, 3, 20)).toBe(2)
  })

  it('位移低于阈值 = 回弹原页 (不翻页)', () => {
    expect(pagerTargetWeek(-SWIPE_THRESHOLD_PX + 5, 0, 3, 20)).toBeNull()
    expect(pagerTargetWeek(SWIPE_THRESHOLD_PX - 5, 0, 3, 20)).toBeNull()
  })

  it('快速轻扫 (低位移+高速度) = 翻页 (fling 同语义)', () => {
    expect(pagerTargetWeek(-50, -1.2, 3, 20)).toBe(4)
    expect(pagerTargetWeek(50, 1.2, 3, 20)).toBe(2)
  })

  it('边界 clamp: 第 1 周右拖/第 maxWeek 周左拖 = null', () => {
    expect(pagerTargetWeek(120, 0, 1, 20)).toBeNull()
    expect(pagerTargetWeek(-120, 0, 20, 20)).toBeNull()
  })

  it('边界外 fling 向更外 = null', () => {
    expect(pagerTargetWeek(50, 1.2, 1, 20)).toBeNull()
    expect(pagerTargetWeek(-50, -1.2, 20, 20)).toBeNull()
  })
})
