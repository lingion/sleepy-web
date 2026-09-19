/**
 * JwNeuParser — 东北大学强智 mobile JSON。
 * Kotlin data/jw/JwNeuParser.kt 1:1 移植。
 *
 * x.datas.arrangedList[]: {courseName, dayOfWeek, beginSection, endSection,
 *                            weeksAndTeachers, titleDetail[], placeName}
 * weeksAndTeachers: "周次串/老师[主讲]"
 * titleDetail[1..]: "周次串 教室" 独立时间地点
 * 实验课 ([实] 前缀): 教师取 titleDetail[1] 第二段, 地点取 placeName 首段
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'
import { jwAdjustedRange } from './jwParity'

function objStr(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (v === undefined || v === null || typeof v === 'object') return ''
  return String(v).trim()
}

export class JwNeuParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  extractTeacher(s: string): string {
    if (!s) return ''
    const parts = s.split('/').map((x) => x.trim())
    const last = parts[parts.length - 1] ?? ''
    return last.replace('[主讲]', '').replace('[主讲 ', '').trim()
  }

  extractWeeksAndRooms(titleDetail: unknown, weeksAndTeachers: string): Array<[string, string]> {
    const details: Array<[string, string]> = []
    if (Array.isArray(titleDetail)) {
      for (let i = 1; i < titleDetail.length; i++) {
        const el = titleDetail[i]
        if (typeof el !== 'string') continue
        const s = el.trim()
        if (!s || !s[0]?.match(/\d/)) continue
        const parts = s.split(/\s+/).filter((x) => x)
        if (parts.length >= 2) {
          const weeks = parts[0]!.trim()
          const rawRoom = parts[parts.length - 1]!.trim()
          const room = rawRoom.endsWith('校区') ? '待定' : rawRoom
          details.push([weeks, room])
        } else if (parts.length === 1) {
          details.push([parts[0]!.trim(), ''])
        }
      }
    }
    if (details.length > 0) return details
    const fb = weeksAndTeachers.split('/')[0]?.trim() ?? ''
    return [[fb, '']]
  }

  extractLabTeacher(titleDetail: unknown): string {
    if (!Array.isArray(titleDetail)) return ''
    const el = titleDetail[1]
    if (typeof el !== 'string') return ''
    return el.trim().split(/\s+/)[1] ?? ''
  }

  extractLabWeeksAndRoom(obj: Record<string, unknown>, weeksAndTeachers: string): [string, string] {
    const rawPlace = objStr(obj, 'placeName')
    const place = rawPlace.split(/\s+/)[0] ?? ''
    const room = place.endsWith(')') ? '暂未安排教室' : place
    const weeks = weeksAndTeachers.split('[')[0]?.trim() ?? ''
    return [weeks, room]
  }

  extractParity(s: string): [number, string] {
    const parity = s.includes('单') ? 1 : s.includes('双') ? 2 : 0
    const clean = s.replace(/（/g, '(').replace(/）/g, ')').replace('(单)', '').replace('(双)', '')
    return [parity, clean]
  }

  parseWeeks(s: string): Array<[number, number]> {
    if (!s.trim()) return []
    const clean = s.replace(/周/g, '').replace('单周', '').replace('双周', '').replace('单', '').replace('双', '').trim()
    if (!clean) return []
    const out: Array<[number, number]> = []
    for (const seg of clean.split(/[,，、]/).map((x) => x.trim()).filter((x) => x)) {
      if (seg.includes('-')) {
        const parts = seg.split('-', 2).map((x) => x.trim())
        const a = toIntOrNull(parts[0])
        if (a === null) continue
        const b = toIntOrNull(parts[1]) ?? a
        out.push([a, b])
      } else {
        const v = toIntOrNull(seg)
        if (v === null) continue
        out.push([v, v])
      }
    }
    return out
  }

  generateCourseList(): JwCourse[] {
    let root: Record<string, unknown>
    try {
      root = JSON.parse(this.source) as Record<string, unknown>
    } catch {
      return []
    }
    const datas = root['datas']
    if (typeof datas !== 'object' || datas === null) return []
    const arranged = (datas as Record<string, unknown>)['arrangedList']
    if (!Array.isArray(arranged)) return []
    const out: JwCourse[] = []
    for (const el of arranged) {
      if (typeof el !== 'object' || el === null) continue
      const obj = el as Record<string, unknown>
      const name = objStr(obj, 'courseName')
      if (!name) continue
      const day = toIntOrNull(objStr(obj, 'dayOfWeek'))
      if (day === null) continue
      const begin = toIntOrNull(objStr(obj, 'beginSection'))
      if (begin === null) continue
      const end = toIntOrNull(objStr(obj, 'endSection')) ?? begin
      const weeksAndTeachers = objStr(obj, 'weeksAndTeachers')
      const titleDetail = obj['titleDetail']
      const isLab = name.startsWith('[实]')
      const entries = isLab
        ? [this.extractLabWeeksAndRoom(obj, weeksAndTeachers)]
        : this.extractWeeksAndRooms(titleDetail, weeksAndTeachers)
      const teacher = isLab ? this.extractLabTeacher(titleDetail) : this.extractTeacher(weeksAndTeachers)
      for (const [weeksStr, room] of entries) {
        if (!weeksStr) continue
        const [parity, cleanedWeeks] = this.extractParity(weeksStr)
        for (const [sw, ew] of this.parseWeeks(cleanedWeeks)) {
          const [adjustedStart, adjustedEnd] = jwAdjustedRange(sw, ew, parity)
          out.push({
            name, room, teacher,
            day,
            startNode: begin,
            endNode: end,
            startWeek: adjustedStart,
            endWeek: adjustedEnd,
            type: parity,
          })
        }
      }
    }
    return out
  }

  confidence(): number {
    if (!this.source.trim()) return 0
    try {
      const root = JSON.parse(this.source) as Record<string, unknown>
      const datas = root['datas']
      if (typeof datas === 'object' && datas !== null && Array.isArray((datas as Record<string, unknown>)['arrangedList'])) {
        return 90
      }
      return 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    return this.confidence() > 0 ? ['arrangedList'] : []
  }
}