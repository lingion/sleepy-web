import { describe, expect, it } from 'vitest'
import { mergeAutoRows, resolveAutoPeriodConfig } from './periodEditor'
import { DEFAULT_SMART_CONFIG, deriveRows, type SmartPeriodConfig } from './smartPeriod'
import type { TimeSlotRow } from './timeTable'

const row = (node: number, start: string, end: string, edgeClass: TimeSlotRow['edgeClass'] = null): TimeSlotRow => ({ node, start, end, edgeClass })

describe('Android automatic period editor', () => {
  it('retains a matching stored configuration and unused named groups', () => {
    const stored: SmartPeriodConfig = { ...DEFAULT_SMART_CONFIG, totalPeriods: 2, breaks: [{ minutes: 10, isLong: false, label: '操场' }], transitionAssignments: [0], durations: [{ minutes: 60, isLong: true, label: '实验' }] }
    expect(resolveAutoPeriodConfig([row(0, '07:00', '07:30', 'before'), ...deriveRows(stored)], stored)).toBe(stored)
  })

  it('infers duration, continuous lessons and break groups while preserving labels by minutes', () => {
    const previous: SmartPeriodConfig = { ...DEFAULT_SMART_CONFIG, breaks: [{ minutes: 20, isLong: false, label: '课间操' }], durations: [{ minutes: 60, isLong: false, label: '实验课' }] }
    const rows = [row(1, '08:00', '08:45'), row(2, '08:45', '09:45'), row(3, '10:05', '10:50'), row(4, '11:00', '11:45')]
    const config = resolveAutoPeriodConfig(rows, previous)!
    expect(config).toEqual({ startTime: '08:00', periodMinutes: 45, totalPeriods: 4, breaks: [{ minutes: 20, isLong: false, label: '课间操' }, { minutes: 10, isLong: false }], transitionAssignments: [null, 0, 1], durations: [{ minutes: 60, isLong: false, label: '实验课' }], periodAssignments: [null, 0, null, null] })
    expect(deriveRows(config)).toEqual(rows)
  })

  it('uses the first duration when counts tie and labels larger new gaps as long', () => {
    const config = resolveAutoPeriodConfig([row(1, '08:00', '08:50'), row(2, '09:00', '09:40'), row(3, '10:10', '11:00')], null)!
    expect(config.periodMinutes).toBe(50)
    expect(config.breaks).toEqual([{ minutes: 10, isLong: false }, { minutes: 30, isLong: true }])
    const tied = resolveAutoPeriodConfig([row(1, '08:00', '08:50'), row(2, '08:50', '09:30')], null)!
    expect(tied.periodMinutes).toBe(50)
  })

  it.each([
    [], [row(2, '08:00', '08:45')], [row(1, '08:00', '08:45'), row(3, '09:00', '09:45')],
    [row(1, '8:00', '08:45')], [row(1, '08:45', '08:00')],
    [row(1, '08:00', '08:45'), row(2, '08:40', '09:25')],
  ])('does not guess an automatic schedule from invalid rows %j', (...rows) => {
    expect(resolveAutoPeriodConfig(rows as TimeSlotRow[], null)).toBeNull()
  })

  it('keeps manual edge rows in place while growing or shrinking standard rows', () => {
    const before = row(0, '07:00', '07:30', 'before'), after = row(20, '20:00', '20:45', 'after')
    const existing = [before, row(1, '08:00', '08:45'), after, row(2, '09:00', '09:45')]
    const derived = deriveRows({ ...DEFAULT_SMART_CONFIG, totalPeriods: 3 })
    expect(mergeAutoRows(existing, derived)).toEqual([before, derived[0], after, derived[1], derived[2]])
    expect(mergeAutoRows(existing, derived.slice(0, 1))).toEqual([before, derived[0], after])
  })
})
