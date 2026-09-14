import { describe, expect, it } from 'vitest'
import {
  breakDisplayLabel,
  decodeSmartConfig,
  DEFAULT_SMART_CONFIG,
  deriveRows,
  effectiveAssignments,
  effectiveTransitionMinutes,
  encodeSmartConfig,
  inferSmartConfig,
} from './smartPeriod'

describe('effectiveAssignments', () => {
  it('长度对齐 N-1, 越界索引置 null, 缺位补 null', () => {
    const cfg = { ...DEFAULT_SMART_CONFIG, totalPeriods: 4, breaks: [{ minutes: 10, isLong: false }], transitionAssignments: [0, 5] }
    expect(effectiveAssignments(cfg)).toEqual([0, null, null])
  })
  it('N=1 返回空', () => {
    expect(effectiveAssignments({ ...DEFAULT_SMART_CONFIG, totalPeriods: 1 })).toEqual([])
  })
})

describe('effectiveTransitionMinutes', () => {
  it('null=0, 选中=对应 break 分钟', () => {
    const cfg = {
      ...DEFAULT_SMART_CONFIG,
      totalPeriods: 4,
      breaks: [{ minutes: 10, isLong: false }, { minutes: 30, isLong: true }],
      transitionAssignments: [0, null, 1],
    }
    expect(effectiveTransitionMinutes(cfg)).toEqual([10, 0, 30])
  })
})

describe('deriveRows', () => {
  it('无 break: 每节 45 分钟连续', () => {
    const cfg = { ...DEFAULT_SMART_CONFIG, startTime: '08:00', periodMinutes: 45, totalPeriods: 3, breaks: [] }
    expect(deriveRows(cfg)).toEqual([
      { node: 1, start: '08:00', end: '08:45', edgeClass: null },
      { node: 2, start: '08:45', end: '09:30', edgeClass: null },
      { node: 3, start: '09:30', end: '10:15', edgeClass: null },
    ])
  })
  it('transition 插入 break 分钟', () => {
    const cfg = {
      ...DEFAULT_SMART_CONFIG,
      startTime: '08:00',
      periodMinutes: 40,
      totalPeriods: 3,
      breaks: [{ minutes: 20, isLong: true }],
      transitionAssignments: [0, null],
    }
    expect(deriveRows(cfg)).toEqual([
      { node: 1, start: '08:00', end: '08:40', edgeClass: null },
      { node: 2, start: '09:00', end: '09:40', edgeClass: null },
      { node: 3, start: '09:40', end: '10:20', edgeClass: null },
    ])
  })
  it('跨小时进位正确', () => {
    const cfg = { ...DEFAULT_SMART_CONFIG, startTime: '08:50', periodMinutes: 30, totalPeriods: 2 }
    expect(deriveRows(cfg).map((r) => `${r.start}-${r.end}`)).toEqual(['08:50-09:20', '09:20-09:50'])
  })
})

describe('breakDisplayLabel', () => {
  it('默认前缀+分钟', () => {
    expect(breakDisplayLabel({ minutes: 10, isLong: false })).toBe('小课间 10 分钟')
    expect(breakDisplayLabel({ minutes: 30, isLong: true })).toBe('大课间 30 分钟')
  })
  it('自定义名优先', () => {
    expect(breakDisplayLabel({ minutes: 10, isLong: false, label: '眼保健操' })).toBe('眼保健操')
  })
})

describe('inferSmartConfig', () => {
  it('从节次行推断节数与首节时间', () => {
    const cfg = inferSmartConfig([
      { node: 1, start: '08:30', end: '09:15', edgeClass: null },
      { node: 2, start: '09:25', end: '10:10', edgeClass: null },
    ])
    expect(cfg.totalPeriods).toBe(2)
    expect(cfg.startTime).toBe('08:30')
  })
  it('空表回退默认', () => {
    expect(inferSmartConfig([]).startTime).toBe('08:00')
  })
})

describe('encode/decode', () => {
  it('往返一致', () => {
    const cfg = {
      startTime: '07:40',
      periodMinutes: 40,
      totalPeriods: 8,
      breaks: [{ minutes: 10, isLong: false, label: null }],
      transitionAssignments: [0, null, null, 0],
    }
    expect(decodeSmartConfig(encodeSmartConfig(cfg))).toEqual(cfg)
  })
  it('空/坏 JSON 返回 null', () => {
    expect(decodeSmartConfig('')).toBeNull()
    expect(decodeSmartConfig('not json')).toBeNull()
  })
  it('部分字段缺失回退默认', () => {
    const cfg = decodeSmartConfig('{"startTime":"09:00"}')
    expect(cfg?.startTime).toBe('09:00')
    expect(cfg?.periodMinutes).toBe(45)
    expect(cfg?.totalPeriods).toBe(12)
  })
})
