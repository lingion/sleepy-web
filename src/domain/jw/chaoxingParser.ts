/**
 * JwChaoxingParser — 超星学习通/综合教务管理。
 * Kotlin data/jw/JwChaoxingParser.kt 1:1 移植。
 *
 * source 是 WebView 内 fetch 组装 JSON: {rows:[{kcmc,xjc,xingqi,rqxl,zcstr,tmc,croommc}], periods:...}
 * - xingqi 优先, 缺位 rqxl/100; xjc 优先, 缺位 rqxl%100
 * - zcstr 逗号/区间/混合形态
 * - 合并: 按 (课名,星期,教师) 分组 → 节号连续段拉通, 周次取并集,
 *   同节多教室用 "/" 连接 (Android ac6a3367, 闽江师范按周换教室回归)
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

    // 合并: 按 (课名,星期,教师) 分组 → 节号连续段拉通, 周次取并集, 同节多教室 "/" 连接
    const groups = new Map<string, ChaoxingRow[]>()
    for (const r of parsed) {
      const key = [r.name, r.day, r.teacher].join('\u001f')
      const g = groups.get(key)
      if (g) g.push(r)
      else groups.set(key, [r])
    }
    const result: JwCourse[] = []
    for (const [, group] of groups) {
      const weeks = [...new Set(group.flatMap((r) => r.weeks))].sort((a, b) => a - b)
      const roomsByNode = new Map<number, string>()
      for (const [node, g] of new Map([...group.reduce((m, r) => m.set(r.node, [...(m.get(r.node) ?? []), r]), new Map<number, ChaoxingRow[]>())])) {
        roomsByNode.set(node, [...new Set(g.map((r) => r.room).filter((r) => r !== ''))].join('/'))
      }
      const nodes = [...new Set(group.map((r) => r.node))].sort((a, b) => a - b)
      const blocks: Array<[number, number]> = []
      let start = nodes[0]
      let prev = nodes[0]
      for (const n of nodes.slice(1)) {
        if (n === prev + 1) prev = n
        else {
          blocks.push([start, prev])
          start = n
          prev = n
        }
      }
      blocks.push([start, prev])
      for (const [bs, be] of blocks) {
        const room = [...new Set(
          Array.from({ length: be - bs + 1 }, (_, k) => roomsByNode.get(bs + k)).filter((r) => r !== undefined && r !== ''),
        )].join('/')
        for (const [sw, ew, type] of weekRuns(weeks)) {
          result.push({
            name: group[0].name, room, teacher: group[0].teacher,
            day: group[0].day, startNode: bs, endNode: be,
            startWeek: sw, endWeek: ew, type,
          })
        }
      }
    }
    result.sort((a, b) => a.day - b.day || a.startNode - b.startNode || a.name.localeCompare(b.name))
    return result
  }

  // chaoxing 基类无 confidence/matchedFeatures 覆写 → 默认 0
  confidence(): number { return 0 }
  matchedFeatures(): string[] { return [] }
}