/**
 * HolidayRangeOps 移植层单测 — 对齐 Android HolidayRangeOps 语义:
 * 聚合(连续段) / 合并(sourceKey 挂接替换/删除) / 编解码(坏行跳过) / decideGrey。
 */

import { describe, expect, it } from 'vitest'
import {
  REMOVED,
  TYPE_PUBLIC_HOLIDAY,
  TYPE_TRANSFER_WORKDAY,
  addDaysIso,
  aggregateSegments,
  decodeOverrides,
  decideGrey,
  encodeOverrides,
  isIsoDate,
  isWeekendIso,
  mergeSegments,
  sourceKeyOf,
  toSets,
  type HolidayEntry,
  type HolidayRange,
} from './ranges'

const e = (date: string, name: string, type = TYPE_PUBLIC_HOLIDAY): HolidayEntry => ({ date, name, type })
const r = (
  id: string,
  name: string,
  startDate: string,
  endDate: string,
  type = TYPE_PUBLIC_HOLIDAY,
  sourceKey: string | null = null
): HolidayRange => ({ id, name, startDate, endDate, type, sourceKey })

describe('日期工具', () => {
  it('isIsoDate 拒绝假日期', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-1-1')).toBe(false)
    expect(isIsoDate('2026-02-29')).toBe(false) // 2026 非闰年
    expect(isIsoDate('2024-02-29')).toBe(true)
  })
  it('addDaysIso 跨月跨年', () => {
    expect(addDaysIso('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('isWeekendIso', () => {
    expect(isWeekendIso('2026-01-03')).toBe(true) // 周六
    expect(isWeekendIso('2026-01-04')).toBe(true) // 周日
    expect(isWeekendIso('2026-01-05')).toBe(false)
  })
})

describe('aggregateSegments', () => {
  it('同名同型连续日聚合为一段, 乱序先排序', () => {
    const segs = aggregateSegments([
      e('2026-10-02', '国庆节'),
      e('2026-10-01', '国庆节'),
      e('2026-10-03', '国庆节'),
      e('2026-10-05', '中秋节'),
    ])
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ name: '国庆节', startDate: '2026-10-01', endDate: '2026-10-03' })
    expect(segs[1]).toMatchObject({ name: '中秋节', startDate: '2026-10-05', endDate: '2026-10-05' })
  })
  it('同名不同型不合并', () => {
    const segs = aggregateSegments([e('2026-01-01', '元旦'), e('2026-01-02', '元旦', TYPE_TRANSFER_WORKDAY)])
    expect(segs).toHaveLength(2)
  })
})

describe('mergeSegments', () => {
  const network = [
    e('2026-10-01', '国庆节'),
    e('2026-10-02', '国庆节'),
    e('2026-10-10', '调休上班', TYPE_TRANSFER_WORKDAY),
  ]

  it('无覆盖 = 纯聚合', () => {
    const m = mergeSegments(network, [])
    expect(m.active).toHaveLength(2)
    expect(m.removed).toHaveLength(0)
  })

  it('sourceKey 命中网络段 → 整段替换', () => {
    const ov = r('u1', '我校校庆', '2026-10-01', '2026-10-02', TYPE_PUBLIC_HOLIDAY, 'holiday:2026-10-01')
    const m = mergeSegments(network, [ov])
    expect(m.active).toHaveLength(2)
    expect(m.active.some((s) => s.name === '我校校庆')).toBe(true)
    expect(m.active.some((s) => s.name === '国庆节')).toBe(false)
  })

  it('REMOVED 覆盖 → 段进 removed, 不在 active', () => {
    const ov = r('u1', '国庆节', '2026-10-01', '2026-10-02', REMOVED, 'holiday:2026-10-01')
    const m = mergeSegments(network, [ov])
    expect(m.active.some((s) => s.name === '国庆节')).toBe(false)
    expect(m.removed).toHaveLength(1)
    expect(m.removed[0].id).toBe('u1')
  })

  it('REMOVED 指向不存在网络段 → 不进 removed', () => {
    const ov = r('u1', '幽灵', '2026-12-01', '2026-12-01', REMOVED, 'holiday:2026-12-01')
    const m = mergeSegments(network, [ov])
    expect(m.removed).toHaveLength(0)
  })

  it('同 sourceKey 后到覆盖替换先前用户段', () => {
    const ov1 = r('u1', '第一段', '2026-10-01', '2026-10-02', TYPE_PUBLIC_HOLIDAY, 'holiday:2026-10-01')
    const ov2 = r('u2', '第二段', '2026-10-01', '2026-10-03', TYPE_PUBLIC_HOLIDAY, 'holiday:2026-10-01')
    const m = mergeSegments(network, [ov1, ov2])
    expect(m.active.some((s) => s.id === 'u1')).toBe(false)
    expect(m.active.some((s) => s.id === 'u2')).toBe(true)
  })

  it('纯新增段 (sourceKey=null) 直接进 active', () => {
    const ov = r('u9', '校庆', '2026-05-01', '2026-05-02')
    const m = mergeSegments(network, [ov])
    expect(m.active.some((s) => s.id === 'u9')).toBe(true)
  })
})

describe('toSets', () => {
  it('段展开为逐日集合, 按型分流', () => {
    const { holidays, workdays } = toSets([
      r('a', '节', '2026-05-01', '2026-05-03'),
      r('b', '班', '2026-05-09', '2026-05-10', TYPE_TRANSFER_WORKDAY),
    ])
    expect([...holidays].sort()).toEqual(['2026-05-01', '2026-05-02', '2026-05-03'])
    expect([...workdays].sort()).toEqual(['2026-05-09', '2026-05-10'])
  })
})

describe('decideGrey', () => {
  const holidays = new Set(['2026-10-01'])
  const workdays = new Set(['2026-09-27']) // 周日补班

  it('节假日开关开 → 节假日灰', () => {
    expect(decideGrey('2026-10-01', holidays, workdays, true, true, true)).toBe(true)
    expect(decideGrey('2026-10-01', holidays, workdays, false, true, true)).toBe(false)
  })
  it('周末开关关 → 周末不灰', () => {
    expect(decideGrey('2026-09-26', holidays, workdays, true, false, true)).toBe(false)
  })
  it('补班日: ignoreWorkday 开=不灰, 关=灰', () => {
    expect(decideGrey('2026-09-27', holidays, workdays, false, true, true)).toBe(false)
    expect(decideGrey('2026-09-27', holidays, workdays, false, true, false)).toBe(true)
  })
})

describe('编解码', () => {
  it('encode→decode 往返保真', () => {
    const list = [
      r('u1', '校庆', '2026-05-01', '2026-05-02'),
      r('u2', '删国庆', '2026-10-01', '2026-10-07', REMOVED, 'holiday:2026-10-01'),
    ]
    expect(decodeOverrides(encodeOverrides(list))).toEqual(list)
  })
  it('decode 跳过坏行: 坏日期/倒序/未知类型/坏 JSON', () => {
    const json = JSON.stringify([
      { id: 'ok', name: '好', start: '2026-05-01', end: '2026-05-02', type: TYPE_PUBLIC_HOLIDAY, sourceKey: null },
      { id: 'x1', name: '坏日期', start: '2026-13-01', end: '2026-13-02', type: TYPE_PUBLIC_HOLIDAY },
      { id: 'x2', name: '倒序', start: '2026-05-03', end: '2026-05-01', type: TYPE_PUBLIC_HOLIDAY },
      { id: 'x3', name: '未知型', start: '2026-05-01', end: '2026-05-02', type: 'weird' },
      { name: '无id', start: '2026-05-01', end: '2026-05-02', type: TYPE_PUBLIC_HOLIDAY },
    ])
    const out = decodeOverrides(json)
    expect(out.map((o) => o.id)).toEqual(['ok'])
    expect(decodeOverrides('not json')).toEqual([])
    expect(decodeOverrides('{"not":"array"}')).toEqual([])
  })
})

describe('sourceKeyOf', () => {
  it('型分流', () => {
    expect(sourceKeyOf(TYPE_TRANSFER_WORKDAY, '2026-01-01')).toBe('workday:2026-01-01')
    expect(sourceKeyOf(TYPE_PUBLIC_HOLIDAY, '2026-01-01')).toBe('holiday:2026-01-01')
  })
})
