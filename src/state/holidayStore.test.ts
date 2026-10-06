/**
 * holidayStore 调休映射 — AppPrefs.getHolidayTransfers / updateHolidayTransfer / clearHolidayTransfers 同构。
 * 锁定: 按表键存储、null 目标清除、互斥写、旧版无后缀键由首读表接管。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearHolidayTransfers, getHolidayTransfers, useHolidayStore } from './holidayStore'

const key = (id: number) => `sleepy_holiday_transfers_${id}`

beforeEach(() => {
  localStorage.clear()
})

describe('holiday transfers per table', () => {
  it('writes to the per-table key and bumps the revision', () => {
    const before = useHolidayStore.getState().transferRevision
    useHolidayStore.getState().updateTransfer(3, '2026-05-01', '2026-05-09', 'labour')
    expect(useHolidayStore.getState().transferRevision).toBe(before + 1)
    expect(JSON.parse(localStorage.getItem(key(3)) ?? '[]')).toEqual([
      { sourceDate: '2026-05-01', targetDate: '2026-05-09', segmentId: 'labour' },
    ])
    expect(getHolidayTransfers(4)).toEqual([])
    expect(localStorage.getItem('sleepy_holiday_transfers')).toBeNull()
  })

  it('null target removes only that source date', () => {
    const { updateTransfer } = useHolidayStore.getState()
    updateTransfer(1, '2026-05-01', '2026-05-09', 'a')
    updateTransfer(1, '2026-05-02', '2026-05-10', 'a')
    updateTransfer(1, '2026-05-01', null, 'a')
    expect(getHolidayTransfers(1)).toEqual([{ sourceDate: '2026-05-02', targetDate: '2026-05-10', segmentId: 'a' }])
  })

  it('keeps target dates exclusive within a table', () => {
    const { updateTransfer } = useHolidayStore.getState()
    updateTransfer(1, '2026-05-01', '2026-05-09', 'a')
    updateTransfer(1, '2026-05-02', '2026-05-09', 'a')
    expect(getHolidayTransfers(1)).toEqual([{ sourceDate: '2026-05-02', targetDate: '2026-05-09', segmentId: 'a' }])
  })

  it('returns empty without a table', () => {
    expect(getHolidayTransfers(null)).toEqual([])
  })

  it('adopts the legacy unsuffixed key into the first table read', () => {
    const legacy = '[{"sourceDate":"2026-10-01","targetDate":"2026-10-11","segmentId":"nd"}]'
    localStorage.setItem('sleepy_holiday_transfers', legacy)
    expect(getHolidayTransfers(7)).toEqual([{ sourceDate: '2026-10-01', targetDate: '2026-10-11', segmentId: 'nd' }])
    expect(localStorage.getItem('sleepy_holiday_transfers')).toBeNull()
    expect(localStorage.getItem(key(7))).toBe(legacy)
    expect(getHolidayTransfers(8)).toEqual([])
  })

  it('prefers an existing table key over the legacy key', () => {
    const own = '[{"sourceDate":"2026-05-01","targetDate":"2026-05-09","segmentId":"own"}]'
    localStorage.setItem(key(2), own)
    localStorage.setItem('sleepy_holiday_transfers', '[{"sourceDate":"2026-10-01","targetDate":"2026-10-11","segmentId":"nd"}]')
    expect(getHolidayTransfers(2).map((e) => e.segmentId)).toEqual(['own'])
    expect(localStorage.getItem('sleepy_holiday_transfers')).toBeNull()
  })

  it('clearHolidayTransfers removes only that table', () => {
    const { updateTransfer } = useHolidayStore.getState()
    updateTransfer(1, '2026-05-01', '2026-05-09', 'a')
    updateTransfer(2, '2026-05-01', '2026-05-09', 'a')
    clearHolidayTransfers(1)
    expect(localStorage.getItem(key(1))).toBeNull()
    expect(getHolidayTransfers(2)).toHaveLength(1)
  })
})
