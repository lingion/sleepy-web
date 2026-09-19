/**
 * USTC (中国科学技术大学) — Kotlin JwUstcParserTest.kt 1:1 移植。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwUstcParser } from './ustcParser'

const HERE = import.meta.dirname

function loadJson(): string {
  return readFileSync(join(HERE, '__fixtures__', 'ustc-courses.json'), 'utf8')
}

function parse(src: string = loadJson()) {
  return new JwUstcParser(src).generateCourseList()
}

describe('JwUstcParser (ustc)', () => {
  it('总条数 11', () => {
    expect(parse()).toHaveLength(11)
  })

  it('高等数学A 字段映射 (lessonCode 0102)', () => {
    const c = parse().find((x) => x.name === '高等数学A')!
    expect([c.teacher, c.room, c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual(['王教授', '教二楼301', 1, 1, 2, 1, 16, 0])
  })

  it('大学物理B 单周端点修正', () => {
    const c = parse().find((x) => x.name === '大学物理B')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([3, 5, 6, 3, 15, 1])
  })

  it('离散周 8 条', () => {
    const lab = parse().filter((x) => x.name === '数据结构实验')
    expect(lab).toHaveLength(8)
    expect(lab.map((x) => x.startWeek).sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
  })

  it('双周课 type=2', () => {
    const c = parse().find((x) => x.name === '英语口语')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([2, 9, 10, 2, 16, 2])
  })

  it('room 空回退 customPlace', () => {
    const json = JSON.stringify({ studentTableVm: { activities: [{
      courseName: '线上课', campus: null, customPlace: '线上', room: null,
      teachers: ['吴老师'], weeksStr: '1-8', weekday: 3, startDate: '08:00', endDate: '09:40',
      lessonCode: '0102',
    }]}})
    expect(parse(json)[0].room).toBe('线上')
  })

  it('teachers 数组空格连接', () => {
    const json = JSON.stringify({ studentTableVm: { activities: [{
      courseName: '联合授课', campus: 'x', customPlace: null, room: 'r',
      teachers: ['张老师', '王老师'], weeksStr: '1-16', weekday: 1,
      startDate: '08:00', endDate: '09:40', lessonCode: '0102',
    }]}})
    expect(parse(json)[0].teacher).toBe('张老师 王老师')
  })

  it('lessonCode 不合式 → 时间推断兜底', () => {
    const json = JSON.stringify({ studentTableVm: { activities: [{
      courseName: '机器学习', campus: '高新园区', customPlace: null, room: '电三楼201',
      teachers: ['周老师'], weeksStr: '1-16', weekday: 2,
      startDate: '08:00', endDate: '09:40', lessonCode: 'X-77',
    }]}})
    const c = parse(json)[0]
    expect([c.startNode, c.endNode]).toEqual([1, 2])
  })

  it('lessonCode 全缺 → 时间推断兜底', () => {
    const json = JSON.stringify({ studentTableVm: { activities: [{
      courseName: '学术道德', campus: null, customPlace: '线上', room: null,
      teachers: ['吴老师'], weeksStr: '6-9', weekday: 5,
      startDate: '19:00', endDate: '20:50',
    }]}})
    const c = parse(json)[0]
    expect([c.startNode, c.endNode]).toEqual([9, 10])
  })

  it('confidence >=80 / 0', () => {
    expect(new JwUstcParser(loadJson()).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwUstcParser('{"other":{}}').confidence()).toBe(0)
  })

  it('matchedFeatures 含 studentTableVm', () => {
    expect(new JwUstcParser(loadJson()).matchedFeatures()).toContain('studentTableVm')
  })
})