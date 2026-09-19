/**
 * QZ_IEAS (强智 iEAS 网络版, /ieas2.1/) — Kotlin JwQzIeasParserTest.kt 1:1 移植。
 * queryGrkb HTML 表格: data-* 字段优先, 五列文本回退; 单双周语义保留。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwQzIeasParser } from './qzIeasParser'

const HERE = import.meta.dirname

function fixture(): string {
  return readFileSync(join(HERE, '__fixtures__', 'qz_ieas', 'query-grkb.sample.html'), 'utf8')
}

describe('JwQzIeasParser (qz_ieas)', () => {
  it('结构化行解析 + 周次展开', () => {
    const courses = new JwQzIeasParser(fixture()).generateCourseList()
    expect(courses).toHaveLength(5)
    const math = courses.find((c) => c.name === '高等数学')!
    expect([math.day, math.startNode, math.endNode, math.startWeek, math.endWeek, math.teacher, math.room])
      .toEqual([1, 1, 2, 1, 16, '张老师', '主楼101'])
  })

  it('单双周与离散周次语义', () => {
    const courses = new JwQzIeasParser(fixture()).generateCourseList()
    const english = courses.find((c) => c.name === '大学英语')!
    expect(english.type).toBe(1)
    expect(english.startWeek).toBe(3)
    expect(english.endWeek).toBe(15)
    const programming = courses.filter((c) => c.name === '程序设计')
    expect(programming.map((c) => c.startWeek)).toEqual([2, 4, 6])
  })

  it('confidence/feature 识别 iEAS 表', () => {
    const parser = new JwQzIeasParser(fixture())
    expect(parser.confidence()).toBeGreaterThanOrEqual(80)
    expect(parser.matchedFeatures()).toContain('table#queryGrkb')
  })
})
