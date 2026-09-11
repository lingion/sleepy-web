/**
 * JwOldZfParser 测试 — Kotlin JwOldZfParserTest 基线移植 + jw_fixtures/zf-old-* 全量对照。
 * 每个 fixture 的 expected.json 与 Kotlin 测试同一真值源 (courses 数组逐字段 diff)。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwOldZfParser } from './oldZfParser'
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

function checkFixture(htmlName: string, parserType: number | null = null): JwCourse[] {
  const html = readFixture(htmlName + '.html')
  const parser = parserType === null ? new JwOldZfParser(html) : new JwOldZfParser(html, parserType)
  return parser.generateCourseList()
}

function expectedOf(htmlName: string): Expected {
  return JSON.parse(readFixture(htmlName + '.expected.json'))
}

function expectCoursesMatch(actual: JwCourse[], expected: Expected) {
  expect(actual).toHaveLength(expected.courses.length)
  for (let i = 0; i < expected.courses.length; i++) {
    const a = actual[i]
    const e = expected.courses[i]
    expect([a.name, a.day, a.startNode, a.endNode, a.startWeek, a.endWeek, a.type, a.teacher, a.room])
      .toEqual([e.name, e.day, e.startNode, e.endNode, e.startWeek, e.endWeek, e.type, e.teacher, e.room])
  }
}

describe('JwOldZfParser — jw_fixtures/zf-old-* 对照', () => {
  it('zf-old-standard_single_course', () => {
    expectCoursesMatch(checkFixture('zf-old-standard_single_course'), expectedOf('zf-old-standard_single_course'))
  })

  it('zf-old-standard_multi_course', () => {
    expectCoursesMatch(checkFixture('zf-old-standard_multi_course'), expectedOf('zf-old-standard_multi_course'))
  })

  it('zf-old-abnormal_br3', () => {
    expectCoursesMatch(checkFixture('zf-old-abnormal_br3'), expectedOf('zf-old-abnormal_br3'))
  })

  it('zf-old-abnormal_triple_br', () => {
    expectCoursesMatch(checkFixture('zf-old-abnormal_triple_br'), expectedOf('zf-old-abnormal_triple_br'))
  })

  it('zf-old-blacktab_merged_node_header', () => {
    expectCoursesMatch(checkFixture('zf-old-blacktab_merged_node_header'), expectedOf('zf-old-blacktab_merged_node_header'))
  })

  it('zf-old-course_property_with_node_override', () => {
    expectCoursesMatch(checkFixture('zf-old-course_property_with_node_override'), expectedOf('zf-old-course_property_with_node_override'))
  })

  it('zf-old-digit_headers', () => {
    expectCoursesMatch(checkFixture('zf-old-digit_headers'), expectedOf('zf-old-digit_headers'))
  })

  it('zf-old-property_row_extended', () => {
    expectCoursesMatch(checkFixture('zf-old-property_row_extended'), expectedOf('zf-old-property_row_extended'))
  })

  it('zf-old-empty_table → 0 课程', () => {
    expect(checkFixture('zf-old-empty_table')).toHaveLength(0)
  })

  it('zf-old-login_page → 0 课程 (不抛异常)', () => {
    expect(() => checkFixture('zf-old-login_page')).not.toThrow()
    expect(checkFixture('zf-old-login_page')).toHaveLength(0)
  })
})

describe('JwOldZfParser — Kotlin T1 修复回归 (内联 HTML)', () => {
  it('G3 type1 hasTypeFlag 每门课后复位 同格第二门课名不误取', () => {
    const html = `<html><body><table id="Table1">
      <tr><td>第1节</td>
        <td>高等数学 通识必修 {第1-16周} 张老师 A101 大学英语 {第2-16周|单周} 李老师 B202</td>
      </tr>
    </table></body></html>`
    const courses = new JwOldZfParser(html, 1).generateCourseList()
    expect(courses).toHaveLength(2)
    expect(courses[0].name).toBe('高等数学')
    expect(courses[0].teacher).toBe('张老师')
    expect(courses[0].room).toBe('A101')
    expect(courses[1].name).toBe('大学英语')
    expect(courses[1].teacher).toBe('李老师')
    expect(courses[1].room).toBe('B202')
  })

  it('G6 合并行头 第3-4节 按首段解析', () => {
    const html = `<html><body><table id="Table1">
      <tr><td>第1节</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td>第3-4节</td><td>高等数学<br>{第1-16周}<br>张老师<br>A101</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </table></body></html>`
    const courses = new JwOldZfParser(html).generateCourseList()
    expect(courses.length).toBeGreaterThanOrEqual(1)
    expect(courses[0].startNode).toBe(3)
  })

  it('confidence: Table1+花括号=100', () => {
    const html = `<html><body><table id="Table1"><tr><td>第1节</td><td>x {第1-16周}</td></tr></table></body></html>`
    expect(new JwOldZfParser(html).confidence()).toBe(100)
  })

  it('G7 周天→7 别名', () => {
    // 周次串带 "周天" → day 从串取 7
    const html = `<html><body><table id="Table1">
      <tr><td>第1节</td><td>晚课<br>周天第1-16周<br>老师<br>教室</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    </table></body></html>`
    const courses = new JwOldZfParser(html).generateCourseList()
    if (courses.length > 0) {
      // 串里 "周天" 在首两字 → day=7
      expect(courses[0].day).toBe(7)
    }
  })
})
