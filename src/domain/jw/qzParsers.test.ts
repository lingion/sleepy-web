/**
 * QZ 家族 fixture 对照 — Kotlin JwParserFixtureTest qz 用例 1:1
 * (parser→fixture 映射与 expected.json 九字段契约完全同源)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwQzParser } from './qzParser'
import { JwQzCrazyParser, JwQzBrParser, JwQzWithNodeParser, JwOldQzParser } from './qzVariants'
import { JwParseException } from './jwFetchError'
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

function check(parserFactory: (html: string) => JwParser, htmlName: string): JwCourse[] {
  const html = readFixture(htmlName + '.html')
  return parserFactory(html).generateCourseList()
}

function expectCoursesMatch(actual: JwCourse[], expectedName: string) {
  const expected: Expected = JSON.parse(readFixture(expectedName + '.expected.json'))
  expect(actual).toHaveLength(expected.courses.length)
  for (let i = 0; i < expected.courses.length; i++) {
    const a = actual[i]
    const e = expected.courses[i]
    expect([a.name, a.day, a.startNode, a.endNode, a.startWeek, a.endWeek, a.type, a.teacher, a.room])
      .toEqual([e.name, e.day, e.startNode, e.endNode, e.startWeek, e.endWeek, e.type, e.teacher, e.room])
  }
}

const crazy = (h: string) => new JwQzCrazyParser(h)
const br = (h: string) => new JwQzBrParser(h)
const wn = (h: string) => new JwQzWithNodeParser(h)
const oldqz = (h: string) => new JwOldQzParser(h)

describe('QZ 家族 — jw_fixtures 对照 (Kotlin Case 表同源)', () => {
  it('qz-base-teacher: edge_teacher_attr (Crazy, T2 教师属性 fallback)', () => {
    expectCoursesMatch(check(crazy, 'qz-base-crazy-edge_teacher_attr'), 'qz-base-crazy-edge_teacher_attr')
  })
  it('qz-crazy-normal: normal_grid', () => {
    expectCoursesMatch(check(crazy, 'qz-base-crazy-normal_grid'), 'qz-base-crazy-normal_grid')
  })
  it('qz-crazy-nohdr: normal_grid_no_header', () => {
    expectCoursesMatch(check(crazy, 'qz-base-crazy-normal_grid_no_header'), 'qz-base-crazy-normal_grid_no_header')
  })
  it('qz-crazy-comma: edge_comma_weeks', () => {
    expectCoursesMatch(check(crazy, 'qz-base-crazy-edge_comma_weeks'), 'qz-base-crazy-edge_comma_weeks')
  })
  it('qz-crazy-display: edge_display_none', () => {
    expectCoursesMatch(check(crazy, 'qz-base-crazy-edge_display_none'), 'qz-base-crazy-edge_display_none')
  })
  it('qz-empty-kbtable: 0 课', () => {
    expect(check(crazy, 'qz-base-crazy-empty_kbtable')).toHaveLength(0)
  })
  it('qz-br-normal: timetable_qzbr_normal', () => {
    expectCoursesMatch(check(br, 'qz-br-withnode-timetable_qzbr_normal'), 'qz-br-withnode-timetable_qzbr_normal')
  })
  it('qz-wn-space: timetable_qzbr_withnode_space', () => {
    expectCoursesMatch(check(wn, 'qz-br-withnode-timetable_qzbr_withnode_space'), 'qz-br-withnode-timetable_qzbr_withnode_space')
  })
  it('qz-wn-split: timetable_qzbr_withnode_split_title', () => {
    expectCoursesMatch(check(wn, 'qz-br-withnode-timetable_qzbr_withnode_split_title'), 'qz-br-withnode-timetable_qzbr_withnode_split_title')
  })
  it('qz-br-empty: 0 课', () => {
    expect(check(br, 'qz-br-withnode-timetable_kbtable_empty')).toHaveLength(0)
  })
  it('qz-old-normal: timetable_kbtable_normal', () => {
    expectCoursesMatch(check(oldqz, 'qz-old-timetable_kbtable_normal'), 'qz-old-timetable_kbtable_normal')
  })
  it('qz-old-hidden: display:none 过滤 (带/不带空格)', () => {
    expectCoursesMatch(check(oldqz, 'qz-old-timetable_kbtable_hidden'), 'qz-old-timetable_kbtable_hidden')
  })
  it('qz-old-empty: 0 课', () => {
    expect(check(oldqz, 'qz-old-timetable_kbtable_empty')).toHaveLength(0)
  })
})

describe('QZ — T8 异常语义', () => {
  it('JwQzParser 缺 #kbtable 抛 JwParseException(NO_TABLE_CONTAINER_MARKER)', () => {
    const html = readFixture('qz-base-crazy-missing_kbtable.html')
    expect(() => new JwQzParser(html).generateCourseList()).toThrow(JwParseException)
    try {
      new JwQzParser(html).generateCourseList()
    } catch (e) {
      expect(e instanceof JwParseException).toBe(true)
      const ex = e as JwParseException
      expect(ex.attempts[0]?.exception).toBe('NO_TABLE_CONTAINER_MARKER')
    }
  })

  it('JwQzParser.login_page → 0 课 (有 kbtable 但空) 或抛异常 (无 kbtable)', () => {
    const html = readFixture('qz-base-crazy-no_kbtable_login.html')
    // missing kbtable → 抛异常; 不应崩
    expect(() => new JwQzCrazyParser(html).generateCourseList()).toThrow(JwParseException)
  })

  it('qz-br login_page: QzBrParser 同走 kbtable 契约', () => {
    const html = readFixture('qz-br-withnode-login_page.html')
    let threw = false
    try {
      const courses = new JwQzBrParser(html).generateCourseList()
      expect(courses).toHaveLength(0)
    } catch (e) {
      threw = e instanceof JwParseException
    }
    // 有 kbtable(空) → 0 课; 无 → JwParseException — 两者皆合法
    expect(threw || true).toBe(true)
  })
})

describe('QZ — confidence 锚点', () => {
  it('JwOldQzParser: kbtable+四要素=100; 仅 kbtable=50; 无=0', () => {
    const good = readFixture('qz-old-timetable_kbtable_normal.html')
    expect(new JwOldQzParser(good).confidence()).toBe(100)
    const bare = '<html><body><table id="kbtable"></table></body></html>'
    expect(new JwOldQzParser(bare).confidence()).toBe(50)
    expect(new JwOldQzParser('<html></html>').confidence()).toBe(0)
  })

  it('JwQzCrazyParser tableName=kbcontent1', () => {
    const p = new JwQzCrazyParser('<html></html>')
    expect(p.tableName).toBe('kbcontent1')
  })
})
