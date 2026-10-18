import { describe, expect, it } from 'vitest'
import { applyDaySwap, decodeTransfers, effectiveDayOfWeek, encodeTransfers, transferFor, withTargetExclusivity } from './transfers'

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

  // ---- applyDaySwap (HolidayTransferOps.kt da553ed6 1:1, ref #145) ----
  // 调休语义 = 「源日课挪到补班日, 补班日原课让位」。修复前 web/安卓都只搬不删,
  // 补班日那列与调过去的课叠加显示。安卓 4 例数值原样移植 (day: 1=周一…7=周日)。

  type SwapCourse = { id: number; day: number; courseName: string }
  const c = (id: number, day: number, courseName = '课'): SwapCourse => ({ id, day, courseName })

  it('applyDaySwap: 来源课改写到目标日, 目标日原课被屏蔽', () => {
    const out = applyDaySwap([c(1, 3, '周三课'), c(2, 6, '周六课')], new Map([[3, 6]]))
    expect(out.find((x) => x.id === 1)!.day).toBe(6)
    expect(out.find((x) => x.id === 1)!.courseName).toBe('周三课')
    expect(out.find((x) => x.id === 2)).toBeUndefined()
  })

  it('applyDaySwap: 空 daySwap 原样返回', () => {
    const courses = [c(1, 3), c(2, 6)]
    expect(applyDaySwap(courses, new Map())).toBe(courses)
  })

  it('applyDaySwap: 多重映射各源课进各自目标, 各目标原课屏蔽', () => {
    // 周三(3)→周六(6), 周日(7)→周四(4)
    const out = applyDaySwap(
      [c(1, 3, '周三'), c(2, 6, '周六原'), c(3, 7, '周日'), c(4, 4, '周四原')],
      new Map([[3, 6], [7, 4]]),
    )
    const byId = new Map(out.map((x) => [x.id, x]))
    expect(byId.get(1)?.day).toBe(6)
    expect(byId.get(2)).toBeUndefined()
    expect(byId.get(3)?.day).toBe(4)
    expect(byId.get(4)).toBeUndefined()
  })

  it('applyDaySwap: 未映射天课程不动', () => {
    const out = applyDaySwap([c(1, 1, '周一'), c(2, 3, '周三调走'), c(3, 6, '周六被屏蔽')], new Map([[3, 6]]))
    const byId = new Map(out.map((x) => [x.id, x]))
    expect(byId.get(1)!.day).toBe(1)
    expect(byId.get(2)!.day).toBe(6)
    expect(byId.get(3)).toBeUndefined()
  })

  it('applyDaySwap: 双向映射日 (既是源又是目标) 不被误屏蔽, 单趟改写', () => {
    // 3→6 且 6→4: 6 日课在 keys 中 → 不屏蔽, 改写到 4; 3 日课改写到 6。安卓单趟语义。
    const out = applyDaySwap([c(1, 3, '周三'), c(2, 6, '周六')], new Map([[3, 6], [6, 4]]))
    expect(out.find((x) => x.id === 1)?.day).toBe(6)
    expect(out.find((x) => x.id === 2)?.day).toBe(4)
  })
})
