/**
 * JwChaoxingParser — 超星学习通/综合教务管理。
 * Kotlin data/jw/JwChaoxingParser.kt 1:1 移植。
 *
 * source 是 WebView 内 fetch 组装 JSON: {rows:[{kcmc,xjc,xingqi,rqxl,zcstr,tmc,croommc}], periods:...}
 * - xingqi 优先, 缺位 rqxl/100; xjc 优先, 缺位 rqxl%100
 * - zcstr 逗号/区间/混合形态
 * - 合并连堂: 同(name,day,room,teacher,weeks串)且 node 连续 → start..end 单条
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'

function stripHtml(s: string): string {
  if (!s.includes('<')) return s.trim()
  return s.replace(/<[^>]*>/g, '').trim()
}

function expandWeeks(zcstr: string): number[] {
  const set = new Set<number>()
  for (const part of zcstr.split(/[,，]/)) {
    const t = part.trim()
    if (!t) continue
    if (t.includes('-') || t.includes('～') || t.includes('~')) {
      const se = t.split(/[-～~]/).map((x) => toIntOrNull(x.trim()))
      if (se.length >= 2 && se[0] !== null && se[1] !== null && se[0] <= se[1]) {
        for (let w = se[0]; w <= se[1]; w++) set.add(w)
      }
    } else {
      const n = toIntOrNull(t)
      if (n !== null) set.add(n)
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}

function weekRuns(weeks: number[]): Array<[number, number, number]> {
  if (weeks.length === 0) return []
  const runs: Array<[number, number]> = []
  let start = weeks[0]
  let prev = weeks[0]
  for (let i = 1; i < weeks.length; i++) {
    const w = weeks[i]
    if (w === prev + 1) prev = w
    else {
      runs.push([start, prev])
      start = w
      prev = w
    }
  }
  runs.push([start, prev])
  if (runs.length === 1) return [[runs[0][0], runs[0][1], 0]]
  if (weeks.length >= 2 && weeks.every((w, i) => i === 0 || w - weeks[i - 1] === 2)) {
    const type = weeks[0] % 2 === 1 ? 1 : 2
    return [[weeks[0], weeks[weeks.length - 1], type]]
  }
  return runs.map(([a, b]) => [a, b, 0] as [number, number, number])
}

interface ChaoxingRow {
  name: string
  day: number
  node: number
  weeks: number[]
  room: string
  teacher: string
}

export class JwChaoxingParser implements JwParser {
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
    const rows = root['rows']
    if (!Array.isArray(rows)) return []

    const parsed: ChaoxingRow[] = []
    for (const el of rows) {
      if (typeof el !== 'object' || el === null) continue
      const o = el as Record<string, unknown>
      const str = (k: string): string => {
        const v = o[k]
        return v === undefined || v === null ? '' : String(v).trim()
      }
      const name = stripHtml(str('kcmc'))
      if (!name) continue
      const day = toIntOrNull(str('xingqi')) ?? (() => {
        const r = toIntOrNull(str('rqxl'))
        return r !== null ? Math.floor(r / 100) : null
      })()
      if (day === null || day < 1 || day > 7) continue
      const node = toIntOrNull(str('xjc')) ?? (() => {
        const r = toIntOrNull(str('rqxl'))
        return r !== null ? (r > 99 ? r % 100 : r) : null
      })()
      if (node === null) continue
      const weeks = expandWeeks(str('zcstr'))
      if (weeks.length === 0) continue
      parsed.push({ name, day, node, weeks, room: stripHtml(str('croommc')), teacher: stripHtml(str('tmc')) })
    }

    // 合并连堂
    const sorted = [...parsed].sort((a, b) => a.day - b.day || a.node - b.node || a.name.localeCompare(b.name))
    const result: JwCourse[] = []
    let i = 0
    while (i < sorted.length) {
      const cur = sorted[i]
      let endNode = cur.node
      let j = i + 1
      while (
        j < sorted.length &&
        sorted[j].name === cur.name && sorted[j].day === cur.day &&
        sorted[j].room === cur.room && sorted[j].teacher === cur.teacher &&
        sorted[j].weeks.length === cur.weeks.length &&
        sorted[j].weeks.every((w, k) => w === cur.weeks[k]) &&
        sorted[j].node === endNode + 1
      ) {
        endNode = sorted[j].node
        j++
      }
      for (const [sw, ew, type] of weekRuns(cur.weeks)) {
        result.push({
          name: cur.name, room: cur.room, teacher: cur.teacher,
          day: cur.day, startNode: cur.node, endNode,
          startWeek: sw, endWeek: ew, type,
        })
      }
      i = j
    }
    return result
  }

  // chaoxing 基类无 confidence/matchedFeatures 覆写 → 默认 0
  confidence(): number { return 0 }
  matchedFeatures(): string[] { return [] }
}