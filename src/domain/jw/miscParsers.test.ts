/**
 * CF/PKU/BNUZ/URP/URP_NEW/HNUST fixture 对照 — Kotlin JwParserFixtureTest Case 表同源
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  JwChengFangParser, JwPekingParser, JwBnuzParser,
  JwUrpParser, JwNewUrpParser, JwHnustParser,
  weekIntList2WeekBeanList,
} from './miscParsers'
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
  return parserFactory(readFixture(htmlName + '.html')).generateCourseList()
}

function expectCoursesMatch(actual: JwCourse[], expectedName: string) {
  const raw = JSON.parse(readFixture(expectedName + '.expected.json'))
  // expected.json 两种形态: {courses:[...]} 包装 或 裸数组 (cf 系)
  const expected: Expected = Array.isArray(raw) ? { courses: raw } : raw
  expect(actual).toHaveLength(expected.courses.length)
  for (let i = 0; i < expected.courses.length; i++) {
    const a = actual[i]
    const e = expected.courses[i]
    expect([a.name, a.day, a.startNode, a.endNode, a.startWeek, a.endWeek, a.type, a.teacher, a.room])
      .toEqual([e.name, e.day, e.startNode, e.endNode, e.startWeek, e.endWeek, e.type, e.teacher, e.room])
  }
}

describe('JwChengFangParser (cf)', () => {
  it('cf-typical', () => expectCoursesMatch(check((h) => new JwChengFangParser(h), 'cf-chengfang-typical_two_courses'), 'cf-chengfang-typical_two_courses'))
  it('cf-sd', () => expectCoursesMatch(check((h) => new JwChengFangParser(h), 'cf-chengfang-single_double_weeks'), 'cf-chengfang-single_double_weeks'))
  it('cf-multi', () => expectCoursesMatch(check((h) => new JwChengFangParser(h), 'cf-chengfang-multi_segment_weeks'), 'cf-chengfang-multi_segment_weeks'))
  it('cf-escaped (括号配对提取 — 分号/转义引号不截断)', () => expectCoursesMatch(check((h) => new JwChengFangParser(h), 'cf-chengfang-escaped_quotes_multiline'), 'cf-chengfang-escaped_quotes_multiline'))
  it('cf-missing', () => expectCoursesMatch(check((h) => new JwChengFangParser(h), 'cf-chengfang-missing_fields'), 'cf-chengfang-missing_fields'))
  it('cf-empty', () => expect(check((h) => new JwChengFangParser(h), 'cf-chengfang-empty_timetable')).toHaveLength(0))
  it('cf-login (无 var kbxx)', () => expect(check((h) => new JwChengFangParser(h), 'cf-chengfang-login_page_no_kbxx')).toHaveLength(0))
})

describe('JwPekingParser (pku)', () => {
  it('pku-normal', () => expectCoursesMatch(check((h) => new JwPekingParser(h), 'pku-bnuz-pku_normal'), 'pku-bnuz-pku_normal'))
  it('pku-sd', () => expectCoursesMatch(check((h) => new JwPekingParser(h), 'pku-bnuz-pku_single_double_week'), 'pku-bnuz-pku_single_double_week'))
  it('pku-missing', () => expectCoursesMatch(check((h) => new JwPekingParser(h), 'pku-bnuz-pku_missing_fields'), 'pku-bnuz-pku_missing_fields'))
  it('pku-empty', () => expect(check((h) => new JwPekingParser(h), 'pku-bnuz-pku_empty')).toHaveLength(0))
  it('pku-login', () => expect(check((h) => new JwPekingParser(h), 'pku-bnuz-pku_login')).toHaveLength(0))
})

describe('JwBnuzParser (bnuz)', () => {
  it('bnuz-normal', () => expectCoursesMatch(check((h) => new JwBnuzParser(h), 'pku-bnuz-bnuz_normal'), 'pku-bnuz-bnuz_normal'))
  it('bnuz-missing (B3: 无 (N节) 丢弃 section 不崩)', () => expectCoursesMatch(check((h) => new JwBnuzParser(h), 'pku-bnuz-bnuz_missing_fields'), 'pku-bnuz-bnuz_missing_fields'))
  it('bnuz-empty', () => expect(check((h) => new JwBnuzParser(h), 'pku-bnuz-bnuz_empty')).toHaveLength(0))
  it('bnuz-login', () => expect(check((h) => new JwBnuzParser(h), 'pku-bnuz-bnuz_login')).toHaveLength(0))
})

describe('JwUrpParser (urp)', () => {
  it('urp-displaytag', () => expectCoursesMatch(check((h) => new JwUrpParser(h), 'hnust-urp-urp_displayTag_table'), 'hnust-urp-urp_displayTag_table'))
  it('urp-striped', () => expectCoursesMatch(check((h) => new JwUrpParser(h), 'hnust-urp-urp_striped_table_trimmed_cols'), 'hnust-urp-urp_striped_table_trimmed_cols'))
  it('urp-grid (T10 网格变体)', () => expectCoursesMatch(check((h) => new JwUrpParser(h), 'hnust-urp-urp_grid_day_node_td_id'), 'hnust-urp-urp_grid_day_node_td_id'))
  it('urp-empty', () => expect(check((h) => new JwUrpParser(h), 'hnust-urp-urp_grid_empty')).toHaveLength(0))
})

describe('JwNewUrpParser (urp_new)', () => {
  it('urp-new-courses — dateList JSON 抠取 + classWeek bitmap', () => {
    expectCoursesMatch(check((h) => new JwNewUrpParser(h), 'urp-new-schedule-courses'), 'urp-new-schedule-courses')
  })
})

describe('JwHnustParser (hnust)', () => {
  it('hnust-hidden (oldQzType=0: display:none 才是课)', () => {
    expectCoursesMatch(check((h) => new JwHnustParser(h), 'hnust-urp-hnust_kbtable_hidden_div'), 'hnust-urp-hnust_kbtable_hidden_div')
  })
  it('hnust-empty', () => expect(check((h) => new JwHnustParser(h), 'hnust-urp-hnust_empty_kbtable')).toHaveLength(0))
  it('hnust-login', () => expect(check((h) => new JwHnustParser(h), 'hnust-urp-hnust_login_page')).toHaveLength(0))
})

describe('weekIntList2WeekBeanList — 归并契约', () => {
  it('连续 / 单双 / 断段', () => {
    expect(weekIntList2WeekBeanList([1, 2, 3, 4])).toEqual([[1, 4, 0]])
    expect(weekIntList2WeekBeanList([1, 3, 5, 7])).toEqual([[1, 7, 1]])
    expect(weekIntList2WeekBeanList([2, 4, 6])).toEqual([[2, 6, 2]])
    expect(weekIntList2WeekBeanList([1, 2, 5, 6])).toEqual([[1, 2, 0], [5, 6, 0]])
    expect(weekIntList2WeekBeanList([])).toEqual([])
  })
})
