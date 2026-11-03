/**
 * 平板横屏判定 — SleepyNavHost.kt:484-494 双闸语义锁定:
 * 宽 ≥ 600 (非 Compact) 且 宽 ≥ 高 (非竖屏, 逐帧几何不依赖 orientation 枚举)。
 */

import { describe, it, expect } from 'vitest'
import { isTabletLayout, TABLET_MIN_WIDTH } from './tabletLayout'

describe('isTabletLayout', () => {
  it('手机竖屏 = false', () => {
    expect(isTabletLayout(390, 844)).toBe(false)
  })

  it('大屏手机横屏 (844×390) = true — Android 同构: widthSizeClass 按 dp 宽, 横屏大屏手机同样双栏', () => {
    expect(isTabletLayout(844, 390)).toBe(true)
  })

  it('小屏手机横屏 (宽 < 600) = false — 单闸宽度不够不拆栏', () => {
    expect(isTabletLayout(560, 390)).toBe(false)
  })

  it('平板竖屏 (宽 ≥ 600 但 宽 < 高) = false — 同学报修 2026-10-27: 竖屏不得强分双栏', () => {
    expect(isTabletLayout(800, 1280)).toBe(false)
  })

  it('平板横屏 = true', () => {
    expect(isTabletLayout(1280, 800)).toBe(true)
  })

  it('边界: 宽 = 600 且 宽 ≥ 高 (正方形按横屏) = true', () => {
    expect(isTabletLayout(TABLET_MIN_WIDTH, TABLET_MIN_WIDTH)).toBe(true)
    expect(isTabletLayout(TABLET_MIN_WIDTH - 1, 400)).toBe(false)
  })
})
