/**
 * ZJU (浙江大学 UGR) — Kotlin JwZjuParserTest.kt 1:1 移植。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwZjuParser } from './zjuParser'

const HERE = import.meta.dirname

function loadJson(): string {
  return readFileSync(join(HERE, '__fixtures__', 'zju-courses.json'), 'utf8')
}

function parse(src: string = loadJson()) {
  return new JwZjuParser(src).generateCourseList()
}

describe('JwZjuParser (zju)', () => {
  it('总条数 11', () => {
    expect(parse()).toHaveLength(11)
  })

  it('高等数学 字段映射', () => {
    const c = parse().find((x) => x.name === '高等数学')!
    expect([c.teacher, c.room, c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual(['王教授', '紫金港东1A-301', 1, 1, 2, 1, 16, 0])
  })

  it('大学物理 单周端点修正', () => {
    const c = parse().find((x) => x.name === '大学物理')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([3, 5, 6, 3, 15, 1])
  })

  it('离散周 2,4,6,8,10,12,14,16 展开 8 条', () => {
    const lab = parse().filter((x) => x.name === '数据结构实验')
    expect(lab).toHaveLength(8)
    expect(lab[0].day).toBe(5)
    expect([lab[0].startNode, lab[0].endNode]).toEqual([7, 8])
    expect(lab.map((x) => x.startWeek).sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
  })

  it('双周课 type=2', () => {
    const c = parse().find((x) => x.name === '英语口语')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([2, 9, 10, 2, 16, 2])
  })

  it('teacher 缺失兜底空串', () => {
    const json = JSON.stringify({ kbList: [{
      xkkh: 'TEST', xqj: '4', dsz: '2', djj: '1', skcd: '2',
      kcb: '微积分<br>1-8周<br> ', xxq: '秋冬',
    }]})
    const c = parse(json)[0]
    expect([c.name, c.teacher]).toEqual(['微积分', ''])
  })

  it('confidence >=80 on fixture, 0 on no kbList', () => {
    expect(new JwZjuParser(loadJson()).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwZjuParser('{"other":{}}').confidence()).toBe(0)
  })

  it('matchedFeatures 含 kbList', () => {
    expect(new JwZjuParser(loadJson()).matchedFeatures()).toContain('kbList')
  })
})