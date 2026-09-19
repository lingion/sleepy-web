/**
 * JwScuParser — 四川大学自建门户教务 mobile JSON。
 * Kotlin data/jw/JwScuParser.kt 1:1 移植。
 *
 * x.dateList[0].selectCourseList[].timeAndPlaceList[]: {classroomName,
 * teachingBuildingName, weekDescription, classSessions, continuingSession, classDay(0-indexed)}。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'

function objStr(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (v === undefined || v === null || typeof v === 'object') return ''
  return String(v).trim()
}

export class JwScuParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  /** 提取单/双周限定并剥净 → [parity, cleanedStr] */
  extractParity(s: string): [number, string] {
    const parity = s.includes('单') ? 1 : s.includes('双') ? 2 : 0
    const clean = s.replace(/（/g, '(').replace(/）/g, ')').replace('(单)', '').replace('(双)', '')
    return [parity, clean]
  }

  /** 周次串 (已剥单/双) → 区间列表; 剥非数字/横/逗后展开 */
  parseWeeks(s: string): Array<[number, number]> {
    if (!s.trim()) return []
    const clean = s.replace(/[^\d\-,]/g, '')
    if (!clean) return []
    const out: Array<[number, number]> = []
    for (const seg of clean.split(',').map((x) => x.trim()).filter((x) => x)) {
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
    const dateList = root['dateList']
    if (!Array.isArray(dateList) || dateList.length === 0) return []
    const first = dateList[0]
    if (typeof first !== 'object' || first === null) return []
    const selectCourseList = (first as Record<string, unknown>)['selectCourseList']
    if (!Array.isArray(selectCourseList)) return []
    const out: JwCourse[] = []
    for (const el of selectCourseList) {
      if (typeof el !== 'object' || el === null) continue
      const course = el as Record<string, unknown>
      const name = objStr(course, 'courseName')
      if (!name) continue
      const teacher = objStr(course, 'attendClassTeacher')
      const timeAndPlaceList = course['timeAndPlaceList']
      if (!Array.isArray(timeAndPlaceList)) continue
      for (const tpEl of timeAndPlaceList) {
        if (typeof tpEl !== 'object' || tpEl === null) continue
        const tp = tpEl as Record<string, unknown>
        const room = objStr(tp, 'teachingBuildingName') + objStr(tp, 'classroomName')
        const weekDesc = objStr(tp, 'weekDescription')
        const startNode = toIntOrNull(objStr(tp, 'classSessions'))
        if (startNode === null) continue
        const continuing = toIntOrNull(objStr(tp, 'continuingSession')) ?? 1
        const endNode = startNode + continuing - 1
        const rawDay = toIntOrNull(objStr(tp, 'classDay'))
        if (rawDay === null) continue
        const day = rawDay + 1 // 0-indexed Mon..Sun → 1..7
        const [parity, cleanedWeeks] = this.extractParity(weekDesc)
        for (const [sw, ew] of this.parseWeeks(cleanedWeeks)) {
          const adjustedStart = parity === 1 ? (sw % 2 === 0 ? sw + 1 : sw)
            : parity === 2 ? (sw % 2 !== 0 ? sw + 1 : sw)
            : sw
          out.push({
            name, room, teacher,
            day,
            startNode, endNode,
            startWeek: adjustedStart,
            endWeek: Math.max(ew, adjustedStart),
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
      const dl = root['dateList']
      if (Array.isArray(dl) && dl.length > 0) {
        const first = dl[0]
        if (typeof first === 'object' && first !== null && Array.isArray((first as Record<string, unknown>)['selectCourseList'])) {
          return 90
        }
      }
      return 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    return this.confidence() > 0 ? ['selectCourseList'] : []
  }
}