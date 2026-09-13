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
/** fling 速度阈值 — 位移不足但速度超过它也翻页 (px/ms) */
export const SWIPE_FLING_VELOCITY = 0.6

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
 * Pager 的跟手位移。边界方向使用阻尼，避免内容被拖出屏幕；普通方向 1:1。
 * @param overscrollLeft true = 当前在最后一周且继续左拖
 */
export function pagerOffset(dx: number, _pageWidth: number, overscrollLeft = false, overscrollRight = false): number {
  if (overscrollLeft || overscrollRight) return dx / 3
  return dx
}

/** 松手后的目标周次；速度以 px/ms 计，支持 Android Pager 风格 fling。 */
export function pagerTargetWeek(dx: number, velocityX: number, currentWeek: number, maxWeek: number): number | null {
  const fling = Math.abs(velocityX) >= SWIPE_FLING_VELOCITY
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX && !fling) return null
  if (dx < 0 || velocityX < 0) return currentWeek < maxWeek ? currentWeek + 1 : null
  return currentWeek > 1 ? currentWeek - 1 : null
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

/**
 * useWeekPager — 跟手翻页 hook (HorizontalPager 页面实时平移同构)。
 * touchmove 实时更新位移 → 内容区 transform: translateX 跟手; 松手判定
 * pagerTargetWeek (阈值+fling) → 翻页或回弹。css transition 只在松手后开
 * (跟手期间禁用, 否则位移滞后于手指)。
 *
 * @param onWeekChange 翻页回调 (viewModel.changeWeek 同位)
 * @param maxWeek 总周数 (pageCount)
 * @param week 当前周 (0 = 外部尚未同步; 边界阻尼判定用)
 */
export function useWeekPager(
  onWeekChange: (week: number) => void,
  maxWeek: number,
  week: number
): {
  onTouchStart: (e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => void
  onTouchMove: (e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => void
  onTouchEnd: (e: { changedTouches: ArrayLike<{ clientX: number; clientY: number; timeStamp?: number }> }) => void
  /** 内容区位移 px (负 = 露出下一周, 正 = 露出上一周); transform: translateX 同源 */
  offset: number
  /** 跟手期间 false; 松手后翻页/回弹过渡 true (transition 只在此时开) */
  animating: boolean
} {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const last = useRef<{ x: number; t: number } | null>(null)
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const cbRef = useRef(onWeekChange)
  cbRef.current = onWeekChange
  const maxRef = useRef(maxWeek)
  maxRef.current = maxWeek
  const weekRef = useRef(week)
  weekRef.current = week

  // 外部周次变化 (TopBar 箭头/跳周菜单/切表) → 清位移 (scrollToPage 同位)
  useEffect(() => {
    setOffset(0)
    setAnimating(false)
  }, [week])

  const onTouchStart = useCallback((e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => {
    const t = e.touches[0]
    if (!t) return
    start.current = { x: t.clientX, y: t.clientY, t: performance.now() }
    last.current = { x: t.clientX, t: performance.now() }
    setAnimating(false)
  }, [])

  const onTouchMove = useCallback((e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => {
    const s = start.current
    const t = e.touches[0]
    if (!s || !t) return
    last.current = { x: t.clientX, t: performance.now() }
    const dx = t.clientX - s.x
    const atLeftEdge = weekRef.current >= maxRef.current && dx < 0
    const atRightEdge = weekRef.current <= 1 && dx > 0
    setOffset(pagerOffset(dx, 0, atLeftEdge, atRightEdge))
  }, [])

  const onTouchEnd = useCallback((e: { changedTouches: ArrayLike<{ clientX: number; clientY: number; timeStamp?: number }> }) => {
    const s = start.current
    start.current = null
    if (!s) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - s.x
    const l = last.current
    const et = t.timeStamp ?? performance.now()
    const velocity = l && et !== l.t ? (t.clientX - l.x) / Math.max(1, et - l.t) : 0
    const next = pagerTargetWeek(dx, velocity, weekRef.current, maxRef.current)
    if (next !== null) {
      cbRef.current(next)
      // week 变化的 effect 清位移; 若下周次与本周相同 (边界外 fling), 回弹
      setAnimating(true)
      setOffset(0)
    } else {
      // 回弹原页
      setAnimating(true)
      setOffset(0)
    }
  }, [])

  return { onTouchStart, onTouchMove, onTouchEnd, offset, animating }
}
