import { describe, expect, it } from 'vitest'
import { decodeTransfers, effectiveDayOfWeek, withTargetExclusivity } from './transfers'

describe('holiday transfers', () => {
  it('uses mapped target weekday, matching Android HolidayTransferOps', () => {
    expect(effectiveDayOfWeek('2026-05-01', [{ sourceDate: '2026-05-01', targetDate: '2026-05-09', segmentId: 'labour' }])).toBe(6)
  })

  it('keeps targets exclusive and replaces the source entry', () => {
    const existing = [{ sourceDate: '2026-05-01', targetDate: '2026-05-09', segmentId: 'a' }]
    expect(withTargetExclusivity(existing, { sourceDate: '2026-10-01', targetDate: '2026-05-09', segmentId: 'b' })).toEqual([
      { sourceDate: '2026-10-01', targetDate: '2026-05-09', segmentId: 'b' },
    ])
  })

  it('rejects malformed persisted mappings', () => {
    expect(decodeTransfers('[{"sourceDate":"bad","targetDate":"2026-05-09","segmentId":"x"}]')).toEqual([])
  })
})
