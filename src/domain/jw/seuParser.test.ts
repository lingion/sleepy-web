/**
 * SEU (东南大学 URP JSON) — Kotlin JwSeuParserTest.kt 1:1 移植。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwSeuParser } from './seuParser'

const HERE = import.meta.dirname

function loadJson(): string {
  return readFileSync(join(HERE, '__fixtures__', 'seu-courses.json'), 'utf8')
}

function parse(src: string = loadJson()) {
  return new JwSeuParser(src).generateCourseList()
}

describe('JwSeuParser (seu)', () => {
  it('总条数 6 (1-16 + 2-15单 + 2,4,6 离散3 + 1-16双)', () => {
    expect(parse()).toHaveLength(6)
  })

  it('高等数学 字段映射', () => {
    const c = parse().find((x) => x.name === '高等数学')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type, c.teacher, c.room])
      .toEqual([1, 1, 2, 1, 16, 0, '张老师', '九龙湖A楼301'])
  })

  it('大学物理 单周端点修正 2→3', () => {
    const c = parse().find((x) => x.name === '大学物理')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([3, 5, 6, 3, 15, 1])
  })

  it('离散周展开: 数据结构实验 3 条', () => {
    const lab = parse().filter((x) => x.name === '数据结构实验')
    expect(lab).toHaveLength(3)
    expect(lab.map((x) => x.startWeek)).toEqual([2, 4, 6])
    for (const c of lab) {
      expect(c.day).toBe(5)
      expect([c.startNode, c.endNode]).toEqual([7, 8])
    }
  })

  it('双周课 type=2 + 端点修正 1→2', () => {
    const c = parse().find((x) => x.name === '英语口语')!
    expect([c.type, c.startWeek, c.endWeek]).toEqual([2, 2, 16])
  })

  it('null 教师/教室回退空串', () => {
    const src = JSON.stringify([
      { KCM: '测试课', SKXQ: 4, KSJC: 3, JSJC: 4, ZCMC: '1-8周', SKJS: null, JASMC: 'null' },
    ])
    const c = parse(src)[0]
    expect([c.teacher, c.room]).toEqual(['', ''])
  })

  it('confidence >= 80 on sample, 0 on text', () => {
    expect(new JwSeuParser(loadJson()).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwSeuParser('random text').confidence()).toBe(0)
  })

  it('matchedFeatures 含 KCM', () => {
    const feats = new JwSeuParser(loadJson()).matchedFeatures()
    expect(feats.some((x) => x.includes('KCM'))).toBe(true)
  })

  it('混合单双周按段检测: "1-8(单),9-16(双)" → 段独立 parity', () => {
    const ranges = new JwSeuParser('{}').parseWeekRanges('1-8(单),9-16(双)')
    expect(ranges).toHaveLength(2)
    expect(ranges[0]).toEqual([1, 8, 1])
    expect(ranges[1]).toEqual([10, 16, 2])
  })

  it('端点相等不倒挂: "6-6(单)" → [7,7,1]', () => {
    expect(new JwSeuParser('{}').parseWeekRanges('6-6(单)')).toEqual([[7, 7, 1]])
  })

  it('标量 root 返回空', () => {
    expect(new JwSeuParser('42').generateCourseList()).toHaveLength(0)
  })

  it('{data:{nested}} 形态返回空', () => {
    expect(new JwSeuParser('{"data":{"nested":1}}').generateCourseList()).toHaveLength(0)
  })
})