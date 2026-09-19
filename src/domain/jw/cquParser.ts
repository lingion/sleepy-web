/**
 * JwCquParser — 重庆大学 my.cqu.edu.cn 课表 JSON。
 * Kotlin data/jw/JwCquParser.kt 1:1 移植。
 *
 * source 是 my-table-detail API JSON 响应 (WebView fetch):
 * POST /api/timetable/class/timetable/student/my-table-detail?sessionId=…
 * 返回 {"classTimetableVOList":[…]}。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'
import { weekRuns } from './wiseduParser'

export class JwCquParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    let rows: unknown
    try {
      rows = (JSON.parse(this.source) as Record<string, unknown>)['classTimetableVOList']
    } catch {
      return []
    }
    if (!Array.isArray(rows)) return []

    const result: JwCourse[] = []
    for (const el of rows) {
      if (typeof el !== 'object' || el === null) continue
      const o = el as Record<string, unknown>
      const str = (k: string): string => {
        const v = o[k]
        return v === undefined || v === null ? '' : String(v).trim()
      }

      const name = str('courseName')
      if (name === '') continue

      // instructorName "张三-数学与统计学院-教授" → "张三" (首个 '-' 前段)
      const teacherRaw = str('instructorName')
      const teacher = teacherRaw === '' ? '' : teacherRaw.split('-')[0].trim()

      // position 优先 (我的课表常填), 缺位回退 roomName
      const room = str('position') !== '' ? str('position') : str('roomName')

      const day = toIntOrNull(str('weekDay'))
      if (day === null) continue

      // periodFormat "3-4" / "5" (单节起止相同); 非数字整体 → 丢弃该行
      const pf = str('periodFormat')
      let startNode: number | null
      let endNode: number
      if (pf.includes('-')) {
        startNode = toIntOrNull(pf.split('-')[0].trim())
        if (startNode === null) continue
        endNode = toIntOrNull(pf.split('-')[1].trim()) ?? startNode
      } else {
        startNode = toIntOrNull(pf.trim())
        if (startNode === null) continue
        endNode = startNode
      }

      for (const [sw, ew, type] of weekRuns(str('teachingWeek'))) {
        result.push({
          name,
          room,
          teacher,
          day: Math.min(Math.max(day, 1), 7),
          startNode: Math.max(startNode, 1),
          endNode: Math.max(endNode, startNode),
          startWeek: sw,
          endWeek: ew,
          type,
        })
      }
    }
    return result
  }

  /** classTimetableVOList = 90; my-table-detail = 80 */
  confidence(): number {
    if (this.source.includes('classTimetableVOList')) return 90
    if (this.source.includes('my-table-detail')) return 80
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('classTimetableVOList')) f.push('classTimetableVOList.rows')
    if (this.source.includes('my-table-detail')) f.push('my-table-detail')
    return f
  }
}