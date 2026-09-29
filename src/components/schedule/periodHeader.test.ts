import { describe, expect, it } from 'vitest'
import { normalizePeriodHeaderLayout, periodHeaderLabel, periodHeaderLines } from './periodHeader'

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
