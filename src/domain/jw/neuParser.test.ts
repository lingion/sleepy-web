/**
 * NEU (东北大学强智 mobile JSON) — Kotlin JwNeuParserTest.kt 1:1 移植。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwNeuParser } from './neuParser'

const HERE = import.meta.dirname

function loadJson(): string {
  return readFileSync(join(HERE, '__fixtures__', 'neu-courses.json'), 'utf8')
}

function parse(src: string = loadJson()) {
  return new JwNeuParser(src).generateCourseList()
}

describe('JwNeuParser (neu)', () => {
  it('总条数 11', () => {
    expect(parse()).toHaveLength(11)
  })

  it('高等数学 字段映射', () => {
    const c = parse().find((x) => x.name === '高等数学')!
    expect([c.teacher, c.room, c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual(['王教授', '浑南校区一教A楼301', 1, 1, 2, 1, 16, 0])
  })

  it('大学物理 titleDetail 时间地点', () => {
    const c = parse().find((x) => x.name === '大学物理')!
    expect([c.teacher, c.room, c.day, c.startNode, c.endNode, c.startWeek, c.endWeek])
      .toEqual(['李老师', '浑南校区一教B楼202', 3, 5, 6, 2, 15])
  })

  it('离散周 2,4,6,8,10,12,14,16 展开 8 条', () => {
    const lab = parse().filter((x) => x.name === '数据结构实验')
    expect(lab).toHaveLength(8)
    expect(lab[0].day).toBe(5)
    expect([lab[0].startNode, lab[0].endNode]).toEqual([7, 8])
    expect(lab.map((x) => x.startWeek).sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
  })

  it('双周课 type=2 起始修正到偶数', () => {
    const c = parse().find((x) => x.name === '英语口语')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([2, 9, 10, 2, 16, 2])
  })

  it('非 JSON / 缺 arrangedList 返回空', () => {
    expect(parse('<html>login</html>')).toEqual([])
    expect(parse('{"datas": {}}')).toEqual([])
  })

  it('confidence >=80 on fixture, 0 on garbage', () => {
    expect(new JwNeuParser(loadJson()).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwNeuParser('nope').confidence()).toBe(0)
  })

  it('matchedFeatures 含 arrangedList', () => {
    expect(new JwNeuParser(loadJson()).matchedFeatures()).toContain('arrangedList')
  })
})
