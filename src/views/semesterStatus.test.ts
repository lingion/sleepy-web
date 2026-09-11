import { describe, it, expect } from 'vitest'
import { semesterStatus } from './TodayView'

describe('semesterStatus — 学期三态', () => {
  it('startDate 空 = IN_RANGE', () => {
    expect(semesterStatus('', 20, new Date())).toBe('IN_RANGE')
    expect(semesterStatus('bad', 20, new Date())).toBe('IN_RANGE')
  })

  it('早于开始日 = BEFORE_START', () => {
    // 2026-03-02 周一起 20 周; 探针 2026-03-01 = 前一天
    expect(semesterStatus('2026-03-02', 20, new Date(2026, 2, 1))).toBe('BEFORE_START')
  })

  it('开始日当天 = IN_RANGE', () => {
    expect(semesterStatus('2026-03-02', 20, new Date(2026, 2, 2))).toBe('IN_RANGE')
  })

  it('结束日次日起 = AFTER_END (20 周 = 140 天)', () => {
    // 最后一天 = start + 139 (第 20 周周日)
    expect(semesterStatus('2026-03-02', 20, new Date(2026, 6, 19))).toBe('IN_RANGE') // +139
    expect(semesterStatus('2026-03-02', 20, new Date(2026, 6, 20))).toBe('AFTER_END') // +140
  })

  it('真实场景: 2026-09 学期中', () => {
    expect(semesterStatus('2026-09-07', 20, new Date(2026, 8, 11))).toBe('IN_RANGE')
  })
})
