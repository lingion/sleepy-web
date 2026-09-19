/**
 * WHUT (武汉理工大学) wisedu 变体 — Kotlin JwWhutParserTest.kt 1:1 移植。
 * 行字段 SKZC bitmap 复用, 模块路径 datas.cxxszhxqkb/cxxskcb/xskcb 三选一,
 * 节次 DM 6/7/13 缺位需映射物理节次 1..13。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwWhutParser, mapWhutSectionDm } from './wiseduParser'
import type { JwCourse, JwParser } from './jwCourse'

const HERE = import.meta.dirname

function readFixture(name: string): string {
  return readFileSync(join(HERE, '__fixtures__', name), 'utf8')
}

interface Expected {
  courses: Array<{
    name: string
    day: number
    startNode: number
    endNode: number
    startWeek: number
    endWeek: number
    type: number
    teacher: string
    room: string
  }>
}

function check(parserFactory: (html: string) => JwParser, src: string): JwCourse[] {
  return parserFactory(src).generateCourseList()
}

function expectCoursesMatch(actual: JwCourse[], expectedName: string) {
  const raw = JSON.parse(readFixture(expectedName))
  const expected: Expected = Array.isArray(raw) ? { courses: raw } : raw
  expect(actual).toHaveLength(expected.courses.length)
  for (let i = 0; i < expected.courses.length; i++) {
    const a = actual[i]
    const e = expected.courses[i]
    expect([a.name, a.day, a.startNode, a.endNode, a.startWeek, a.endWeek, a.type, a.teacher, a.room])
      .toEqual([e.name, e.day, e.startNode, e.endNode, e.startWeek, e.endWeek, e.type, e.teacher, e.room])
  }
}

const WHUT_ROWS = JSON.stringify({
  datas: {
    cxxskcb: {
      rows: [
        { KCM: '高等数学', SKJS: '张教授', JASMC: '南湖教1-101', SKXQ: '1', KSJC: '1', JSJC: '2', SKZC: '1111111111111111' },
        { KCM: '大学英语', SKJS: '李老师/王老师', JASMC: '鉴湖教2-203', SKXQ: '3', KSJC: '8', JSJC: '9', SKZC: '0101010101010101' },
        { KCM: '数据结构', SKJS: '赵老师', JASMC: '马房山教4-302', SKXQ: '5', KSJC: '14', JSJC: '15', SKZC: '0011111111111100' },
      ],
    },
  },
})

describe('JwWhutParser (whut)', () => {
  it('cxxskcb rows 路径解析 3 课', () => {
    expect(check((h) => new JwWhutParser(h), WHUT_ROWS)).toHaveLength(3)
  })

  it('节次 DM 映射: 上午段无偏移 (1→1, 2→2)', () => {
    const math = check((h) => new JwWhutParser(h), WHUT_ROWS).find((c) => c.name === '高等数学')!
    expect(math.startNode).toBe(1)
    expect(math.endNode).toBe(2)
  })

  it('节次 DM 映射: 下午段偏移 (8→6, 9→7)', () => {
    const eng = check((h) => new JwWhutParser(h), WHUT_ROWS).find((c) => c.name === '大学英语')!
    expect(eng.startNode).toBe(6)
    expect(eng.endNode).toBe(7)
  })

  it('节次 DM 映射: 晚间段偏移 (14→11, 15→12)', () => {
    const ds = check((h) => new JwWhutParser(h), WHUT_ROWS).find((c) => c.name === '数据结构')!
    expect(ds.startNode).toBe(11)
    expect(ds.endNode).toBe(12)
  })

  it('SKZC bitmap 双周压缩: 0101…→ type=2 双周 2-16', () => {
    const eng = check((h) => new JwWhutParser(h), WHUT_ROWS).find((c) => c.name === '大学英语')!
    expect(eng.type).toBe(2)
    expect(eng.startWeek).toBe(2)
    expect(eng.endWeek).toBe(16)
  })

  it('多教师 / 分隔保留', () => {
    const eng = check((h) => new JwWhutParser(h), WHUT_ROWS).find((c) => c.name === '大学英语')!
    expect(eng.teacher).toBe('李老师/王老师')
  })

  it('HEU xskcb 路径仍解析 (兼容回归)', () => {
    const heu = JSON.stringify({
      datas: {
        xskcb: {
          rows: [
            { KCM: '体育（二）', SKJS: '钱教练', JASMC: '体育馆', SKXQ: '2', KSJC: '3', JSJC: '4', SKZC: '1010101010101010' },
          ],
        },
      },
    })
    expectCoursesMatch(check((h) => new JwWhutParser(h), heu), 'whut/whut-heu-xskcb.expected.json')
  })

  it('未映射 DM 原值直通禁丢行', () => {
    const odd = JSON.stringify({
      datas: {
        cxxskcb: {
          rows: [
            { KCM: '新课', SKJS: '', JASMC: '', SKXQ: '4', KSJC: '6', JSJC: '6', SKZC: '1100000000000000' },
          ],
        },
      },
    })
    const [c] = check((h) => new JwWhutParser(h), odd)
    expect(c.startNode).toBe(6) // DM 6 不在映射表 → 原值
  })

  it('cxxszhxqkb live fixture: 27 行展开为 31 条课程段', () => {
    const src = readFixture('whut/whut_cxxszhxqkb_live.json')
    const courses = new JwWhutParser(src).generateCourseList()
    expect(courses).toHaveLength(31)
  })

  it('cxxszhxqkb live fixture: 晚间 DM14/16 → 物理 11..13', () => {
    const src = readFixture('whut/whut_cxxszhxqkb_live.json')
    const courses = new JwWhutParser(src).generateCourseList()
    const art = courses.filter((c) => c.name.startsWith('世界美术欣赏'))
    expect(art.length).toBeGreaterThan(0)
    expect(art[0].startNode).toBe(11)
    expect(art[0].endNode).toBe(13)
  })

  it('cxxszhxqkb live fixture: 模拟电子 6-15 周连续', () => {
    const src = readFixture('whut/whut_cxxszhxqkb_live.json')
    const courses = new JwWhutParser(src).generateCourseList()
    const analog = courses.find((c) => c.name === '模拟电子技术基础B' && c.day === 2 && c.startNode === 1)
    expect(analog).toBeTruthy()
    expect(analog!.startWeek).toBe(6)
    expect(analog!.endWeek).toBe(15)
    expect(analog!.type).toBe(0)
  })

  it('confidence: cxxskcb.do/url 痕迹高置信', () => {
    const withUrl = '{"trace":"cxxskcb.do","datas":{"cxxskcb":{"rows":[]}}}'
    expect(new JwWhutParser(withUrl).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwWhutParser(WHUT_ROWS).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwWhutParser('{"other":1}').confidence()).toBe(0)
  })
})

describe('mapWhutSectionDm', () => {
  it('DM 1..5 → 物理 1..5', () => {
    for (let i = 1; i <= 5; i++) expect(mapWhutSectionDm(i)).toBe(i)
  })
  it('DM 8..12 → 物理 6..10', () => {
    expect(mapWhutSectionDm(8)).toBe(6)
    expect(mapWhutSectionDm(9)).toBe(7)
    expect(mapWhutSectionDm(12)).toBe(10)
  })
  it('DM 14..16 → 物理 11..13', () => {
    expect(mapWhutSectionDm(14)).toBe(11)
    expect(mapWhutSectionDm(16)).toBe(13)
  })
  it('未映射 DM 原值直通', () => {
    expect(mapWhutSectionDm(6)).toBe(6)
    expect(mapWhutSectionDm(7)).toBe(7)
    expect(mapWhutSectionDm(13)).toBe(13)
  })
})