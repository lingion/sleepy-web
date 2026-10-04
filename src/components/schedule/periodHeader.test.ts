import { describe, expect, it } from 'vitest'
import {
  normalizePeriodHeaderLayout,
  periodHeaderLabel,
  periodHeaderLines,
  computeAdaptiveFont,
  columnAdaptiveFont,
  estimateHeaderInk,
} from './periodHeader'

describe('adaptive header font (Android 3e4a4dfe parity)', () => {
  it('tall card → capped at 16/14 label/time', () => {
    expect(computeAdaptiveFont(68, 60, 0)).toEqual({ timeSize: 14, labelSize: 16 })
  })
  it('short card shrinks by height (label = height/2.6, time = label-1)', () => {
    const f = computeAdaptiveFont(68, 30, 0)
    expect(f.labelSize).toBeCloseTo(30 / 2.6, 5)
    expect(f.timeSize).toBeCloseTo(30 / 2.6 - 1, 5)
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
