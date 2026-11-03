import { describe, expect, it } from 'vitest'
import {
  findConflictForSlot,
  isPeriodTableValid,
  parsePeriodClock,
  validatePeriodRows,
  validateTimeJson,
} from './periodValidation'

// ref sleepy#289 — Android TimeTableUtils PeriodValidationResult 语义 1:1

describe('parsePeriodClock', () => {
  it('accepts zero-padded HH:mm and rejects everything else', () => {
    expect(parsePeriodClock('08:00')).toBe(480)
    expect(parsePeriodClock(' 23:59 ')).toBe(23 * 60 + 59)
    expect(parsePeriodClock('8:00')).toBeNull()
    expect(parsePeriodClock('24:00')).toBeNull()
    expect(parsePeriodClock('12:60')).toBeNull()
    expect(parsePeriodClock('')).toBeNull()
  })
})

describe('validatePeriodRows', () => {
  it('valid schedule passes', () => {
    expect(
      validatePeriodRows([
        { node: 1, start: '08:00', end: '08:45' },
        { node: 2, start: '08:55', end: '09:40' },
      ]).kind
    ).toBe('valid')
  })

  it('empty list is rejected', () => {
    expect(validatePeriodRows([]).kind).toBe('empty')
  })

  it('duplicate node wins over format check on same node', () => {
    const r = validatePeriodRows([
      { node: 1, start: '08:00', end: '08:45' },
      { node: 1, start: 'bad', end: 'x' },
    ])
    expect(r.kind).toBe('duplicateNode')
    if (r.kind === 'duplicateNode') expect(r.node).toBe(1)
  })

  it('invalid format reports node', () => {
    const r = validatePeriodRows([
      { node: 1, start: '08:00', end: '08:45' },
      { node: 2, start: '9:00', end: '09:40' },
    ])
    expect(r.kind).toBe('invalidFormat')
  })

  it('end equal to start is endBeforeStart', () => {
    expect(validatePeriodRows([{ node: 1, start: '08:00', end: '08:00' }]).kind).toBe('endBeforeStart')
  })

  it('overlap detected by node order, not array order', () => {
    const r = validatePeriodRows([
      { node: 2, start: '08:30', end: '09:40' },
      { node: 1, start: '08:00', end: '08:45' },
    ])
    expect(r.kind).toBe('overlap')
    if (r.kind === 'overlap') {
      expect(r.prevNode).toBe(1)
      expect(r.nextNode).toBe(2)
    }
  })

  it('adjacent periods touching exactly are valid', () => {
    expect(
      validatePeriodRows([
        { node: 1, start: '08:00', end: '08:45' },
        { node: 2, start: '08:45', end: '09:30' },
      ]).kind
    ).toBe('valid')
  })
})

describe('validateTimeJson', () => {
  it('blank json is empty, unparseable is invalidData', () => {
    expect(validateTimeJson('  ').kind).toBe('empty')
    expect(validateTimeJson('not json').kind).toBe('invalidData')
    expect(validateTimeJson('{"node":1}').kind).toBe('invalidData')
    expect(validateTimeJson('[1,2]').kind).toBe('invalidData')
  })

  it('missing node key falls back to index+1 (legacy format)', () => {
    expect(isPeriodTableValid('[{"start":"08:00","end":"08:45"}]')).toBe(true)
  })

  it('non-integer node or non-string clock is invalidData', () => {
    expect(validateTimeJson('[{"node":"1.5","start":"08:00","end":"08:45"}]').kind).toBe('invalidData')
    expect(validateTimeJson('[{"node":1,"start":480,"end":"08:45"}]').kind).toBe('invalidData')
  })

  it('delegates row semantics', () => {
    expect(validateTimeJson('[{"node":1,"start":"08:00","end":"07:00"}]').kind).toBe('endBeforeStart')
  })
})

describe('findConflictForSlot', () => {
  const rows = [
    { node: 1, start: '08:00', end: '08:45' },
    { node: 2, start: '09:00', end: '09:45' },
    { node: 3, start: '', end: '' },
  ]

  it('returns null for unknown node or fully blank target', () => {
    expect(findConflictForSlot(rows, 9)).toBeNull()
    expect(findConflictForSlot(rows, 3)).toBeNull()
  })

  it('clean slot passes', () => {
    expect(findConflictForSlot(rows, 2)).toBeNull()
  })

  it('detects overlap with previous and next neighbours', () => {
    const prevHit = findConflictForSlot([{ node: 1, start: '08:00', end: '08:45' }, { node: 2, start: '08:30', end: '09:00' }], 2)
    expect(prevHit?.kind).toBe('overlap')
    const nextHit = findConflictForSlot([{ node: 1, start: '08:00', end: '08:45' }, { node: 2, start: '09:00', end: '09:10' }, { node: 3, start: '09:05', end: '10:00' }], 2)
    expect(nextHit?.kind).toBe('overlap')
  })

  it('blank neighbours are exempt', () => {
    expect(findConflictForSlot([{ node: 1, start: '', end: '' }, { node: 2, start: '08:00', end: '08:45' }], 2)).toBeNull()
  })

  it('duplicate node on target is reported', () => {
    const dup = [
      { node: 1, start: '08:00', end: '08:45' },
      { node: 1, start: '10:00', end: '10:45' },
    ]
    expect(findConflictForSlot(dup, 1)?.kind).toBe('duplicateNode')
  })
})