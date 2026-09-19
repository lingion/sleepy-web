/**
 * CQU (重庆大学 my.cqu.edu.cn) — Kotlin JwCquParserTest.kt 1:1 移植。
 * my-table-detail JSON: classTimetableVOList 行字段契约。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwCquParser } from './cquParser'

const HERE = import.meta.dirname

function loadJson(): string {
  return readFileSync(join(HERE, '__fixtures__', 'cqu-my-table.json'), 'utf8')
}

function parse() {
  return new JwCquParser(loadJson()).generateCourseList()
}

describe('JwCquParser (cqu)', () => {
  it('总条数: 6 行压缩后 6 个 JwCourse', () => {
    expect(parse()).toHaveLength(6)
  })

  it('字段映射: 高等数学', () => {
    const math = parse().find((c) => c.name === '高等数学Ⅰ-1')!
    expect([math.teacher, math.room, math.day, math.startNode, math.endNode, math.startWeek, math.endWeek, math.type])
      .toEqual(['张三', 'A区第一教学楼101', 1, 1, 2, 1, 17, 0])
  })

  it('双周压缩: 大学物理', () => {
    const physics = parse().filter((c) => c.name === '大学物理')
    expect(physics).toHaveLength(1)
    const p = physics[0]
    expect([p.startWeek, p.endWeek, p.type, p.day]).toEqual([2, 16, 2, 3])
  })

  it('晚开课程: 体育三 7-24 周', () => {
    const pe = parse().find((c) => c.name === '体育（三）')!
    expect([pe.day, pe.startNode, pe.endNode, pe.startWeek, pe.endWeek]).toEqual([5, 6, 7, 7, 24])
  })

  it('多段 - 教师串只取第一段: 电路与电子', () => {
    const cct = parse().find((c) => c.name === '电路与电子Ⅱ')!
    expect([cct.teacher, cct.day, cct.startNode, cct.endNode]).toEqual(['赵六', 4, 3, 4])
  })

  it('wholeWeekOccupy 照常输出: 金工实习', () => {
    const gx = parse().find((c) => c.name === '金工实习')!
    expect([gx.startWeek, gx.endWeek, gx.startNode, gx.endNode, gx.room]).toEqual([17, 20, 1, 1, '工程培训中心'])
  })

  it('null 教师/教室回退空串: 军事理论', () => {
    const mil = parse().find((c) => c.name === '军事理论')!
    expect([mil.teacher, mil.room, mil.startNode, mil.endNode]).toEqual(['', '', 10, 11])
  })

  it('confidence 锚点', () => {
    const p = new JwCquParser(loadJson())
    expect(p.confidence()).toBeGreaterThanOrEqual(80)
    expect(p.matchedFeatures().length).toBeGreaterThan(0)
    expect(new JwCquParser('random text').confidence()).toBe(0)
  })

  it('空/畸形输入优雅降级', () => {
    expect(new JwCquParser('').generateCourseList()).toHaveLength(0)
    expect(new JwCquParser('not json').generateCourseList()).toHaveLength(0)
    expect(new JwCquParser('{"classTimetableVOList":null}').generateCourseList()).toHaveLength(0)
  })
})
