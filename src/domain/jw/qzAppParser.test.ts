/**
 * JwQzAppParser 测试 — Kotlin JwQzAppParserTest 1:1 移植
 * (hebzyhj 真实采集包 + classTime/classWeek 解码契约 + 逐周合并去重)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwQzAppParser, parseClassTime, parseWeekSpec, weekRunsFromWeeks } from './qzAppParser'

const HERE = import.meta.dirname

function loadFixture(): string {
  return readFileSync(join(HERE, '__fixtures__', 'qz_app-curriculum.sample.json'), 'utf8')
}

function loadMultiweekFixture(): string {
  return readFileSync(join(HERE, '__fixtures__', 'qz_app-curriculum.multiweek.sample.json'), 'utf8')
}

describe('JwQzAppParser — hebzyhj 真实采集包', () => {
  it('10 rows → 20 JwCourse, day 直方图', () => {
    const courses = new JwQzAppParser(loadFixture()).generateCourseList()
    expect(courses).toHaveLength(20)
    const byDay = new Map<number, number>()
    for (const c of courses) byDay.set(c.day, (byDay.get(c.day) ?? 0) + 1)
    expect(byDay.get(1)).toBe(2)
    expect(byDay.get(2)).toBe(2)
    expect(byDay.get(3)).toBe(4)
    expect(byDay.get(4)).toBe(4)
    expect(byDay.get(5)).toBe(8)
    expect(byDay.get(6)).toBeUndefined()
    expect(byDay.get(7)).toBeUndefined()
  })

  it('classWeek gap split — 广告策划与创意 1-4 then 6-19', () => {
    const courses = new JwQzAppParser(loadFixture()).generateCourseList()
    const ads = courses.filter((c) => c.name === '广告策划与创意')
    expect(ads).toHaveLength(2)
    const ranges = new Set(ads.map((c) => `${c.startWeek}-${c.endWeek}`))
    expect(ranges.has('1-4')).toBe(true)
    expect(ranges.has('6-19')).toBe(true)
    for (const a of ads) expect(a.type).toBe(0)
  })

  it('multi-segment split — 商务数据分析 双时段各两段', () => {
    const courses = new JwQzAppParser(loadFixture()).generateCourseList()
    const biz = courses.filter((c) => c.name === '商务数据分析')
    expect(biz).toHaveLength(4)
    const nodes = new Set(biz.map((c) => `${c.startNode}-${c.endNode}`))
    expect(nodes.has('1-2')).toBe(true)
    expect(nodes.has('3-4')).toBe(true)
    expect(biz.some((c) => c.room.includes('微机室'))).toBe(true)
    const r12 = new Set(biz.filter((c) => c.startNode === 1 && c.endNode === 2).map((c) => `${c.startWeek}-${c.endWeek}`))
    expect(r12.has('1-4')).toBe(true)
    expect(r12.has('6-14')).toBe(true)
  })

  it('field mapping — 消费行为分析 classroomNub=Z5-117', () => {
    const courses = new JwQzAppParser(loadFixture()).generateCourseList()
    const x = courses.find((c) => c.name === '消费行为分析')
    expect(x).toBeDefined()
    expect(x!.room).toBe('Z5-117')
    expect(x!.day).toBe(4)
    expect([x!.startNode, x!.endNode]).toEqual([1, 2])
    expect(x!.teacher).toBe('胡美娜')
  })
})

describe('JwQzAppParser — 逐周合并采集包 (multiweek)', () => {
  it('9 courses 29 JwCourse no loss', () => {
    const courses = new JwQzAppParser(loadMultiweekFixture()).generateCourseList()
    expect(courses).toHaveLength(29)
    const names = new Set(courses.map((c) => c.name))
    expect(names.has('ITMC市场营销沙盘模拟（二）')).toBe(true)
    expect(names.has('商务数据分析')).toBe(true)
    expect(names.has('客户关系管理')).toBe(true)
    expect(names.has('广告策划与创意')).toBe(true)
    expect(names.has('数字营销')).toBe(true)
    expect(names.has('消费行为分析')).toBe(true)
    expect(names.has('短视频策划与制作')).toBe(true)
    expect(names.has('管理学')).toBe(true)
    expect(names.has('财务管理（市场营销专业）')).toBe(true)
  })

  it('ITMC 周三 1-2 + 3-4 连堂两段 (9 位 classTime)', () => {
    const courses = new JwQzAppParser(loadMultiweekFixture()).generateCourseList()
    const itmc = courses.filter((c) => c.name === 'ITMC市场营销沙盘模拟（二）')
    const segs = new Set(itmc.map((c) => `${c.day}:${c.startNode}-${c.endNode}`))
    expect(segs.has('3:1-2')).toBe(true)
    expect(segs.has('3:3-4')).toBe(true)
    for (const c of itmc) {
      expect(c.startWeek).toBe(11)
      expect(c.endWeek).toBe(19)
    }
  })

  it('跨周重复行去重, 不同教室行都保留', () => {
    const courses = new JwQzAppParser(loadMultiweekFixture()).generateCourseList()
    const ad117 = courses.filter((c) => c.name === '广告策划与创意' && c.room === 'Z5-117')
    const ad103 = courses.filter((c) => c.name === '广告策划与创意' && c.room === 'Z5-103')
    expect(ad117.length).toBeGreaterThan(0)
    expect(ad103.length).toBeGreaterThan(0)
    expect(ad103[0].startWeek).toBe(7)
    expect(ad103[0].endWeek).toBe(15)
  })
})

describe('parseClassTime 解码契约', () => {
  it('合法/非法全形态', () => {
    expect(parseClassTime('10304')).toEqual([[1, 3, 4]])
    expect(parseClassTime('701')).toEqual([[7, 1, 1]])
    expect(parseClassTime('21112')).toEqual([[2, 11, 12]])
    expect(parseClassTime('301020304')).toEqual([[3, 1, 2], [3, 3, 4]])
    expect(parseClassTime('1034')).toEqual([])
    expect(parseClassTime('1030a')).toEqual([])
    expect(parseClassTime('0304')).toEqual([])
    expect(parseClassTime('8304')).toEqual([])
    expect(parseClassTime('14213')).toEqual([])
    expect(parseClassTime('')).toEqual([])
    expect(parseClassTime('-10304')).toEqual([])
  })
})

describe('parseWeekSpec', () => {
  it('区间/单周/混合/域外/倒序', () => {
    expect(parseWeekSpec('1-4')).toEqual([1, 2, 3, 4])
    expect(parseWeekSpec('3')).toEqual([3])
    expect(parseWeekSpec('1-4,6-10')).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10])
    expect(parseWeekSpec('1,30,31,0,-1,abc,1-')).toEqual([1, 30])
    expect(parseWeekSpec('')).toEqual([])
    expect(parseWeekSpec('1-3,5-2')).toEqual([1, 2, 3])
  })
})

describe('weekRunsFromWeeks', () => {
  it('连续/单元素/等差2/多段/空', () => {
    expect(weekRunsFromWeeks([1, 2, 3, 4])).toEqual([[1, 4, 0]])
    expect(weekRunsFromWeeks([3])).toEqual([[3, 3, 0]])
    expect(weekRunsFromWeeks([1, 3, 5, 7, 9])).toEqual([[1, 9, 1]])
    expect(weekRunsFromWeeks([2, 4, 6, 8, 10])).toEqual([[2, 10, 2]])
    expect(
      weekRunsFromWeeks([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
    ).toEqual([
      [1, 4, 0],
      [6, 19, 0],
    ])
    expect(weekRunsFromWeeks([])).toEqual([])
  })
})

describe('JwQzAppParser — 边界输入', () => {
  it('空/非JSON/401/空data/缺courses/空白名/坏classTime — graceful', () => {
    expect(new JwQzAppParser('').generateCourseList()).toHaveLength(0)
    expect(new JwQzAppParser('not json at all').generateCourseList()).toHaveLength(0)
    const unauthorized = '{"code":"401","Msg":"非法访问：/student/curriculum","data":null}'
    expect(new JwQzAppParser(unauthorized).generateCourseList()).toHaveLength(0)
    expect(new JwQzAppParser('{"code":"1","Msg":"success~","data":[]}').generateCourseList()).toHaveLength(0)
    expect(new JwQzAppParser('{"code":"1","data":[{"date":[]}]}').generateCourseList()).toHaveLength(0)
    const blankName = '{"code":"1","data":[{"courses":[{"classTime":"10304","classWeek":"1-4,6-19","courseName":"   "},{"classTime":"10304","classWeek":"1-4,6-19","courseName":"正常课"}]}]}'
    const mixed = new JwQzAppParser(blankName).generateCourseList()
    expect(mixed).toHaveLength(2)
    expect(mixed.every((c) => c.name === '正常课')).toBe(true)
    const badTime = '{"code":"1","data":[{"courses":[{"classTime":"X0304","classWeek":"1-4,6-19","courseName":"坏时间"},{"classTime":"10304","classWeek":"1-4,6-19","courseName":"好时间"}]}]}'
    const skipBad = new JwQzAppParser(badTime).generateCourseList()
    expect(skipBad).toHaveLength(2)
    expect(skipBad.every((c) => c.name === '好时间')).toBe(true)
  })

  it('weeks 信封 junk 元素 — 0 课', () => {
    const junk = '{"weeks":[null,"x",3,{"data":{"courses":[]}}]}'
    expect(new JwQzAppParser(junk).generateCourseList()).toHaveLength(0)
  })
})
