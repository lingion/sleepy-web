/**
 * SCU (四川大学) — Kotlin JwScuParserTest.kt 1:1 移植。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwScuParser } from './scuParser'

const HERE = import.meta.dirname

function loadJson(): string {
  return readFileSync(join(HERE, '__fixtures__', 'scu-courses.json'), 'utf8')
}

function parse(src: string = loadJson()) {
  return new JwScuParser(src).generateCourseList()
}

function tpJson(weekDescription: string, classDay = 0, classroom = 'A101', building = '一教') {
  return JSON.stringify({ dateList: [{ selectCourseList: [{
    attendClassTeacher: 'X', courseName: '单周测试',
    timeAndPlaceList: [{
      classroomName: classroom, teachingBuildingName: building,
      weekDescription, classSessions: 1, continuingSession: 2, classDay,
      campusName: '望江', coureNumber: 'X001', coureSequenceNumber: '01',
    }],
  }]}]})
}

describe('JwScuParser (scu)', () => {
  it('总条数 11 (1+1+8+1)', () => {
    expect(parse()).toHaveLength(11)
  })

  it('高等数学 字段映射 (classDay 0→1)', () => {
    const c = parse().find((x) => x.name === '高等数学')!
    expect([c.day, c.startNode, c.endNode, c.teacher, c.room, c.startWeek, c.endWeek, c.type])
      .toEqual([1, 1, 2, '王教授', '江安校区一教A楼301', 1, 16, 0])
  })

  it('大学物理 classDay 2→3', () => {
    const c = parse().find((x) => x.name === '大学物理')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek]).toEqual([3, 5, 6, 2, 15])
  })

  it('离散周 2,4,6,8,10,12,14,16 展开 8 条', () => {
    const lab = parse().filter((x) => x.name === '数据结构实验')
    expect(lab).toHaveLength(8)
    expect(lab.map((x) => x.startWeek).sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12, 14, 16])
    expect(lab.every((x) => x.startWeek === x.endWeek)).toBe(true)
  })

  it('英语口语 classDay 1→2', () => {
    const c = parse().find((x) => x.name === '英语口语')!
    expect([c.day, c.startNode, c.endNode, c.room]).toEqual([2, 9, 10, '望江校区外语楼501'])
  })

  it('weekDescription "2-15周单" → type=1 起点 2→3', () => {
    const c = parse(tpJson('2-15周单'))[0]
    expect([c.startWeek, c.endWeek, c.type]).toEqual([3, 15, 1])
  })

  it('weekDescription "1-16周（双）" → type=2 起点 1→2', () => {
    const c = parse(tpJson('1-16周（双）', 1, 'B202', '二教'))[0]
    expect([c.startWeek, c.endWeek, c.type]).toEqual([2, 16, 2])
  })

  it('confidence >=80 / 0', () => {
    expect(new JwScuParser(loadJson()).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwScuParser('{"other":{}}').confidence()).toBe(0)
  })

  it('matchedFeatures 含 selectCourseList', () => {
    expect(new JwScuParser(loadJson()).matchedFeatures()).toContain('selectCourseList')
  })
})