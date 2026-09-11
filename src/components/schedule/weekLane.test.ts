import { describe, it, expect } from 'vitest'
import { weekLaneFontScale, weekLaneHideSideLabel, WEEK_LANE_SCALE_BASE, WEEK_LANE_SCALE_FLOOR } from './FullWeekView'

describe('weekLaneFontScale — v7.10.4 冲突栏压缩 (纯函数契约)', () => {
  it('laneW ≥ 150 → 1.0 (保现状)', () => {
    expect(weekLaneFontScale(150)).toBe(1)
    expect(weekLaneFontScale(300)).toBe(1)
  })

  it('150 以下线性压缩; 低于下限 clamp 到 0.6', () => {
    expect(weekLaneFontScale(75)).toBe(WEEK_LANE_SCALE_FLOOR) // 0.5 < floor → clamp
    expect(weekLaneFontScale(100)).toBeCloseTo(100 / 150, 5) // 0.667 > floor → 线性
    expect(weekLaneFontScale(120)).toBeCloseTo(0.8, 5)
  })

  it('0.6 封底 (再窄不无限缩)', () => {
    expect(weekLaneFontScale(30)).toBe(WEEK_LANE_SCALE_FLOOR)
    expect(weekLaneFontScale(0)).toBe(WEEK_LANE_SCALE_FLOOR)
  })

  it('基准常量 = 150dp', () => {
    expect(WEEK_LANE_SCALE_BASE).toBe(150)
  })
})

describe('weekLaneHideSideLabel — 极窄 lane 隐藏侧栏', () => {
  it('< 110 → 隐藏; ≥ 110 → 显示', () => {
    expect(weekLaneHideSideLabel(109)).toBe(true)
    expect(weekLaneHideSideLabel(110)).toBe(false)
    expect(weekLaneHideSideLabel(150)).toBe(false)
  })
})
