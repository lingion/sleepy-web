/**
 * CHAOXING (超星综合教务) — Kotlin JwChaoxingParserTest.kt 1:1 移植。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwChaoxingParser } from './chaoxingParser'

const HERE = import.meta.dirname

function fixture(): string {
  return readFileSync(join(HERE, '__fixtures__', 'jlbtc-grdb.json'), 'utf8')
}

function parse(src: string = fixture()) {
  return new JwChaoxingParser(src).generateCourseList()
}

describe('JwChaoxingParser (chaoxing)', () => {
  it('22 单节行合并为 11 连堂课', () => {
    expect(parse()).toHaveLength(11)
  })

  it('周一算法设计与分析 1-2 节 1-12 周', () => {
    const c = parse().find((x) => x.name === '算法设计与分析' && x.day === 1 && x.startNode === 1)!
    expect([c.endNode, c.startWeek, c.endWeek, c.type, c.teacher, c.room])
      .toEqual([2, 1, 12, 0, '王锐', '三教337'])
  })

  it('剥离 kcmc/tmc/croommc 的 <a> 标签', () => {
    for (const c of parse()) {
      expect(c.name).not.toContain('<')
      expect(c.name).not.toContain('javascript:')
      expect(c.teacher).not.toContain('<')
      expect(c.room).not.toContain('<')
    }
  })

  it('体育空教室保留空', () => {
    const pe = parse().find((x) => x.name === '体育3')!
    expect([pe.room, pe.teacher, pe.day, pe.endWeek]).toEqual(['', '徐义山', 2, 16])
  })

  it('周四 Linux 操作系统 9-10 节', () => {
    const c = parse().find((x) => x.name === 'Linux操作系统' && x.day === 4)!
    expect([c.startNode, c.endNode, c.endWeek]).toEqual([9, 10, 14])
  })

  it('单周: 奇数周次串 → type=1', () => {
    const src = JSON.stringify({ rows: [
      { kcmc: '测试单周课', xjc: '3', xingqi: 3, zcstr: '1,3,5,7,9', tmc: '师', croommc: '室' },
    ]})
    const c = parse(src)[0]
    expect([c.type, c.startWeek, c.endWeek]).toEqual([1, 1, 9])
  })

  it('双周: 偶数周次串 → type=2', () => {
    const src = JSON.stringify({ rows: [
      { kcmc: '测试双周课', xjc: '5', xingqi: 5, zcstr: '2,4,6,8,10,12', tmc: '', croommc: '' },
    ]})
    const c = parse(src)[0]
    expect([c.type, c.startWeek, c.endWeek]).toEqual([2, 2, 12])
  })

  it('分段周次: 1,2,3,8,9 → 两段每周', () => {
    const src = JSON.stringify({ rows: [
      { kcmc: '分段课', xjc: '1', xingqi: 1, zcstr: '1,2,3,8,9', tmc: '', croommc: '' },
    ]})
    const cs = parse(src)
    expect(cs).toHaveLength(2)
    expect([cs[0].startWeek, cs[0].endWeek]).toEqual([1, 3])
    expect([cs[1].startWeek, cs[1].endWeek]).toEqual([8, 9])
  })

  it('xjc 缺位 → rqxl 后两位回退', () => {
    const src = JSON.stringify({ rows: [
      { kcmc: '节次回退课', rqxl: '403', zcstr: '1-16', tmc: '', croommc: '' },
    ]})
    const c = parse(src)[0]
    expect([c.day, c.startNode, c.endNode]).toEqual([4, 3, 3])
  })

  it('zcstr 区间形态 "1-16"', () => {
    const src = JSON.stringify({ rows: [
      { kcmc: '区间周次课', xjc: '2', xingqi: 2, zcstr: '1-16', tmc: '', croommc: '' },
    ]})
    const c = parse(src)[0]
    expect([c.startWeek, c.endWeek]).toEqual([1, 16])
  })

  it('缺星期行跳过不崩', () => {
    const src = JSON.stringify({ rows: [
      { kcmc: '无星期课', zcstr: '1,2' },
      { kcmc: '正常课', xjc: '1', xingqi: 1, zcstr: '1,2', tmc: '', croommc: '' },
    ]})
    const cs = parse(src)
    expect(cs).toHaveLength(1)
    expect(cs[0].name).toBe('正常课')
  })

  it('非 JSON 垃圾优雅降级', () => {
    expect(new JwChaoxingParser('<html>404</html>').generateCourseList()).toHaveLength(0)
    expect(new JwChaoxingParser('').generateCourseList()).toHaveLength(0)
  })
})