/**
 * JwSeuParser — 东南大学 (URP JSON) 课表 JSON 解析器。
 * Kotlin data/jw/JwSeuParser.kt 1:1 移植。
 *
 * 接收纯 JSON 数组或 {data:[…]} 形态; 字段 KCM/SKJS/JASMC/SKXQ/KSJC/JSJC/ZCMC。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'
import { jwAdjustedRange } from './jwParity'

function cleanNull(s: string): string {
  return s.toLowerCase() === 'null' ? '' : s
}

export class JwSeuParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  /** ZCMC 串 → [(startWeek, endWeek, type)]; 单/双周端点 jwAdjustedRange 修正 */
  parseWeekRanges(zcmc: string): Array<[number, number, number]> {
    if (!zcmc) return []
    const out: Array<[number, number, number]> = []
    const clean = zcmc.replace(/周/g, '').replace(/（/g, '(').replace(/）/g, ')')
    const segs = clean.split(/[,，]/).map((s) => s.trim()).filter((s) => s)
    for (const seg of segs) {
      let type = 0
      if (seg.includes('单')) type = 1
      else if (seg.includes('双')) type = 2
      const bare = seg.replace('(单)', '').replace('(双)', '')
      if (bare.includes('-')) {
        const parts = bare.split('-', 2).map((s) => s.trim())
        const a = toIntOrNull(parts[0])
        if (a === null) continue
        const b = toIntOrNull(parts[1]) ?? a
        const [sw, ew] = jwAdjustedRange(a, b, type)
        out.push([sw, ew, type])
      } else {
        const v = toIntOrNull(bare.trim())
        if (v === null) continue
        out.push([v, v, 0])
      }
    }
    return out
  }

  generateCourseList(): JwCourse[] {
    let root: unknown
    try {
      root = JSON.parse(this.source.trim())
    } catch {
      return []
    }
    let arr: unknown
    if (Array.isArray(root)) arr = root
    else if (root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>)['data'])) {
      arr = (root as Record<string, unknown>)['data']
    } else {
      return []
    }
    if (!Array.isArray(arr)) return []

    const result: JwCourse[] = []
    for (const el of arr) {
      if (typeof el !== 'object' || el === null) continue
      const o = el as Record<string, unknown>
      const str = (k: string): string => {
        const v = o[k]
        return v === undefined || v === null ? '' : String(v).trim()
      }
      const name = str('KCM')
      if (!name) continue
      const teacher = cleanNull(str('SKJS'))
      const room = cleanNull(str('JASMC'))
      const day = toIntOrNull(str('SKXQ'))
      if (day === null) continue
      const startNode = toIntOrNull(str('KSJC'))
      if (startNode === null) continue
      const endNode = toIntOrNull(str('JSJC')) ?? startNode
      const zcmc = str('ZCMC')
      for (const [sw, ew, type] of this.parseWeekRanges(zcmc)) {
        result.push({
          name, room, teacher,
          day: Math.min(Math.max(day, 1), 7),
          startNode: Math.max(startNode, 1),
          endNode: Math.max(endNode, startNode),
          startWeek: sw, endWeek: ew, type,
        })
      }
    }
    return result
  }

  confidence(): number {
    if (this.source.includes('"KCM"') && this.source.includes('"ZCMC"')) return 90
    if (this.source.includes('KCM') && this.source.includes('ZCMC')) return 70
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('"KCM"')) f.push('KCM')
    if (this.source.includes('"ZCMC"')) f.push('ZCMC')
    if (this.source.includes('"SKXQ"')) f.push('SKXQ')
    return f
  }
}