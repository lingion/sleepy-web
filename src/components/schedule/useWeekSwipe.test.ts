/**
 * useWeekSwipe 契约测试 — ScheduleScreen.kt HorizontalPager 同构 (主页滑动切换周次)。
 * 锁手势语义本身: 方向→周次、阈值、纵向逃逸、边界 clamp。
 */

import { describe, it, expect } from 'vitest'
import { swipeTargetWeek, SWIPE_THRESHOLD_PX } from './useWeekSwipe'

describe('swipeTargetWeek — 主页滑动切换周次 (HorizontalPager 同构)', () => {
  it('左滑 (dx<0) = 下一周', () => {
    expect(swipeTargetWeek(200, 100, 400, 402, 3, 20)).toBe(4)
  })

  it('右滑 (dx>0) = 上一周', () => {
    expect(swipeTargetWeek(100, 220, 400, 402, 3, 20)).toBe(2)
  })

  it('横向位移低于阈值 = 不翻页', () => {
    expect(swipeTargetWeek(200, 200 - SWIPE_THRESHOLD_PX + 5, 400, 401, 3, 20)).toBeNull()
  })

  it('纵向位移大于横向 = 纵向滚动, 不翻页', () => {
    expect(swipeTargetWeek(200, 100, 400, 550, 3, 20)).toBeNull()
  })

  it('第 1 周右滑 = null (clamp 下界)', () => {
    expect(swipeTargetWeek(100, 220, 400, 402, 1, 20)).toBeNull()
  })

  it('第 maxWeek 周左滑 = null (clamp 上界)', () => {
    expect(swipeTargetWeek(200, 100, 400, 402, 20, 20)).toBeNull()
  })

  it('斜向但横向主导 = 翻页 (Android pager 手势同语义)', () => {
    expect(swipeTargetWeek(200, 100, 400, 430, 5, 20)).toBe(6)
  })
})
