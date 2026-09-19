/**
 * JwBoyaPpParser — 博雅研究生平台 (/pp/) 课表 JSON 解析器。
 * Kotlin data/jw/JwBoyaPpParser.kt 1:1 移植。
 *
 * 接收 {rows:[…]} / 裸数组 / {code,data:[…]} 三形态;
 * 行字段 courseName/courseTeacher[].name/classroomName/week/lessonNumber/whichWeek。
 */

import { type JwCourse, type JwParser } from './jwCourse'

/** 周次列表 → 连续段, 与 qzAppParser.weekRunsFromWeeks 语义一致 */
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

interface Prim {
  name: string
  day: number
  node: number
  week: number
  room: string
  teacher: string
}

export class JwBoyaPpParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  confidence(): number {
    return this.source.includes('"rows"') && this.source.includes('"courseName"') ? 90 : 0
  }

  matchedFeatures(): string[] {
    const hits: string[] = []
    if (this.source.includes('"rows"')) hits.push('boya_pp:rows')
    if (this.source.includes('"courseName"')) hits.push('boya_pp:courseName')
    if (this.source.includes('"whichWeek"')) hits.push('boya_pp:whichWeek')
    if (this.source.includes('"lessonNumber"')) hits.push('boya_pp:lessonNumber')
    return hits
  }

  generateCourseList(): JwCourse[] {
    const rows = this.extractRows()
    if (rows === null) return []

    const prims: Prim[] = []
    for (const el of rows) {
      if (typeof el !== 'object' || el === null) continue
      const o = el as Record<string, unknown>
      // Kotlin contentOrNull 把 boolean 也转字符串 — true/"true" 都算
      if (o['suspension'] === true || o['suspension'] === 'true') continue
      if (o['deleted'] === true || o['deleted'] === 'true') continue

      const name = strOf(o, 'courseName')
      if (!name) continue

      const day = intOf(o, 'week')
      if (day === null || day < 1 || day > 7) continue

      const node = intOf(o, 'lessonNumber')
      if (node === null || node < 1) continue

      const week = intOf(o, 'whichWeek', 'originWhichWeek')
      if (week === null) continue

      const room = strOf(o, 'classroomName') || strOf(o, 'classroomCode')
      const teacher = teacherOf(o)

      prims.push({ name, day, node, week, room, teacher })
    }
    if (prims.length === 0) return []

    // 分组 (name, day, room+teacher) → node → weeks-set
    // Kotlin Triple 结构相等 → JS 需字符串键 (JS Map 数组键按引用比较)
    const grouped = new Map<string, { name: string, day: number, room: string, teacher: string, nodeWeeks: Map<number, Set<number>> }>()
    for (const p of prims) {
      const key = `${p.name}${p.day}${p.room}${p.teacher}`
      let g = grouped.get(key)
      if (!g) {
        g = { name: p.name, day: p.day, room: p.room, teacher: p.teacher, nodeWeeks: new Map() }
        grouped.set(key, g)
      }
      let s = g.nodeWeeks.get(p.node)
      if (!s) { s = new Set(); g.nodeWeeks.set(p.node, s) }
      s.add(p.week)
    }

    const result: JwCourse[] = []
    for (const g of grouped.values()) {
      const { name, day, room, teacher } = g
      const nodes = Array.from(g.nodeWeeks.keys()).sort((a, b) => a - b)
      let i = 0
      while (i < nodes.length) {
        let j = i
        const refWeeks = g.nodeWeeks.get(nodes[i])!
        while (
          j + 1 < nodes.length &&
          nodes[j + 1] === nodes[j] + 1 &&
          setEqual(g.nodeWeeks.get(nodes[j + 1])!, refWeeks)
        ) {
          j++
        }
        const startNode = nodes[i]
        const endNode = nodes[j]
        const weeks = Array.from(refWeeks).sort((a, b) => a - b)
        for (const [sw, ew, type] of weekRuns(weeks)) {
          result.push({
            name, room, teacher, day,
            startNode, endNode,
            startWeek: sw, endWeek: ew, type,
          })
        }
        i = j + 1
      }
    }
    return result
  }

  /** 三形态 rows 抽取 */
  private extractRows(): unknown[] | null {
    let root: unknown
    try {
      root = JSON.parse(this.source.trim())
    } catch {
      return null
    }
    if (Array.isArray(root)) return root
    if (typeof root !== 'object' || root === null) return null
    const r = (root as Record<string, unknown>)['rows']
    if (Array.isArray(r)) return r
    const d = (root as Record<string, unknown>)['data']
    if (Array.isArray(d)) return d
    if (typeof d === 'object' && d !== null) {
      const inner = (d as Record<string, unknown>)['rows']
      if (Array.isArray(inner)) return inner
    }
    return null
  }
}

function strOf(o: Record<string, unknown>, k: string): string {
  const v = o[k]
  if (typeof v !== 'string') return v === undefined || v === null ? '' : String(v).trim()
  return v.trim()
}

function intOf(o: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const el = o[k]
    if (el === undefined || el === null) continue
    if (typeof el === 'number' && Number.isFinite(el)) return el
    if (typeof el === 'string') {
      const n = /^[+-]?\d+$/.test(el.trim()) ? parseInt(el.trim(), 10) : NaN
      if (!isNaN(n)) return n
    }
    if (Array.isArray(el) && el.length > 0) {
      const first = el[0]
      if (typeof first === 'number' && Number.isFinite(first)) return first
    }
  }
  return null
}

function teacherOf(o: Record<string, unknown>): string {
  const arr = o['courseTeacher']
  if (!Array.isArray(arr)) return ''
  const names: string[] = []
  for (const t of arr) {
    if (typeof t !== 'object' || t === null) continue
    const n = (t as Record<string, unknown>)['name']
    if (typeof n === 'string' && n.trim()) names.push(n.trim())
  }
  return Array.from(new Set(names)).sort().join('、')
}

function setEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}