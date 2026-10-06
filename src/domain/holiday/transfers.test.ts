import { describe, expect, it } from 'vitest'
import { decodeTransfers, effectiveDayOfWeek, encodeTransfers, transferFor, withTargetExclusivity } from './transfers'

describe('holiday transfers', () => {
  it('uses mapped target weekday, matching Android HolidayTransferOps', () => {
    expect(effectiveDayOfWeek('2026-05-01', [{ sourceDate: '2026-05-01', targetDate: '2026-05-09', segmentId: 'labour' }])).toBe(6)
  })

  it('falls back to the natural weekday when unmapped', () => {
    expect(effectiveDayOfWeek('2026-01-02', [{ sourceDate: '2026-01-01', targetDate: '2026-01-04', segmentId: 'a' }])).toBe(5)
  })

  it('keeps targets exclusive and replaces the source entry', () => {
    const existing = [{ sourceDate: '2026-05-01', targetDate: '2026-05-09', segmentId: 'a' }]
    expect(withTargetExclusivity(existing, { sourceDate: '2026-10-01', targetDate: '2026-05-09', segmentId: 'b' })).toEqual([
      { sourceDate: '2026-10-01', targetDate: '2026-05-09', segmentId: 'b' },
    ])
  })

  it('appends when the target is unused and sorts by sourceDate', () => {
    const prior = [{ sourceDate: '2026-01-02', targetDate: '2026-01-05', segmentId: 'a' }]
    const next = { sourceDate: '2026-01-01', targetDate: '2026-01-04', segmentId: 'a' }
    expect(withTargetExclusivity(prior, next)).toEqual([next, prior[0]])
  })

  it('round-trips encode/decode', () => {
    const input = [
      { sourceDate: '2026-01-01', targetDate: '2026-01-04', segmentId: 'seg-y' },
      { sourceDate: '2026-02-15', targetDate: '2026-02-14', segmentId: 'seg-c' },
    ]
    expect(decodeTransfers(encodeTransfers(input))).toEqual(input)
  })

  it('skips invalid rows and keeps the last entry per sourceDate', () => {
    const json = JSON.stringify([
      { sourceDate: '2026-01-03', targetDate: '2026-01-04', segmentId: 'first' },
      { sourceDate: 'bad', targetDate: '2026-01-04', segmentId: 'skip' },
      { sourceDate: '2026-01-02', targetDate: 'not-a-date', segmentId: 'skip' },
      { sourceDate: '2026-01-01', targetDate: '2026-01-04', segmentId: 'a' },
      { sourceDate: '2026-01-03', targetDate: '2026-01-05', segmentId: 'second' },
    ])
    expect(decodeTransfers(json)).toEqual([
      { sourceDate: '2026-01-01', targetDate: '2026-01-04', segmentId: 'a' },
      { sourceDate: '2026-01-03', targetDate: '2026-01-05', segmentId: 'second' },
    ])
  })

  it('returns an empty list for empty or invalid payloads', () => {
    expect(decodeTransfers('')).toEqual([])
    expect(decodeTransfers('not json')).toEqual([])
    expect(decodeTransfers('[]')).toEqual([])
    expect(decodeTransfers('{"sourceDate":"2026-01-01"}')).toEqual([])
  })

  it('finds the entry for a sourceDate', () => {
    const list = [{ sourceDate: '2026-01-01', targetDate: '2026-01-04', segmentId: 'a' }]
    expect(transferFor('2026-01-01', list)?.targetDate).toBe('2026-01-04')
    expect(transferFor('2026-01-03', list)).toBeUndefined()
  })
})
