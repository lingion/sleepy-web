/**
 * JwZjuParser — 浙江大学正方新版 UGR 课表 JSON。
 * Kotlin data/jw/JwZjuParser.kt 1:1 移植。
 *
 * zdbk.zju.edu.cn searchTimetable kbList[]: {xkkh,xqj,dsz,djj,skcd,kcb,xxq};
 * kcb = "课名<br>周次串<br>老师<br>教室" HTML 片段 (zwf 截断)。
 * dsz: "0"单/"1"双/"2"每周。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'
import { jwAdjustedRange } from './jwParity'

function objStr(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  if (v === undefined || v === null || typeof v === 'object') return ''
  return String(v).trim()
}

export class JwZjuParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    let root: Record<string, unknown>
    try {
      root = JSON.parse(this.source) as Record<string, unknown>
    } catch {
      return []
    }
    const kbList = root['kbList']
    if (!Array.isArray(kbList)) return []
    const out: JwCourse[] = []
    for (const el of kbList) {
      if (typeof el !== 'object' || el === null) continue
      const obj = el as Record<string, unknown>
      const xqj = toIntOrNull(objStr(obj, 'xqj'))
      if (xqj === null) continue
      const dsz = objStr(obj, 'dsz')
      const type = dsz === '0' ? 1 : dsz === '1' ? 2 : 0
      const djj = toIntOrNull(objStr(obj, 'djj'))
      if (djj === null) continue
      const skcd = toIntOrNull(objStr(obj, 'skcd')) ?? 1
      const rawKcb = objStr(obj, 'kcb')
      const kcb = rawKcb.split('zwf')[0].split('<br>')
      if (kcb.length === 0) continue
      const name = (kcb[0] ?? '').replace(/\(/g, '（').replace(/\)/g, '）').trim()
      if (!name) continue
      const timeString = (kcb[1] ?? '').trim()
      const teacher = (kcb[2] ?? '').trim()
      const location = (kcb[3] ?? '').trim()
      for (const [startW, endW] of this.parseWeekSegments(timeString)) {
        const [sw, ew] = jwAdjustedRange(startW, endW, type)
        out.push({
          name, room: location, teacher,
          day: xqj,
          startNode: djj,
          endNode: djj + skcd - 1,
          startWeek: sw, endWeek: ew, type,
        })
      }
    }
    return out
  }

  /** "1-16周" → [(1,16)]; "2,4,6周" → [(2,2),(4,4),(6,6)]; 剥周/(单)/(双) */
  parseWeekSegments(s: string): Array<[number, number]> {
    if (!s.trim()) return []
    const clean = s.replace(/周/g, '').replace('(单)', '').replace('(双)', '').trim()
    const out: Array<[number, number]> = []
    for (const seg of clean.split(/[,，]/).map((x) => x.trim()).filter((x) => x)) {
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

  confidence(): number {
    if (!this.source.trim()) return 0
    try {
      const root = JSON.parse(this.source) as Record<string, unknown>
      return Array.isArray(root['kbList']) ? 90 : 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    try {
      const root = JSON.parse(this.source) as Record<string, unknown>
      return Array.isArray(root['kbList']) ? ['kbList'] : []
    } catch {
      return []
    }
  }
}