/**
 * JwWiseduParser fixture 对照 — Kotlin JwWiseduParserTest 同源
 * (哈工程真实数据 + empty/login 边界; expected.json 含 _meta)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwWiseduParser, weekRuns } from './wiseduParser'
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

describe('JwWiseduParser — 哈工程真实数据 (wisedu-*)', () => {
  it('xskcb_normal — 全量对照', () => {
    const courses = new JwWiseduParser(readFixture('wisedu-xskcb_normal.json')).generateCourseList()
    expectCoursesMatch(courses, 'wisedu-xskcb_normal.json.expected.json')
  })

  it('xskcb_missing_fields', () => {
    const courses = new JwWiseduParser(readFixture('wisedu-xskcb_missing_fields.json')).generateCourseList()
    expectCoursesMatch(courses, 'wisedu-xskcb_missing_fields.json.expected.json')
  })

  it('xskcb_empty_rows — 0 课', () => {
    expect(new JwWiseduParser(readFixture('wisedu-xskcb_empty_rows.json')).generateCourseList()).toHaveLength(0)
  })

  it('xskcb_login_page — HTML 登录页 0 课不崩', () => {
    expect(new JwWiseduParser(readFixture('wisedu-xskcb_login_page.html')).generateCourseList()).toHaveLength(0)
  })

  it('empty/malformed JSON — graceful', () => {
    expect(new JwWiseduParser('not json at all').generateCourseList()).toHaveLength(0)
    expect(new JwWiseduParser('{}').generateCourseList()).toHaveLength(0)
  })
})

describe('weekRuns — SKZC bitmap 语义', () => {
  it('单连续段 type=0', () => {
    expect(weekRuns('11111111111100000000')).toEqual([[1, 12, 0]])
  })
  it('整体等差2 奇数 → 单周', () => {
    expect(weekRuns('10101010101000000000')).toEqual([[1, 11, 1]])
  })
  it('整体等差2 偶数 → 双周', () => {
    expect(weekRuns('01010101010000000000')).toEqual([[2, 10, 2]])
  })
  it('多段非等差 → 拆连续段', () => {
    expect(weekRuns('11100001110000000000')).toEqual([[1, 3, 0], [8, 10, 0]])
  })
  it('全 0 → 空', () => {
    expect(weekRuns('00000000000000000000')).toEqual([])
  })
})
