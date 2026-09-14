/**
 * useWeekPager 契约测试 — ScheduleScreen.kt HorizontalPager 跟手翻页同构。
 * 锁翻页语义本身: 跟手位移 clamp、半页阈值、fling、边界、轨道连动。红绿验证: 先红后绿。
 */

import { describe, it, expect } from 'vitest'
import {
  pagerOffset,
  pagerTargetWeek,
  pagerTrackWeeks,
  SWIPE_PAGE_FRACTION,
} from './useWeekSwipe'

const PAGE = 390

describe('pagerOffset — 滑动跟手位移 (HorizontalPager 页面实时平移同构)', () => {
  it('横向位移 1:1 跟手', () => {
    expect(pagerOffset(-120, PAGE)).toBe(-120)
  })

  it('边界外继续拖 = 阻尼 1/3 (Android overscroll 同语义)', () => {
    // 第 1 周右拖 (dx>0, 前面无页) → 阻尼
    expect(pagerOffset(90, PAGE, false, true)).toBe(30)
    // 第 maxWeek 周左拖 (dx<0, 后面无页) → 阻尼
    expect(pagerOffset(-90, PAGE, true)).toBe(-30)
  })

  it('边界内不满阻尼', () => {
    expect(pagerOffset(-90, PAGE)).toBe(-90)
    expect(pagerOffset(90, PAGE, false)).toBe(90)
  })

  it('位移不超过一页宽 (轨道只渲染邻接页, 拖过一屏会露出轨道外)', () => {
    expect(pagerOffset(-999, PAGE)).toBe(-PAGE)
    expect(pagerOffset(999, PAGE)).toBe(PAGE)
  })
})

describe('pagerTargetWeek — 松手翻页落点 (半页 positional + fling)', () => {
  it('阈值就是半页宽 (Android 默认 positional threshold 同值)', () => {
    expect(SWIPE_PAGE_FRACTION).toBe(0.5)
  })

  it('拖过半页 = 翻页', () => {
    expect(pagerTargetWeek(-PAGE * 0.5 - 1, 0, PAGE, 3, 20)).toBe(4)
    expect(pagerTargetWeek(PAGE * 0.5 + 1, 0, PAGE, 3, 20)).toBe(2)
  })

  it('差一点没到半页 = 回弹 (旧实现 60px 绝对阈值在宽屏一碰就翻, 已废)', () => {
    // 1000px 宽容器上拖 200px: 旧实现 (60px 绝对阈值) 会翻, 现在必须回弹
    expect(pagerTargetWeek(-200, 0, 1000, 3, 20)).toBeNull()
    expect(pagerTargetWeek(200, 0, 1000, 3, 20)).toBeNull()
  })

  it('快速轻扫 (位移不足但够快) = 翻页 (fling 同语义)', () => {
    expect(pagerTargetWeek(-50, -1.2, PAGE, 3, 20)).toBe(4)
    expect(pagerTargetWeek(50, 1.2, PAGE, 3, 20)).toBe(2)
  })

  it('原地微抖 (够快但几乎没动) = 不翻页', () => {
    expect(pagerTargetWeek(-3, -3, PAGE, 3, 20)).toBeNull()
  })

  it('慢且短 = 回弹', () => {
    expect(pagerTargetWeek(-40, 0.05, PAGE, 3, 20)).toBeNull()
  })

  it('边界 clamp: 第 1 周右拖/第 maxWeek 周左拖 = null', () => {
    expect(pagerTargetWeek(PAGE, 0, PAGE, 1, 20)).toBeNull()
    expect(pagerTargetWeek(-PAGE, 0, PAGE, 20, 20)).toBeNull()
  })

  it('边界外 fling 向更外 = null', () => {
    expect(pagerTargetWeek(50, 1.2, PAGE, 1, 20)).toBeNull()
    expect(pagerTargetWeek(-50, -1.2, PAGE, 20, 20)).toBeNull()
  })

  it('页宽未知 (首帧未测到) = 不翻页, 不误判', () => {
    expect(pagerTargetWeek(-999, -5, 0, 3, 20)).toBeNull()
  })
})

describe('pagerTrackWeeks — 轨道连动渲染的周次 (把两个课表连起来)', () => {
  it('中间周 = 上周|本周|下周 三槽并排', () => {
    expect(pagerTrackWeeks(5, 20)).toEqual([4, 5, 6])
  })

  it('第 1 周无左邻 = 本周|下周', () => {
    expect(pagerTrackWeeks(1, 20)).toEqual([1, 2])
  })

  it('第 maxWeek 周无右邻 = 上周|本周', () => {
    expect(pagerTrackWeeks(20, 20)).toEqual([19, 20])
  })

  it('只有一周 = 单槽, 不可翻', () => {
    expect(pagerTrackWeeks(1, 1)).toEqual([1])
  })

  it('本周恒在中槽, 左右邻周次相邻 → 整条平移时两周一起移动', () => {
    const track = pagerTrackWeeks(5, 20)
    expect(track.indexOf(5)).toBe(1)
    expect(track[0]).toBe(4)
    expect(track[2]).toBe(6)
  })

  it('越界周次被夹进 [1, maxWeek]', () => {
    expect(pagerTrackWeeks(0, 20)).toEqual([1, 2])
    expect(pagerTrackWeeks(99, 20)).toEqual([19, 20])
  })
})
