import { describe, it, expect } from 'vitest'
import {
  exportSleepyV1File,
  exportPeriodTableShareText,
  exportPeriodTableJson,
  type PeriodTableExport,
} from './sleepyNativeExporter'
import { parseSleepyV1 } from './sleepyNativeParser'
import { DEFAULT_TIME_JSON, parseNodes } from '../timeTable'
import type { Course } from '../../data/types'

/**
 * issue#40 §6 P 行族 — Kotlin SleepyNativeParserTest + PeriodTableRoundTripTest 1:1 移植
 *
 * P (头) | Pd (预设 12 节) | Pn (逐节) — 解析恢复共享关系, 导出在 periodTable 非空时输出。
 * 旧版本 P 行走"未知行类型→dropped+warning"通道; 本版本单测锁新解析 + 导出往返。
 */

function mkCourse(p: Partial<Course> & { courseName: string }): Course {
  return {
    id: 0, groupId: p.groupId ?? '', tableId: 1, courseName: p.courseName,
    teacher: p.teacher ?? '', room: p.room ?? '', note: p.note ?? '', alias: p.alias ?? '',
    day: p.day ?? 1, startNode: p.startNode ?? 1, step: p.step ?? 2,
    startWeek: p.startWeek ?? 1, endWeek: p.endWeek ?? 16, type: p.type ?? 0,
    color: p.color ?? '#FF6750A4', colorMode: 0,
    ownTime: p.ownTime ?? false, startTime: p.startTime ?? '', endTime: p.endTime ?? '',
    isIrregularNode: false, isIrregularTime: false, credit: 0, level: 0,
  }
}

const PERIOD_EXPORT: PeriodTableExport = {
  id: 42,
  name: '春季作息',
  nodesPerDay: 12,
  timeJson: DEFAULT_TIME_JSON,
}

describe('sleepy-v1 P 行族解析 (§6, issue#40)', () => {
  it('Pd 预设: 解析产出 ParsedPeriodTable, nodesPerDay=12, timeJson 含全部 12 节', () => {
    const text = '#sleepy-v1\nP春季作息|42|12\nPd'
    const r = parseSleepyV1(text, 1, '#FF6750A4')
    expect(r.periodTable).not.toBeNull()
    expect(r.periodTable!.sourceId).toBe(42)
    expect(r.periodTable!.name).toBe('春季作息')
    expect(r.periodTable!.nodesPerDay).toBe(12)
    expect(parseNodes(r.periodTable!.timeJson)).toHaveLength(12)
  })

  it('Pn 逐节: 自定义作息, 节次时间与声明一致', () => {
    const text = '#sleepy-v1\nP夏季作息|7|8\nPn1|08:30|09:15\nPn2|09:25|10:10\nPn5|14:00|14:45'
    const r = parseSleepyV1(text, 1, '#FF6750A4')
    expect(r.periodTable).not.toBeNull()
    expect(r.periodTable!.name).toBe('夏季作息')
    expect(r.periodTable!.nodesPerDay).toBe(8)
    const nodes = parseNodes(r.periodTable!.timeJson)
    expect(nodes).toHaveLength(3)
    expect(nodes[0]).toEqual({ node: 1, start: '08:30', end: '09:15' })
  })

  it('P 头名字非法 / id 缺失 → periodTable=null + dropped + warning, 不硬拒', () => {
    const text = '#sleepy-v1\nP||12\nPn1|08:00|08:45' // 名字空
    const r = parseSleepyV1(text, 1, '#FF6750A4')
    expect(r.periodTable).toBeNull()
    expect(r.droppedLines.length).toBeGreaterThan(0)
    expect(r.warnings.some((w) => w.includes('时间节次表区块'))).toBe(true)
  })

  it('裸 P 残缺 → dropped 不硬拒 (旧版本行为)', () => {
    const text = '#sleepy-v1\nP'
    const r = parseSleepyV1(text, 1, '#FF6750A4')
    expect(r.periodTable).toBeNull()
    expect(r.droppedLines.length).toBeGreaterThan(0)
  })

  it('混合: P 区块 + 课程行 → periodTable 非空 + 课程照常落库', () => {
    const text = '#sleepy-v1\nP作息A|3|12\nPd\nC高数|1|1-2'
    const r = parseSleepyV1(text, 1, '#FF6750A4')
    expect(r.periodTable).not.toBeNull()
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].courseName).toBe('高数')
  })

  it('二次 P 头 → dropped 上报, 第一头生效', () => {
    const text = '#sleepy-v1\nP第一|1|12\nPd\nP第二|2|12'
    const r = parseSleepyV1(text, 1, '#FF6750A4')
    expect(r.periodTable).not.toBeNull()
    expect(r.periodTable!.name).toBe('第一')
    expect(r.droppedLines.length).toBeGreaterThan(0)
  })
})

describe('sleepy-v1 P 行族导出 (§6, issue#40)', () => {
  it('periodTable 非空且 Nd 预设 → 写 P 头 + Pd 行 (无 Pd 时不重复写 Pn)', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [mkCourse({ courseName: '高数' })], PERIOD_EXPORT)
    expect(out).toContain('P春季作息|42|12')
    expect(out).toContain('Pd')
    // Nd 预设时不应重复写 Pn
    expect(out).not.toContain('Pn')
  })

  it('periodTable 非空且自定义 timeJson → 写 P 头 + Pn 逐节', () => {
    const custom: PeriodTableExport = {
      id: 5, name: 'X', nodesPerDay: 3,
      timeJson: '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"09:00","end":"09:45"},{"node":3,"start":"10:00","end":"10:45"}]',
    }
    const out = exportSleepyV1File('t', '2026-03-02', 20, 3, '', [], custom)
    expect(out).toContain('PX|5|3')
    expect(out).toContain('Pn1|08:00|08:45')
    expect(out).toContain('Pn3|10:00|10:45')
  })

  it('periodTable 缺省 → 不写 P 区块 (旧版文件兼容)', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [mkCourse({ courseName: '高数' })])
    expect(out).not.toContain('Pd')
    expect(out).not.toContain('\nP')
  })

  it('纯作息导出 (share text): magic + P 头 + Pd, 无 T/C 行', () => {
    const text = exportPeriodTableShareText({ ...PERIOD_EXPORT, id: 9, name: '秋作息' })
    expect(text).toContain('<<<SLEEPY-BEGIN>>>')
    expect(text).toContain('P秋作息|9|12')
    expect(text).toContain('Pd')
    expect(text).not.toContain('\nT')
    expect(text).not.toContain('\nC')
  })

  it('纯作息导出 (json): tableInfo.timeList 形态, 节点时间字段名=startTime/endTime', () => {
    const json = exportPeriodTableJson({ ...PERIOD_EXPORT, id: 9, name: '夏作息' })
    const o = JSON.parse(json) as { name: string; tableInfo: { nodesPerDay: number; timeList: Array<{ node: number; startTime: string; endTime: string }> } }
    expect(o.name).toBe('夏作息')
    expect(o.tableInfo.nodesPerDay).toBe(12)
    expect(o.tableInfo.timeList).toHaveLength(12)
    expect(o.tableInfo.timeList[0]).toEqual({ node: 1, startTime: '08:00', endTime: '08:45' })
  })

  it('字节级往返: 导出带 periodTable → 解析回来 → periodTable 字段全部一致', () => {
    const out = exportSleepyV1File('t', '2026-03-02', 20, 12, '', [mkCourse({ courseName: '高数' })], PERIOD_EXPORT)
    const r = parseSleepyV1(out, 1, '#FF6750A4')
    expect(r.periodTable).not.toBeNull()
    expect(r.periodTable!.sourceId).toBe(42)
    expect(r.periodTable!.name).toBe('春季作息')
    expect(r.periodTable!.nodesPerDay).toBe(12)
    expect(parseNodes(r.periodTable!.timeJson)).toHaveLength(12)
  })
})