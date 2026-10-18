import { describe, expect, it } from 'vitest'
import {
  normalizePeriodHeaderLayout,
  periodHeaderLabel,
  periodHeaderLines,
  computeAdaptiveFont,
  columnAdaptiveFont,
  estimateHeaderInk,
  ADAPTIVE_FONT_MIN_LABEL,
  periodHeaderHangingPlacement,
  clampPeriodHeaderHanging,
  legacyDashColumn,
  legacyColumnVerticalFit,
  type LegacyDashRowInk,
} from './periodHeader'

// ---- Android LegacyDashColumnGeometryTest 1:1 (ref #102) ----------------
describe('legacy dash column geometry (Android legacyDashColumnPx parity)', () => {
  const pad = 3
  const rowA: LegacyDashRowInk = { labelPx: 16, timeLeftPx: 30, dashPx: 0, timeRightPx: 30 }
  const rowB: LegacyDashRowInk = { labelPx: 80, timeLeftPx: 20, dashPx: 0, timeRightPx: 45 }
  const rows = [rowA, rowB]

  it('every row dash glyph center falls on the shared axis', () => {
    const g = legacyDashColumn(rows, pad)
    rows.forEach((row, i) => {
      expect(g.placements[i].timeLeft + row.timeLeftPx + row.dashPx / 2).toBeCloseTo(g.dashCenter, 3)
    })
  })

  it('label centers on the shared dash axis', () => {
    const g = legacyDashColumn(rows, pad)
    rows.forEach((row, i) => {
      expect(g.placements[i].labelLeft + row.labelPx / 2).toBeCloseTo(g.dashCenter, 3)
    })
  })

  it('widest row keeps padding margin on both sides', () => {
    const g = legacyDashColumn(rows, pad)
    // 左延伸 = max(80/2, 30, 20) = 40 → 轴 = pad + 40; 右 = max(40, 45) = 45 → 宽 = 91
    expect(g.dashCenter).toBeCloseTo(pad + 40, 3)
    expect(g.columnWidth).toBeCloseTo(40 + 45 + 2 * pad, 3)
    // 「最宽的那一行, 余量也流出来」
    expect(g.placements[1].labelLeft).toBeCloseTo(pad, 3)
    expect(g.dashCenter + rowB.dashPx + rowB.timeRightPx).toBeCloseTo(g.columnWidth - pad, 3)
  })

  it('all ink stays inside the column', () => {
    const g = legacyDashColumn(rows, pad)
    rows.forEach((row, i) => {
      const p = g.placements[i]
      expect(p.labelLeft).toBeGreaterThanOrEqual(-0.001)
      expect(p.timeLeft).toBeGreaterThanOrEqual(-0.001)
      expect(p.labelLeft + row.labelPx).toBeLessThanOrEqual(g.columnWidth + 0.001)
      expect(p.timeLeft + row.timeLeftPx + row.timeRightPx).toBeLessThanOrEqual(g.columnWidth + 0.001)
    })
  })

  it('empty column returns zero geometry', () => {
    const g = legacyDashColumn([], pad)
    expect(g.columnWidth).toBe(0)
    expect(g.placements).toHaveLength(0)
  })

  it('column width accommodates full time string including dash (2026-10-03 翻车回归)', () => {
    const withDash: LegacyDashRowInk[] = [
      { labelPx: 16, timeLeftPx: 30, dashPx: 6, timeRightPx: 30 },
      { labelPx: 60, timeLeftPx: 32, dashPx: 6, timeRightPx: 45 },
    ]
    const g = legacyDashColumn(withDash, pad)
    // 左延伸 = max(30, 33, 30+3, 32+3) = 35; 右 = max(30, 48) = 48 → 宽 = 35+48+6 = 89?
    expect(g.dashCenter).toBeCloseTo(pad + 35, 3)
    expect(g.columnWidth).toBeCloseTo(35 + 48 + 2 * pad, 3)
    withDash.forEach((row, i) => {
      expect(g.placements[i].timeLeft + row.timeLeftPx + row.dashPx / 2).toBeCloseTo(g.dashCenter, 3)
    })
    const p = g.placements[1]
    expect(p.timeLeft + 32 + 6 + 45).toBeLessThanOrEqual(g.columnWidth + 0.001)
  })
})

// ---- Android LegacyDashVerticalFitTest 1:1 (ref #102) -------------------
describe('legacy union-envelope vertical fit (Android legacyColumnVerticalFit parity)', () => {
  const row: LegacyDashRowInk = {
    labelPx: 20, timeLeftPx: 30, dashPx: 6, timeRightPx: 30,
    labelHeightPx: 14, timeHeightPx: 13,
  }

  it('tall card centers the union block', () => {
    const col = legacyColumnVerticalFit([row], 54)
    expect(col.fontScale).toBeCloseTo(1, 3)
    expect(col.labelTop).toBeCloseTo(13.5, 3)
    expect(col.timeTop).toBeCloseTo(13.5 + 14, 3)
  })

  it('short card shrinks both lines by the same factor', () => {
    const col = legacyColumnVerticalFit([row], 20)
    expect(col.fontScale).toBeCloseTo(20 / 27, 2)
    expect(col.labelTop).toBeCloseTo(0, 3)
    expect(col.timeTop).toBeCloseTo(14 * (20 / 27), 3)
  })

  it('column uses the tallest row heights (union = max labelH + max timeH)', () => {
    const rows: LegacyDashRowInk[] = [
      { labelPx: 16, timeLeftPx: 30, dashPx: 6, timeRightPx: 30, labelHeightPx: 14, timeHeightPx: 13 },
      { labelPx: 80, timeLeftPx: 30, dashPx: 6, timeRightPx: 30, labelHeightPx: 14, timeHeightPx: 13 },
    ]
    const exact = legacyColumnVerticalFit(rows, 27)
    expect(exact.fontScale).toBeCloseTo(1, 3)
    expect(exact.labelTop).toBeCloseTo(0, 3)
    const tight = legacyColumnVerticalFit(rows, 20)
    expect(tight.fontScale).toBeCloseTo(20 / 27, 2)
  })

  it('row gap holds when card fits', () => {
    const col = legacyColumnVerticalFit([row], 54, 0.6, 4)
    expect(col.fontScale).toBeCloseTo(1, 3)
    expect(col.labelTop).toBeCloseTo((54 - 27 - 4) / 2, 3)
    expect(col.timeTop).toBeCloseTo(11.5 + 14 + 4, 3)
  })

  it('gap is eaten before text shrinks when card is tight', () => {
    const col = legacyColumnVerticalFit([row], 30, 0.6, 4)
    expect(col.fontScale).toBeCloseTo(1, 3)
    expect(col.labelTop).toBeCloseTo(0, 3)
    expect(col.timeTop).toBeCloseTo(0 + 14 + 3, 3)
  })

  it('gap zeroed and font shrinks when card too short even after gap shrink', () => {
    const col = legacyColumnVerticalFit([row], 20, 0.6, 4)
    expect(col.fontScale).toBeCloseTo(20 / 27, 2)
  })

  it('missing measured heights fall back to width degeneracy', () => {
    // labelH = labelPx = 20, timeH = 30+6+30 = 66 → union 86; 43/86=0.5 但 minScale 0.6 钳底
    const naked: LegacyDashRowInk = { labelPx: 20, timeLeftPx: 30, dashPx: 6, timeRightPx: 30 }
    const col = legacyColumnVerticalFit([naked], 43)
    expect(col.fontScale).toBeCloseTo(0.6, 3)
    expect(legacyColumnVerticalFit([naked], 86).fontScale).toBeCloseTo(1, 3)
  })
})

describe('adaptive header font (Android 3e4a4dfe parity)', () => {
  it('tall card → capped at 16/14 label/time', () => {
    expect(computeAdaptiveFont(68, 60, 0)).toEqual({ timeSize: 14, labelSize: 16 })
  })
  it('short card shrinks by height (label = (height+2.5)/3.75, time = label-1)', () => {
    // 安卓 v1.0.59 定稿: 三行行盒总高 = 3.75×labelSize − 2.5, 精确反比非估算 2.6
    const f = computeAdaptiveFont(68, 30, 0)
    expect(f.labelSize).toBeCloseTo((30 + 2.5) / 3.75, 5)
    expect(f.timeSize).toBeCloseTo((30 + 2.5) / 3.75 - 1, 5)
  })
  it('below MIN_LABEL shrinks proportionally instead of clamping (no vertical overflow)', () => {
    // 卡高装不下 11 时 (heightCap=(cardH+2.5)/3.75 < 11) 按高度继续缩, 硬钳必竖向溢出
    const f = computeAdaptiveFont(68, 26, 0) // cap = 28.5/3.75 = 7.6 < 11
    expect(f.labelSize).toBeCloseTo((26 + 2.5) / 3.75, 5)
    expect(f.labelSize).toBeLessThan(ADAPTIVE_FONT_MIN_LABEL)
  })
  it('three line boxes fit card height exactly at cap', () => {
    // 行盒高 = font × 1.25, 三行 = 2.5×timeSize + 1.25×labelSize = 3.75×labelSize − 2.5 ≤ cardHeight
    const cardHeight = 52
    const f = computeAdaptiveFont(68, cardHeight, 0)
    const total = 2.5 * f.timeSize + 1.25 * f.labelSize
    expect(total).toBeLessThanOrEqual(cardHeight + 1e-9)
  })
  it('ink overflow shrinks proportionally (projected by label/BASE)', () => {
    // cap=23→label16; ink=200→proj=200*16/12=266.7; scale=68/266.7=0.255
    const f = computeAdaptiveFont(68, 60, 200)
    expect(f.labelSize).toBeCloseTo(16 * (68 / (200 * 16 / 12)), 4)
  })
  it('column uses the widest row (hardest to fit)', () => {
    const tight = columnAdaptiveFont(68, 60, [40, 200, 80])
    const loose = columnAdaptiveFont(68, 60, [40, 80])
    expect(tight.labelSize).toBeLessThan(loose.labelSize)
  })
  it('ink estimate grows with text length', () => {
    expect(estimateHeaderInk(['09:35', '1-2节', '09:35'])).toBeGreaterThan(estimateHeaderInk(['8:0', '1', '8:0']))
  })
})

const slot = { label: '1-2', displayStart: '08:00', displayEnd: '09:35' }

describe('period header hanging geometry (Android PeriodHeaderMetrics parity)', () => {
  it('anchors the label to the time block edges at the slider endpoints', () => {
    const left = periodHeaderHangingPlacement(40, 28, -1)
    const center = periodHeaderHangingPlacement(40, 28, 0)
    const right = periodHeaderHangingPlacement(40, 28, 1)

    expect(left).toEqual({ timeLeft: 28, labelLeft: 0, contentWidth: 68 })
    expect(center).toEqual({ timeLeft: 0, labelLeft: 6, contentWidth: 40 })
    expect(right).toEqual({ timeLeft: 0, labelLeft: 40, contentWidth: 68 })
  })

  it('keeps the time block dimensions unchanged while only label placement moves', () => {
    const placements = [-1, 0, 1].map((hanging) => periodHeaderHangingPlacement(40, 28, hanging))
    const labelCenters = placements.map((placement) => placement.labelLeft + 14)
    expect(labelCenters).toEqual([14, 20, 54])
    expect(placements.every((placement) => placement.timeLeft >= 0)).toBe(true)
    expect(placements.every((placement) => placement.timeLeft + 40 <= placement.contentWidth)).toBe(true)
  })

  it('normalizes out-of-range hanging values and treats non-finite widths as zero', () => {
    expect(clampPeriodHeaderHanging(2)).toBe(1)
    expect(clampPeriodHeaderHanging(Number.NaN)).toBe(0)
    expect(periodHeaderHangingPlacement(Number.NaN, -5, 1)).toEqual({
      timeLeft: 0,
      labelLeft: 0,
      contentWidth: 0,
    })
  })
})

describe('period header parity', () => {
  it('keeps the legacy two-line header as the default', () => {
    expect(periodHeaderLines(slot, 'legacy')).toEqual(['1-2节', '08:00-09:35'])
  })

  it('renders the Android three-line order start, label, end', () => {
    expect(periodHeaderLines(slot, 'three_line')).toEqual(['08:00', '1-2节', '09:35'])
  })

  it('formats Android period styles and single-slot show-X', () => {
    expect(periodHeaderLabel(1, 1, 'chinese')).toBe('一')
    expect(periodHeaderLabel(2, 2, 'financial', true)).toBe('第贰节')
    expect(periodHeaderLabel(3, 4, 'roman')).toBe('Ⅲ-Ⅳ')
  })

  it('migrates retired horizontal and vertical values to three_line', () => {
    expect(normalizePeriodHeaderLayout('horizontal')).toBe('three_line')
    expect(normalizePeriodHeaderLayout('vertical')).toBe('three_line')
    expect(normalizePeriodHeaderLayout('unexpected')).toBe('legacy')
  })
})
