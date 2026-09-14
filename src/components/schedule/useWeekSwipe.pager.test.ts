/**
 * useWeekPager 契约测试 — ScheduleScreen.kt HorizontalPager 跟手翻页同构。
 * 锁翻页语义本身: 跟手位移 clamp、半页阈值、fling、边界、轨道连动。红绿验证: 先红后绿。
 */

import { describe, it, expect } from 'vitest'
import {
  pagerOffset,
  pagerTargetWeek,
  pagerTrackWeeks,
  lockDirection,
  wheelTargetWeek,
  WHEEL_PAGE_DELTA_PX,
  WHEEL_COOLDOWN_MS,
  SWIPE_DIRECTION_LOCK_PX,
  SWIPE_PAGE_FRACTION,
  SWIPE_FLING_VELOCITY,
  SWIPE_MAX_THRESHOLD_PX,
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

  it('桌面宽窗阈值封顶 240px — 半页比例不变但绝对距离对齐手机手感', () => {
    // 1280 宽窗口: 纯半页规则要拖 640px (手机只需 ~195px) → 用户反馈"电脑端不好滑"
    // 不变量: 阈值 = min(半页, 240px)。手机页宽 ≤480 → 与 Android 完全同规则
    expect(SWIPE_MAX_THRESHOLD_PX).toBe(240)
    expect(pagerTargetWeek(-300, 0, 1280, 3, 20)).toBe(4) // 300 ≥ 240 → 翻
    expect(pagerTargetWeek(-200, 0, 1280, 3, 20)).toBeNull() // 200 < 240 → 回弹
    expect(pagerTargetWeek(-PAGE * 0.5 - 1, 0, PAGE, 3, 20)).toBe(4) // 手机侧不受封顶影响
  })

  it('fling 速度阈值 = Android snapVelocityThreshold 300px/s (0.3px/ms)', () => {
    expect(SWIPE_FLING_VELOCITY).toBe(0.3)
    // 400px/s 的轻甩: Android 会翻页, 旧 web (0.6) 会回弹 → 必须翻
    expect(pagerTargetWeek(-50, -0.4, PAGE, 3, 20)).toBe(4)
    expect(pagerTargetWeek(50, 0.4, PAGE, 3, 20)).toBe(2)
    // 200px/s 慢甩仍不够 (低于 300px/s)
    expect(pagerTargetWeek(-50, -0.2, PAGE, 3, 20)).toBeNull()
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

describe('lockDirection — 方向锁 (Android gesture arena 横移认领同构)', () => {
  it('未过 slop 不锁 (起步余地)', () => {
    expect(lockDirection(0, 0)).toBe('none')
    expect(lockDirection(3, 0)).toBe('none')
    expect(lockDirection(7, 7)).toBe('none')
  })

  it('横移主轴 → h (pager 独占, 斜拖不再被原生纵滚 pointercancel)', () => {
    expect(lockDirection(10, 2)).toBe('h')
    expect(lockDirection(-40, 12)).toBe('h')
  })

  it('纵移主轴 → v (让位原生滚动); 主轴相等偏 v 保滚动', () => {
    expect(lockDirection(2, 10)).toBe('v')
    expect(lockDirection(30, -60)).toBe('v')
    expect(lockDirection(10, 10)).toBe('v')
  })

  it('slop = 8px (Android touch slop ~8dp 同量级)', () => {
    expect(SWIPE_DIRECTION_LOCK_PX).toBe(8)
  })
})

describe('wheelTargetWeek — 触摸板/滚轮横滚翻页 (桌面 deltaX 通道)', () => {
  it('累计未过 60px 阈值不翻', () => {
    expect(wheelTargetWeek(0, 1, 10)).toBeNull()
    expect(wheelTargetWeek(30, 1, 10)).toBeNull()
    expect(wheelTargetWeek(-59, 5, 10)).toBeNull()
  })

  it('左滚 (deltaX>0) = 下一周; 右滚 = 上一周 (与拖拽同向)', () => {
    expect(wheelTargetWeek(60, 3, 10)).toBe(4)
    expect(wheelTargetWeek(-200, 3, 10)).toBe(2)
  })

  it('边界裁剪: 第 1 周右滚 / 末周左滚不翻', () => {
    expect(wheelTargetWeek(-100, 1, 10)).toBeNull()
    expect(wheelTargetWeek(100, 10, 10)).toBeNull()
  })

  it('阈值/冷却常量锁定 (一次手势一页)', () => {
    expect(WHEEL_PAGE_DELTA_PX).toBe(60)
    expect(WHEEL_COOLDOWN_MS).toBe(350)
  })
})
