/**
 * JwUstcParser — 中国科学技术大学新版自研教务 JSON。
 * Kotlin data/jw/JwUstcParser.kt 1:1 移植。
 *
 * x.studentTableVm.activities[]: {courseName, room, building, teachers[],
 *                                  weeksStr, weekday, lessonCode, startDate, endDate, ...}
 * lessonCode 4 位定宽: 1-2 位 startNode, 3-4 位 endNode (缺失时 startDate/endDate 推断)。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'
import { jwAdjustedRange } from './jwParity'

function objStr(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (v === undefined || v === null || typeof v === 'object') return ''
  return String(v).trim()
}

function inferNodesFromTime(startDate: string, endDate: string): [number, number] | null {
  const parseHHmm = (s: string): number | null => {
    const parts = s.split(':')
    const h = toIntOrNull(parts[0]?.trim() ?? '')
    const m = toIntOrNull(parts[1]?.trim() ?? '')
    if (h === null || m === null || h < 0 || h > 23 || m < 0 || m > 59) return null
    return h * 60 + m
  }
  const startMins = parseHHmm(startDate)
  const endMins = parseHHmm(endDate)
  if (startMins === null || endMins === null) return null
  const slots: Array<[number, number]> = [
    [8 * 60, 1],
    [10 * 60 + 10, 3],
    [14 * 60, 5],
    [16 * 60 + 10, 7],
    [19 * 60, 9],
  ]
  const nodeOf = (mins: number): number | null => {
    for (const [slotMins, node] of slots) {
      if (Math.abs(mins - slotMins) <= 10) return node
    }
    return null
  }
  const startNode = nodeOf(startMins)
  if (startNode === null) return null
  const endNode = Math.max(nodeOf(endMins) ?? (startNode + 1), startNode)
  return [startNode, endNode]
}

export class JwUstcParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  /** weeksStr "1-16" / "2-15单" / "1-16双" → [type, cleanedStr] */
  parseWeeksType(s: string): [number, string] {
    if (s.includes('单')) return [1, s.replace(/单/g, '').trim()]
    if (s.includes('双')) return [2, s.replace(/双/g, '').trim()]
    return [0, s.trim()]
  }

  parseWeekSegments(s: string): Array<[number, number]> {
    if (!s.trim()) return []
    const out: Array<[number, number]> = []
    for (const seg of s.split(/[,，]/).map((x) => x.trim()).filter((x) => x)) {
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
    const tableVm = root['studentTableVm']
    if (typeof tableVm !== 'object' || tableVm === null) return []
    const activities = (tableVm as Record<string, unknown>)['activities']
    if (!Array.isArray(activities)) return []
    const out: JwCourse[] = []
    for (const el of activities) {
      if (typeof el !== 'object' || el === null) continue
      const obj = el as Record<string, unknown>
      const name = objStr(obj, 'courseName')
      if (!name) continue
      const room = objStr(obj, 'room') || objStr(obj, 'customPlace')
      const teachers = obj['teachers']
      let teacher = objStr(obj, 'teachers')
      if (Array.isArray(teachers)) {
        teacher = teachers.map((t) => typeof t === 'string' ? t.trim() : '').filter((t) => t).join(' ')
      }
      // lessonCode 4 位定宽
      const lc = objStr(obj, 'lessonCode')
      let startNode = 0
      let endNode = 0
      if (lc.length >= 4 && /^\d{4}$/.test(lc)) {
        startNode = toIntOrNull(lc.substring(0, 2)) ?? 0
        endNode = toIntOrNull(lc.substring(2, 4)) ?? startNode
      }
      if (startNode <= 0) {
        const inferred = inferNodesFromTime(objStr(obj, 'startDate'), objStr(obj, 'endDate'))
        if (!inferred) continue
        ;[startNode, endNode] = inferred
      }
      const weekday = toIntOrNull(objStr(obj, 'weekday'))
      if (weekday === null) continue
      const weeksStr = objStr(obj, 'weeksStr')
      if (!weeksStr) continue
      const [type, cleanStr] = this.parseWeeksType(weeksStr)
      for (const [segStart, segEnd] of this.parseWeekSegments(cleanStr)) {
        const [sw, ew] = jwAdjustedRange(segStart, segEnd, type)
        out.push({
          name, room, teacher,
          day: weekday,
          startNode, endNode,
          startWeek: sw, endWeek: ew, type,
        })
      }
    }
    return out
  }

  confidence(): number {
    if (!this.source.trim()) return 0
    try {
      const root = JSON.parse(this.source) as Record<string, unknown>
      return typeof root['studentTableVm'] === 'object' && root['studentTableVm'] !== null ? 90 : 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    try {
      const root = JSON.parse(this.source) as Record<string, unknown>
      return typeof root['studentTableVm'] === 'object' && root['studentTableVm'] !== null ? ['studentTableVm'] : []
    } catch {
      return []
    }
  }
}