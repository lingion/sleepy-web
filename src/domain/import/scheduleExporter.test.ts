/**
 * ScheduleExporter 回归 — Kotlin 测试 1:1 移植
 * 蓝本: ExportImportRoundTripTest.kt / ExportNodesRoundTripTest.kt
 * (导出→导入闭环矩阵: 三格式 shareText/JSON/ICS 全部无损)
 */
import { describe, expect, it } from 'vitest'
import {
  exportWakeUpJson,
  exportWakeUpShareText,
  exportIcs,
  type ExportTable,
  type ExportCourse,
} from './scheduleExporter'
import { parseSchedule, type ParseResult } from './scheduleParser'
import { parseNodes } from '../timeTable'

function parse(text: string, tableId = 999): ParseResult {
  const r = parseSchedule(text, tableId)
  if (!r.ok) throw r.error
  return r.value
}

/** Kotlin ExportImportRoundTripTest: 真实 HEU 课表 */
function heuTable(): ExportTable {
  return {
    id: 1,
    name: '2026 春学期',
    startDate: '2026-02-23',
    maxWeek: 18,
    nodesPerDay: 13,
    timeJson: '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:50","end":"09:35"}]',
    color: '#FF6750A4',
  }
}

function heuCourses(): ExportCourse[] {
  return [
    {
      id: 0, groupId: '', tableId: 1, courseName: '工科数学分析（二）', alias: '',
      teacher: '王立刚', room: '21B2086中(西)', note: '',
      day: 2, startNode: 3, step: 3,
      startWeek: 2, endWeek: 8, type: 0, color: '#FF6750A4',
      ownTime: false, startTime: '', endTime: '',
    },
    {
      id: 0, groupId: '', tableId: 1, courseName: '军事理论', alias: '',
      teacher: '刁莹', room: '21B0117中(东)', note: '',
      day: 2, startNode: 6, step: 2,
      startWeek: 2, endWeek: 18, type: 0, color: '#FF6750A4',
      ownTime: false, startTime: '', endTime: '',
    },
  ]
}

describe('ExportImportRoundTripTest: HEU 课表三格式闭环', () => {
  it('shareText 往返全字段', () => {
    const exported = exportWakeUpShareText(heuTable(), heuCourses())
    const parsed = parse(exported)
    expect(parsed.courses).toHaveLength(2)
    expect(parsed.courses[0].courseName).toBe('工科数学分析（二）')
    expect(parsed.courses[0].teacher).toBe('王立刚')
    expect(parsed.courses[0].day).toBe(2)
    expect(parsed.courses[0].startNode).toBe(3)
    expect(parsed.courses[0].step).toBe(3)
    expect(parsed.courses[0].startWeek).toBe(2)
    expect(parsed.courses[0].endWeek).toBe(8)
  })

  it('JSON 往返课程数', () => {
    const exported = exportWakeUpJson(heuTable(), heuCourses())
    const parsed = parse(exported)
    expect(parsed.courses).toHaveLength(2)
  })

  it('ICS 往返课程数', () => {
    const exported = exportIcs(heuTable(), heuCourses())
    const parsed = parse(exported)
    expect(parsed.courses).toHaveLength(2)
  })
})

// ---- ExportNodesRoundTripTest: 13 节无损闭环矩阵 ----

/** 13 节课表: 作息声明含 13(稀疏: 只存 1/12/13 三个锚点), 课程实际到达 13 */
function table13(): ExportTable {
  return {
    id: 1,
    name: '13节表',
    startDate: '2026-02-23',
    maxWeek: 18,
    nodesPerDay: 13,
    timeJson: '[{"node":1,"start":"08:00","end":"08:45"},{"node":12,"start":"21:00","end":"21:45"},{"node":13,"start":"21:50","end":"22:35"}]',
    color: '#FF6750A4',
  }
}

function courses13(): ExportCourse[] {
  return [
    {
      id: 0, groupId: '', tableId: 1, courseName: '补实验', alias: '',
      teacher: '李平', room: '11#2003', note: '',
      day: 4, startNode: 11, step: 3,
      startWeek: 6, endWeek: 6, type: 0, color: '#FF6750A4',
      ownTime: false, startTime: '', endTime: '',
    },
  ]
}

function assertNodes13(parsed: ParseResult, fmt: string): void {
  expect(parsed.courses[0].startNode, `[${fmt}] startNode=11 全保真`).toBe(11)
  expect(parsed.courses[0].step, `[${fmt}] step=3 全保真`).toBe(3)
  expect(parsed.nodesPerDay, `[${fmt}] 13 节往返后仍是 13`).toBe(13)
}

describe('ExportNodesRoundTripTest: 13 节三格式无损', () => {
  it('shareText 往返 13 节', () => {
    const parsed = parse(exportWakeUpShareText(table13(), courses13()))
    assertNodes13(parsed, 'shareText')
  })

  it('JSON 往返 13 节且 timeJson 不缩水', () => {
    const parsed = parse(exportWakeUpJson(table13(), courses13()))
    assertNodes13(parsed, 'json')
    expect(parsed.timeJson).not.toBe('')
    const nodes = parseNodes(parsed.timeJson)
    expect(Math.max(...nodes.map((n) => n.node)), '[json] 第13节不得丢').toBe(13)
  })

  it('ICS 往返 13 节', () => {
    const parsed = parse(exportIcs(table13(), courses13()))
    expect(parsed.courses.length).toBeGreaterThan(0)
    assertNodes13(parsed, 'ics')
  })
})

// ---- 导出格式形态锚(直接断言导出文本结构, 防 regression) ----

describe('导出文本形态', () => {
  it('shareText 带分享前后缀 + URL 编码 + 号', () => {
    const s = exportWakeUpShareText(table13(), courses13())
    expect(s.startsWith('【来自Sleepy】\n课程分享：\n\n')).toBe(true)
    expect(s).toContain('"courseDetailJson"')
    expect(s).toContain('%7B') // 编码过的 {
    // URL 编码语义: 空格→+
    expect(s).not.toContain('%20')
  })

  it('JSON 带完整 tableInfo.time', () => {
    const s = exportWakeUpJson(table13(), courses13())
    const obj = JSON.parse(s) as { tableInfo: { time: string; nodesPerDay: number } }
    expect(obj.tableInfo.nodesPerDay).toBe(13)
    expect(obj.tableInfo.time).toContain('"node":13')
  })

  it('ICS 结构锚: PRODID/RRULE/DESCRIPTION节次/UID', () => {
    const s = exportIcs(table13(), courses13())
    expect(s).toContain('BEGIN:VCALENDAR')
    expect(s).toContain('PRODID:-//Sleepy//课程表//ZH')
    expect(s).toContain('RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=')
    expect(s).not.toContain('INTERVAL=2') // type=0 每周
    expect(s).toContain('DESCRIPTION:第11 - 13节')
    expect(s).toContain('@sleepy')
    expect(s).toContain('SUMMARY:补实验')
    expect(s).toContain('LOCATION:11#2003')
    expect(s.endsWith('END:VCALENDAR')).toBe(true)
  })

  it('ICS 单双周 INTERVAL=2', () => {
    const course: ExportCourse = {
      ...courses13()[0],
      type: 2, // 双周
      startWeek: 2, endWeek: 8,
    }
    const s = exportIcs(table13(), [course])
    expect(s).toContain('INTERVAL=2')
  })

  it('ICS 单双周起始周奇偶不符时对齐到第一个实际发生周', () => {
    // type=1 单周但 startWeek=2(偶) → 导出事件应从周 3 开始
    const course: ExportCourse = {
      ...courses13()[0],
      type: 1,
      startWeek: 2, endWeek: 8,
    }
    const s = exportIcs(table13(), [course])
    const m = /DTSTART:(\d{8})T/.exec(s)
    expect(m).not.toBeNull()
    const date = m![1]
    // 2026-02-23 是周一; type=1 首实际周=3 → 周四 = 02-23 + 14 + 3 = 2026-03-12
    expect(date).toBe('20260312')
  })

  it('ICS ownTime 课程用自带钟点', () => {
    const course: ExportCourse = {
      ...courses13()[0],
      ownTime: true, startTime: '18:30', endTime: '21:00',
    }
    const s = exportIcs(table13(), [course])
    expect(s).toContain('DTSTART:20260402T183000')
    expect(s).toContain('DTEND:20260402T210000')
    // ownTime 行写进 DESCRIPTION
    expect(s).toContain('\\n18:30-21:00')
  })

  it('ICS escapeIcs: 逗号/分号/反斜杠转义', () => {
    const course: ExportCourse = {
      ...courses13()[0],
      courseName: 'A,B;C\\D',
      room: 'X,Y',
    }
    const s = exportIcs(table13(), [course])
    expect(s).toContain('SUMMARY:A\\,B\\;C\\\\D')
    expect(s).toContain('LOCATION:X\\,Y')
  })
})
