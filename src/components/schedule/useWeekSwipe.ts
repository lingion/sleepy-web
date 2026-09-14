/**
 * useWeekSwipe / useWeekPager — 主页左右滑动切换周次 + 跟手翻页动画
 * (ScheduleScreen.kt HorizontalPager 同构)。
 * Android: pagerState pageCount=maxWeek, 手势→changeWeek, 双向同步 syncingFromState
 * 防打架 (Realme OS 闪烁事故); 页面实时平移 (跟手) + 松手翻页/回弹过渡。
 * Web: 原生 touch 事件 + 阈值判定, 无第三方库。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** 滑动判定阈值 — 超过它视为翻页手势 (px) */
export const SWIPE_THRESHOLD_PX = 60
/** 边缘逃逸阈值 — 起点/终点距容器边小于它视为系统手势 (如 iOS 返回), 忽略 (px) */
export const SWIPE_EDGE_ESCAPE_PX = 24
/**
 * fling 速度阈值 — 位移不足但速度超过它也翻页 (px/ms)。
 * = Android PagerDefaults.snapVelocityThreshold 300 px/s (字节码/源码同值),
 * 旧值 0.6 px/ms 比安卓严一倍, 鼠标轻甩安卓能翻、web 回弹 = "电脑端不好滑"之一。
 */
export const SWIPE_FLING_VELOCITY = 0.3
/**
 * 翻页位移阈值 — 页宽的比例。Android HorizontalPager 默认 fling 的 positional
 * threshold 就是半页 (拖过 1/2 页宽才落下一页), 用绝对 px 在宽屏上会一碰就翻 (丑)。
 */
export const SWIPE_PAGE_FRACTION = 0.5
/**
 * 位移阈值绝对上限 (px) — 不变量: 阈值 = min(半页, 240px)。
 * 半页是比例规则, 但页宽随窗口涨: 安卓页宽恒 ~400dp (拖 200dp 翻页), 桌面浏览器
 * 页宽 = 整个窗口 (1280px → 要拖 640px, 三倍距离 = "电脑端不好滑"主因)。
 * 手机页宽 ≤480px 时封顶不生效 → 与 Android 逐位同规则; 宽窗时封顶回手机力度。
 */
export const SWIPE_MAX_THRESHOLD_PX = 240
/** fling 最小位移 — 低于它不认速度, 防原地微抖误翻页 (px) */
export const SWIPE_FLING_MIN_PX = 16
/**
 * 方向锁判定斜率阈值 (px) — Android HorizontalPager 在 gesture arena 里
 * 过 touch slop (~8dp) 后按主轴方向认领手势的同构: 横移意图一旦确立,
 * pager 独占该手势 (preventDefault 阻止浏览器起原生纵滚 → 不再 pointercancel
 * 杀死翻页 = 用户反馈"周视图难滑"的根因); 纵移意图则让位给原生滚动。
 */
export const SWIPE_DIRECTION_LOCK_PX = 8
/** 松手落定动画时长 ms (Android pager snap 量级) */
export const PAGER_SETTLE_MS = 260

export interface SwipeHandlers {
  onTouchStart: (e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => void
  onTouchEnd: (e: { changedTouches: ArrayLike<{ clientX: number; clientY: number }> }) => void
  /** 外部周次变化同步进 hook (Android scrollToPage 同位, 防双向同步打架) */
  __setWeek: (w: number) => void
}

/**
 * 滑动→周次切换纯逻辑 (可测): dx<0 (左滑) → 下一周; dx>0 (右滑) → 上一周。
 * clamp 1..maxWeek; 纵向位移 > 横向 → 纵向滚动, 不翻页。
 */
/**
 * Pager 的跟手位移。边界方向使用阻尼，避免内容被拖出屏幕；普通方向 1:1，
 * 但绝对值不超过一页宽 (轨道只渲染邻接页, 拖过一屏会露出轨道外)。
 * @param overscrollLeft true = 当前在最后一周且继续左拖
 */
export function pagerOffset(dx: number, pageWidth: number, overscrollLeft = false, overscrollRight = false): number {
  if (overscrollLeft || overscrollRight) return dx / 3
  if (pageWidth <= 0) return dx
  return Math.max(-pageWidth, Math.min(pageWidth, dx))
}

/**
 * 松手后的目标周次 — Android HorizontalPager 默认 snap 语义:
 * 拖过半页 (positional) 或 快速甩动 (fling) 才落页, 否则回弹。
 * 阈值按页宽比例, 不用绝对 px (宽屏一碰就翻 = 用户反馈的"太丑")。
 */
export function pagerTargetWeek(
  dx: number,
  velocityX: number,
  pageWidth: number,
  currentWeek: number,
  maxWeek: number
): number | null {
  if (pageWidth <= 0) return null
  const threshold = Math.min(pageWidth * SWIPE_PAGE_FRACTION, SWIPE_MAX_THRESHOLD_PX)
  const positional = Math.abs(dx) >= threshold
  const fling = Math.abs(velocityX) >= SWIPE_FLING_VELOCITY && Math.abs(dx) >= SWIPE_FLING_MIN_PX
  if (!positional && !fling) return null
  // 方向以位移为准; 近零位移的纯 fling 才取速度方向
  const dir = Math.abs(dx) >= 1 ? Math.sign(dx) : Math.sign(velocityX)
  if (dir < 0) return currentWeek < maxWeek ? currentWeek + 1 : null
  if (dir > 0) return currentWeek > 1 ? currentWeek - 1 : null
  return null
}

/**
 * 轨道渲染的周次序列 — 邻接周一起渲染, 三页同宽并排, 整条轨道平移 →
 * 相邻两周视觉上"连起来"一起移动 (HorizontalPager pageCount 同语义)。
 * 边界裁剪: 第 1 周无左邻, 第 maxWeek 周无右邻。
 */
export function pagerTrackWeeks(week: number, maxWeek: number): number[] {
  const clamped = Math.max(1, Math.min(maxWeek, week))
  const weeks: number[] = []
  if (clamped > 1) weeks.push(clamped - 1)
  weeks.push(clamped)
  if (clamped < maxWeek) weeks.push(clamped + 1)
  return weeks
}

/** 手势方向: 'h' = 横滑翻页归 pager, 'v' = 纵滑归原生滚动, 'none' = 未过 slop 未定 */
export type DragLock = 'none' | 'h' | 'v'

/**
 * 方向锁判定 (纯函数可测) — 位移过 slop 后按主轴定归属;
 * 未过 slop 返回 'none' (不锁, 给手指起步留余地); 主轴相等偏 'v' (保滚动)。
 */
export function lockDirection(dx: number, dy: number): DragLock {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_DIRECTION_LOCK_PX) return 'none'
  return Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
}

export function swipeTargetWeek(
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  currentWeek: number,
  maxWeek: number
): number | null {
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dy) > Math.abs(dx)) return null
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return null
  if (dx < 0) {
    // 左滑 = 下一周 (Android pager currentPage+1 同向)
    return currentWeek < maxWeek ? currentWeek + 1 : null
  }
  return currentWeek > 1 ? currentWeek - 1 : null
}

/**
 * 周次滑动 hook — 绑定到课表主区域。
 * @param onWeekChange 周次变化回调 (ScheduleScreen viewModel.changeWeek 同位)
 */
export function useWeekSwipe(onWeekChange: (week: number) => void, maxWeek: number): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null)
  const cbRef = useRef(onWeekChange)
  cbRef.current = onWeekChange
  const maxRef = useRef(maxWeek)
  maxRef.current = maxWeek

  const onTouchStart = useCallback((e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => {
    const t = e.touches[0]
    if (!t) return
    start.current = { x: t.clientX, y: t.clientY }
  }, [])

  const onTouchEnd = useCallback((e: { changedTouches: ArrayLike<{ clientX: number; clientY: number }> }) => {
    const s = start.current
    start.current = null
    if (!s) return
    const t = e.changedTouches[0]
    if (!t) return
    const next = swipeTargetWeek(s.x, t.clientX, s.y, t.clientY, currentWeekRef.current, maxRef.current)
    if (next !== null) cbRef.current(next)
  }, [])

  // currentWeek 走 ref 避免闭包陈旧 (回调重建不触发 handler 重建)
  const currentWeekRef = useRef(1)
  const setWeek = useCallback((w: number) => {
    currentWeekRef.current = w
  }, [])

  return { onTouchStart, onTouchEnd, __setWeek: setWeek }
}

/** pointer 事件最小形状 (单测可用纯对象构造, 不依赖 jsdom 事件类) */
interface PointerLike {
  pointerId: number
  clientX: number
  clientY: number
}

export interface WeekPagerHandlers {
  onPointerDown: (e: PointerLike) => void
  onPointerMove: (e: PointerLike) => void
  onPointerUp: (e: PointerLike) => void
  onPointerCancel: () => void
}

/**
 * useWeekPager — 连动翻页 hook (ScheduleScreen.kt HorizontalPager 同构)。
 *
 * 与旧实现的关键差别: 轨道同时渲染 [上周|本周|下周] 三页并排, 整条轨道平移 →
 * 相邻两周视觉上连成一体一起移动 (旧实现只平移当前页, 拖出来是空白)。
 * 松手按 pagerTargetWeek (半页 positional / fling) 判定 → 落定动画滑到邻页槽位,
 * 动画结束才提交周次 → 轨道以新周重新居中 (视觉无跳变)。
 * 外部改周 (TopBar 箭头/跳周菜单/切表) → 立即归零无动画 (Android scrollToPage 同位)。
 *
 * @param onWeekChange 翻页提交回调 (viewModel.changeWeek 同位)
 * @param maxWeek 总周数 (pageCount)
 * @param week 当前周
 * @param pageWidth 单页宽 px = 滚动容器 clientWidth (阈值与落定位移都按它算)
 */
export function useWeekPager(
  onWeekChange: (week: number) => void,
  maxWeek: number,
  week: number,
  pageWidth: number
): WeekPagerHandlers & {
  /** 挂到滚动容器: 原生 touchmove preventDefault 通道 (方向锁 'h' 时阻止浏览器抢手势) */
  attachPager: (el: HTMLElement | null) => void
  /** 轨道位移 px (负 = 露出下一周, 正 = 露出上一周); 与基准百分比叠加 */
  offset: number
  /** 跟手期间 false; 松手落定/回弹过渡 true (transition 只在此时开) */
  settling: boolean
} {
  const start = useRef<{ x: number; y: number } | null>(null)
  const last = useRef<{ x: number; t: number } | null>(null)
  const lock = useRef<DragLock>('none')
  const settleTimer = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(false)
  const cbRef = useRef(onWeekChange)
  cbRef.current = onWeekChange
  const maxRef = useRef(maxWeek)
  maxRef.current = maxWeek
  const weekRef = useRef(week)
  weekRef.current = week
  const widthRef = useRef(pageWidth)
  widthRef.current = pageWidth

  const clearSettle = useCallback(() => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
  }, [])

  // 外部周次变化 (TopBar 箭头/跳周菜单/切表, 以及本 hook 落定后的提交) →
  // 轨道无动画归零重新居中 = Android scrollToPage (非 animateScrollToPage)。
  useEffect(() => {
    clearSettle()
    setSettling(false)
    setOffset(0)
  }, [week, clearSettle])

  useEffect(() => clearSettle, [clearSettle])

  const onPointerDown = useCallback((e: PointerLike) => {
    clearSettle()
    start.current = { x: e.clientX, y: e.clientY }
    last.current = { x: e.clientX, t: performance.now() }
    lock.current = 'none'
    // 落定动画中途再次按住 → 立刻接管, 不留 transition (否则动画跟手指打架)
    setSettling(false)
  }, [clearSettle])

  const onPointerMove = useCallback((e: PointerLike) => {
    const s = start.current
    if (!s) return
    last.current = { x: e.clientX, t: performance.now() }
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    // 方向锁 (Android gesture arena 同构): 过 slop 按主轴定归属一次, 之后不换手。
    // 'v' → 完全让位原生纵滚 (不跟手, 避免斜拖时轨道横抖);
    // 'h' → pager 独占, 配套 attachPager 的 touchmove preventDefault 防浏览器抢。
    if (lock.current === 'none') lock.current = lockDirection(dx, dy)
    if (lock.current === 'v') return
    const atLastWeek = weekRef.current >= maxRef.current && dx < 0
    const atFirstWeek = weekRef.current <= 1 && dx > 0
    setOffset(pagerOffset(dx, widthRef.current, atLastWeek, atFirstWeek))
  }, [])

  const finish = useCallback((e: PointerLike) => {
    const s = start.current
    start.current = null
    lock.current = 'none'
    if (!s) return
    const dx = e.clientX - s.x
    const l = last.current
    const now = performance.now()
    const velocity = l && now !== l.t ? (e.clientX - l.x) / Math.max(1, now - l.t) : 0
    const next = pagerTargetWeek(dx, velocity, widthRef.current, weekRef.current, maxRef.current)
    setSettling(true)
    if (next !== null && widthRef.current > 0) {
      // 先滑到邻页槽位, 落定动画结束才提交周次 → 轨道重居中时画面正好接上
      setOffset(next > weekRef.current ? -widthRef.current : widthRef.current)
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null
        cbRef.current(next)
      }, PAGER_SETTLE_MS)
    } else {
      // 未过阈值 → 回弹原页
      setOffset(0)
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null
        setSettling(false)
      }, PAGER_SETTLE_MS)
    }
  }, [clearSettle])

  const onPointerCancel = useCallback(() => {
    start.current = null
    lock.current = 'none'
    clearSettle()
    setSettling(true)
    setOffset(0)
  }, [clearSettle])

  // 原生 touchmove (passive:false) — React 合成 touch 事件是 passive 的, 无法
  // preventDefault; 方向锁 'h' 确立后阻止浏览器起原生滚动, 否则 touch-action:pan-y
  // 下任何纵向分量都会 pointercancel 杀死翻页 (周视图"难滑"根因)。
  const onTouchMoveNative = useCallback((e: TouchEvent) => {
    if (lock.current === 'h' && start.current) e.preventDefault()
  }, [])
  const pagerEl = useRef<HTMLElement | null>(null)
  const attachPager = useCallback((el: HTMLElement | null) => {
    if (pagerEl.current === el) return
    pagerEl.current?.removeEventListener('touchmove', onTouchMoveNative)
    pagerEl.current = el
    el?.addEventListener('touchmove', onTouchMoveNative, { passive: false })
  }, [onTouchMoveNative])
  useEffect(() => () => attachPager(null), [attachPager])

  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel, attachPager, offset, settling }
}
