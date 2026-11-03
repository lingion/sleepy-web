/**
 * 平板横屏判定 — SleepyNavHost.kt:484-494 同构 (issue#45 ③横屏/平板)。
 * Android 双闸: !isCompact (widthSizeClass ≥ Medium ≈ 宽 ≥ 600dp)
 *   && !portrait (逐帧真实几何 宽≥高;orientation 枚举在分屏/自由窗口不可靠 → 用几何)。
 * Web 同构: 视口宽 ≥ 600 且 宽 ≥ 高 → Master-Detail 双栏 + NavigationRail。
 */

import { useEffect, useState } from 'react'

/** Material3 WindowWidthSizeClass.Compact 上界 (dp) — <600 为手机形态 */
export const TABLET_MIN_WIDTH = 600

/** 纯函数便于单测: 宽 ≥ 600 且 宽 ≥ 高 (正方形按横屏处理, 与 Android portrait=w<h 一致) */
export function isTabletLayout(width: number, height: number): boolean {
  return width >= TABLET_MIN_WIDTH && width >= height
}

/** 视口监听 — resize 逐帧重判 (分屏拖拽/窗口缩放即时切换形态) */
export function useTabletLayout(): boolean {
  const [tablet, setTablet] = useState(() => isTabletLayout(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const onResize = () => setTablet(isTabletLayout(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return tablet
}
