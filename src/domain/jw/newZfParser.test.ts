/**
 * JwNewZfParser 测试 — Kotlin JwNewZfParserTest + JwParserFixtureTest 基线移植。
 * HTML fixture (.html) + JSON fixture (.json) 与 expected.json 九字段逐条对照。
 * 顺序敏感, 禁止改 expected 迎合现状 (Kotlin §8 同规)。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwNewZfParser, parseSectionRanges, parseWeekStr } from './newZfParser'
import type { JwCourse } from './jwCourse'

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

describe('JwNewZfParser — kbList JSON 形态 (zf-new-kblist-*)', () => {
  it('kblist_range_sections — 5 课 (范围/补零/多段节次)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-kblist-kblist_range_sections.json')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-kblist-kblist_range_sections')
  })

  it('kblist_single_double_weeks — 2 课 (单双周)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-kblist-kblist_single_double_weeks.json')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-kblist-kblist_single_double_weeks')
  })

  it('kblist_bitmap_and_extremes — 3 课 (bitmap 周次)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-kblist-kblist_bitmap_and_extremes.json')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-kblist-kblist_bitmap_and_extremes')
  })

  it('kblist_missing_fields — 1 课 (缺字段)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-kblist-kblist_missing_fields.json')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-kblist-kblist_missing_fields')
  })

  it('kblist_mobile_deeply_wrapped — 1 课 ({Msg,code,data:[{kbList}]} 深层穿透)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-kblist-kblist_mobile_deeply_wrapped.json')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-kblist-kblist_mobile_deeply_wrapped')
  })

  it('kblist_with_sjklist_and_empty — 2 课', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-kblist-kblist_with_sjklist_and_empty.json')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-kblist-kblist_with_sjklist_and_empty')
  })

  it('kblist_empty_semester / no_courses — 0 课', () => {
    expect(new JwNewZfParser(readFixture('zf-new-kblist-kblist_empty_semester.html')).generateCourseList()).toHaveLength(0)
    expect(new JwNewZfParser(readFixture('zf-new-kblist-kblist_no_courses_this_semester.json')).generateCourseList()).toHaveLength(0)
  })
})

describe('JwNewZfParser — HTML 变体 (zf-new-*)', () => {
  it('table1_festival_view — 3 课', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-table1_festival_view.html')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-table1_festival_view')
  })

  it('grid_dual_view — 3 课 (shiguang 网格)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-grid_dual_view.html')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-grid_dual_view')
  })

  it('list_dual_view — 3 课 (shiguang 列表)', () => {
    const courses = new JwNewZfParser(readFixture('zf-new-list_dual_view.html')).generateCourseList()
    expectCoursesMatch(courses, 'zf-new-list_dual_view')
  })

  it('grid_empty_semester / grid_missing_fields / login_page — 0 课', () => {
    expect(new JwNewZfParser(readFixture('zf-new-grid_empty_semester.html')).generateCourseList()).toHaveLength(0)
    expect(new JwNewZfParser(readFixture('zf-new-grid_missing_fields.html')).generateCourseList()).toHaveLength(0)
    expect(new JwNewZfParser(readFixture('zf-new-login_page.html')).generateCourseList()).toHaveLength(0)
  })
})

describe('parseSectionRanges — 节次三形态', () => {
  it('范围串 / 单节 / 多段 / 补零', () => {
    expect(parseSectionRanges('1-2')).toEqual([[1, 2]])
    expect(parseSectionRanges('5')).toEqual([[5, 5]])
    expect(parseSectionRanges('3-4,6-7')).toEqual([[3, 4], [6, 7]])
    expect(parseSectionRanges('0102')).toEqual([[1, 2]])
    expect(parseSectionRanges('01121314')).toEqual([[1, 12], [13, 14]])
    expect(parseSectionRanges('')).toEqual([])
    // 越界 (17 节) 拒绝
    expect(parseSectionRanges('17')).toEqual([])
  })
})

describe('parseWeekStr — 周次形态', () => {
  it('范围 / 单双周 / 花括号 / 第字 / bitmap / 缺省', () => {
    expect(parseWeekStr('1-16周')).toEqual([[1, 16, 0]])
    expect(parseWeekStr('1-16周(单)')).toEqual([[1, 16, 1]])
    expect(parseWeekStr('2-8周(双)')).toEqual([[2, 8, 2]])
    expect(parseWeekStr('{第1-16周}')).toEqual([[1, 16, 0]])
    expect(parseWeekStr('1-8,11-16周(双)')).toEqual([[1, 8, 0], [11, 16, 2]])
    expect(parseWeekStr('')).toEqual([[1, 16, 0]])
    // bitmap: 11111111111100000 → 1-12 连续
    expect(parseWeekStr('11111111111100000')).toEqual([[1, 12, 0]])
    // bitmap 单周: 1010101010100000 → 1-11 步2 单周
    expect(parseWeekStr('1010101010100000')).toEqual([[1, 11, 1]])
  })
})
