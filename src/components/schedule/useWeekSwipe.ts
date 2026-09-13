/**
 * useWeekSwipe — 主页左右滑动切换周次 (ScheduleScreen.kt HorizontalPager 同构)。
 * Android: pagerState pageCount=maxWeek, 手势→changeWeek, 双向同步 syncingFromState
 * 防打架 (Realme OS 闪烁事故)。Web: 原生 touch 事件 + 阈值判定, 无第三方库。
 */

import { useCallback, useRef } from 'react'

/** 滑动判定阈值 — 超过它视为翻页手势 (px) */
export const SWIPE_THRESHOLD_PX = 60
/** 边缘逃逸阈值 — 起点/终点距容器边小于它视为系统手势 (如 iOS 返回), 忽略 (px) */
export const SWIPE_EDGE_ESCAPE_PX = 24

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
