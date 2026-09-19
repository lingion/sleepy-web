import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwEams5Parser } from './eams5Parser'

const HERE = import.meta.dirname
const load = (name: string) => readFileSync(join(HERE, '__fixtures__', name), 'utf8')
const datum = () => load('eams5-datum.sample.json')
const ahu = () => load('eams5-getdata-ahu.sample.json')
const xc = () => load('eams5-xc-datum-with-layout.json')

describe('JwEams5Parser', () => {
  it('parses HFUT schedule rows and lesson names', () => {
    const cs = new JwEams5Parser(datum()).generateCourseList()
    expect(cs).toHaveLength(4)
    const math = cs.find((x) => x.name === '高等数学')!
    expect([math.day, math.startNode, math.endNode, math.startWeek, math.endWeek, math.type, math.room, math.teacher])
      .toEqual([1, 1, 2, 1, 1, 0, 'A楼101', '张三'])
    const physics = cs.find((x) => x.name === '大学物理')!
    expect([physics.day, physics.startNode, physics.endNode]).toEqual([3, 3, 4])
    const lab = cs.find((x) => x.name === '数据结构实验')!
    expect([lab.day, lab.startNode, lab.endNode, lab.room, lab.teacher]).toEqual([5, 5, 8, '实验楼401', '王五'])
  })

  it('uses lesson id when lessonList has no matching name', () => {
    const src = JSON.stringify({ result: { lessonList: [], scheduleList: [
      { lessonId: 9999, room: null, weekday: 2, personName: '外教', weekIndex: 3, startTime: 1900, periods: 1, endTime: 1950 },
    ] } })
    const c = new JwEams5Parser(src).generateCourseList()[0]
    expect([c.name, c.room]).toEqual(['9999', ''])
  })

  it('falls back to periods for unmappable time, and drops periods <= 0', () => {
    const base = (periods: number) => JSON.stringify({ result: {
      lessonList: [{ id: 1, courseName: '课' }],
      scheduleList: [{ lessonId: 1, weekday: 2, weekIndex: 3, startTime: 0, endTime: 0, periods }],
    } })
    expect(new JwEams5Parser(base(3)).generateCourseList()[0]).toMatchObject({ startNode: 1, endNode: 3 })
    expect(new JwEams5Parser(base(0)).generateCourseList()).toEqual([])
  })

  it('parses AHU print-data with RLE weeks and room/teacher fallbacks', () => {
    const cs = new JwEams5Parser(ahu()).generateCourseList()
    expect(cs).toHaveLength(10)
    const math = cs.find((x) => x.name === '高等数学')!
    expect([math.day, math.startNode, math.endNode, math.startWeek, math.endWeek, math.type, math.teacher, math.room])
      .toEqual([1, 1, 2, 1, 16, 0, '张教授', '龙河校区 博学南楼 A101'])
    const physics = cs.find((x) => x.name === '大学物理')!
    expect([physics.startWeek, physics.endWeek, physics.type, physics.teacher]).toEqual([2, 8, 2, '李副教授/钱讲师'])
    expect(cs.filter((x) => x.name === '数据结构')).toHaveLength(3)
    expect(cs.find((x) => x.name === '形势与政策')?.startWeek).toBe(8)
  })

  it('prefers print-data over metadata and result shapes', () => {
    const src = JSON.stringify({
      studentTableVms: [{ activities: [{ courseName: 'AHU优先课', teacherNames: ['T'], campus: 'X', building: 'Y', room: 'Z', weekday: 1, weekIndexes: '1-16', startUnit: 1, endUnit: 2 }] }],
      data: { lessons: [{ id: 1, courseName: 'metadata' }] },
      result: { lessonList: [{ id: 99, courseName: 'HFUT' }], scheduleList: [{ lessonId: 99, weekday: 1, weekIndex: 1, startTime: 800, endTime: 950, periods: 2 }] },
    })
    const cs = new JwEams5Parser(src).generateCourseList()
    expect(cs).toHaveLength(1)
    expect(cs[0].name).toBe('AHU优先课')
  })

  it('uses metadata lessons when print-data activities are absent', () => {
    const src = JSON.stringify({ data: { lessons: [{ id: 1, courseName: '元数据课', teacher: 'T', room: 'R', weekday: 1, weekIndex: 2, startTime: 800, endTime: 950, periods: 2 }] } })
    expect(new JwEams5Parser(src).generateCourseList()[0]).toMatchObject({ name: '元数据课', teacher: 'T', room: 'R', startNode: 1, endNode: 2 })
  })

  it('maps the HFUT 12-unit layout exactly', () => {
    const cs = new JwEams5Parser(xc()).generateCourseList()
    expect(cs).toHaveLength(122)
    const dist = new Map<string, number>()
    for (const c of cs) {
      const key = `${c.startNode}-${c.endNode}`
      dist.set(key, (dist.get(key) ?? 0) + 1)
    }
    expect(Object.fromEntries(dist)).toEqual({ '1-2': 22, '3-4': 47, '5-6': 35, '7-8': 10, '10-11': 8 })
    const evening = cs.filter((x) => x.name === '情景喜剧与美国文化')
    expect(evening.every((x) => x.startNode === 10 && x.endNode === 11)).toBe(true)
  })

  it('parses parity, discrete, mixed and empty week ranges', () => {
    const p = new JwEams5Parser('')
    expect(p.parseWeekRanges('1-16单')).toEqual([[1, 16, 1]])
    expect(p.parseWeekRanges('1-16双')).toEqual([[2, 16, 2]])
    expect(p.parseWeekRanges('8,10,12,14')).toEqual([[8, 8, 0], [10, 10, 0], [12, 12, 0], [14, 14, 0]])
    expect(p.parseWeekRanges('1-8周(单),9-16周(双)')).toEqual([[1, 8, 1], [10, 16, 2]])
    expect(p.parseWeekRanges('1-16 even')).toEqual([[2, 16, 2]])
    expect(p.parseWeekRanges('')).toEqual([[1, 1, 0]])
  })

  it('supports teacher fallback fields', () => {
    for (const [key, value] of [['teacherNames', ['甲', '乙']], ['teachers', ['甲', '乙']], ['teacherList', ['甲', '乙']]] as const) {
      const src = JSON.stringify({ studentTableVms: [{ activities: [{ courseName: '课', [key]: value, weekday: 1, weekIndexes: '1', startUnit: 1, endUnit: 2 }] }] })
      expect(new JwEams5Parser(src).generateCourseList()[0].teacher).toBe('甲/乙')
    }
    const src = JSON.stringify({ studentTableVms: [{ activities: [{ courseName: '课', teacherNames: [], teacher: '外教', weekday: 1, weekIndexes: '1', startUnit: 1, endUnit: 2 }] }] })
    expect(new JwEams5Parser(src).generateCourseList()[0].teacher).toBe('外教')
  })

  it('reports shape confidence and handles invalid JSON', () => {
    expect(new JwEams5Parser(ahu()).confidence()).toBe(100)
    expect(new JwEams5Parser(datum()).confidence()).toBe(95)
    expect(new JwEams5Parser('{"data":{"lessons":[]}}').confidence()).toBe(85)
    expect(new JwEams5Parser('<html/>').generateCourseList()).toEqual([])
    expect(new JwEams5Parser('{"kbList":[]}').confidence()).toBe(0)
  })
})
