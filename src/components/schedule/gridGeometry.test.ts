import { describe, it, expect } from 'vitest'
import { buildGridGeometry, yOfRows, slotIndexOf, singleCardGeom, GRID } from './gridGeometry'
import { DEFAULT_TIME_JSON } from '../../domain/timeTable'
import type { Course } from '../../data/types'

function mkCourse(partial: Partial<Course>): Course {
  return {
    id: 1,
    groupId: 'g1',
    tableId: 1,
    courseName: '课',
    teacher: 'T',
    room: 'R',
    note: '',
    alias: '',
    day: 1,
    startNode: 1,
    step: 2,
    startWeek: 1,
    endWeek: 16,
    type: 0,
    color: '',
    colorMode: 0,
    ownTime: false,
    isIrregularNode: false,
    isIrregularTime: false,
    startTime: '',
    endTime: '',
    credit: 0,
    level: 0,
    ...partial,
  }
}

const geo = buildGridGeometry([], DEFAULT_TIME_JSON, 7, 1000, 1)

describe('buildGridGeometry — 布局常量', () => {
  it('scale=1 时 headH=52 timeW=68 rowH=56', () => {
    expect(geo.headH).toBe(52)
    expect(geo.timeW).toBe(68)
    expect(geo.rowH).toBe(GRID.slotH + GRID.gapH)
    expect(geo.rowH).toBe(56)
  })

  it('colW = (宽 - timeW - gap*(dayCount+1)) / dayCount', () => {
    expect(geo.colW).toBeCloseTo((1000 - 68 - 5 * 8) / 7, 5)
  })

  it('12 节表 gridH = 12 * 56', () => {
    expect(geo.gridH).toBeCloseTo(12 * 56, 3)
  })
})

describe('yOfRows — 加权行坐标', () => {
  it('无权重 = rowH * r 线性', () => {
    expect(yOfRows(geo.plan, 3, 56)).toBe(168)
  })

  it('带占位权重: 溢出合成后 yOfRows 非线性', () => {
    // 10:55-12:30 → 第 4 行后合成占位行 (50 分钟 / 45 = 1.11 权重, 可 >1)
    const own = mkCourse({ ownTime: true, isIrregularTime: true, startTime: '10:55', endTime: '12:30' })
    const plan = buildGridGeometry([own], DEFAULT_TIME_JSON, 7, 1000, 1).plan
    expect(plan.slotWeights).not.toBeNull()
    expect(plan.slots.length).toBe(13)
    const ws = plan.slotWeights!
    const y5 = yOfRows(plan, 5, 56)
    expect(y5).toBeCloseTo(56 * (4 + ws[4]), 5)
    // 5 分钟占位被抬到 0.36 下限的场景则是非线性另一侧
    expect(ws[4]).toBeCloseTo(50 / 45, 4)
  })
})

describe('slotIndexOf', () => {
  it('节 1 → 0, 节 12 → 11, 节 99 → -1', () => {
    expect(slotIndexOf(geo.slots, 1)).toBe(0)
    expect(slotIndexOf(geo.slots, 12)).toBe(11)
    expect(slotIndexOf(geo.slots, 99)).toBe(-1)
  })
})

describe('singleCardGeom — 非簇单卡', () => {
  it('第 1 天 1-2 节: x=timeW+gap, y=0, h=2*rowH-gap', () => {
    const g = singleCardGeom(mkCourse({ day: 1, startNode: 1, step: 2 }), geo, 0, true)!
    expect(g.x).toBeCloseTo(68 + 5, 5)
    expect(g.y).toBe(0)
    expect(g.h).toBeCloseTo(2 * 56 - 4, 5)
  })

  it('dayIdx 偏移: 第 3 天 (idx=2) x 递增', () => {
    const g = singleCardGeom(mkCourse({ day: 3, startNode: 1, step: 1 }), geo, 2, true)!
    expect(g.x).toBeCloseTo(68 + 5 + (geo.colW + 5) * 2, 5)
  })

  it('startNode 不在 timeJson → null (数据脏过滤)', () => {
    expect(singleCardGeom(mkCourse({ startNode: 99 }), geo, 0, true)).toBeNull()
  })

  it('ownTime 比例定位: 10:55-12:30 → y 在第 4 行, h 有 0.3 行下限', () => {
    const g = singleCardGeom(
      mkCourse({ ownTime: true, isIrregularTime: true, startNode: 4, step: 1, startTime: '10:55', endTime: '12:30' }),
      geo,
      0,
      true
    )!
    // 无溢出合成时 frac = [3, 4]; y = 3*56, h = 56-4
    expect(g.y).toBeCloseTo(3 * 56, 3)
    expect(g.h).toBeCloseTo(56 - 4, 3)
  })

  it('ownTime 短课保底 0.3 行', () => {
    const g = singleCardGeom(
      mkCourse({ ownTime: true, isIrregularTime: true, startNode: 1, step: 1, startTime: '08:00', endTime: '08:10' }),
      geo,
      0,
      true
    )!
    expect(g.h).toBeGreaterThanOrEqual(56 * 0.3 - 4)
  })
})
