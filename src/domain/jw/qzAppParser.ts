/**
 * JwQzAppParser — Kotlin data/jw/JwQzAppParser.kt 1:1 移植 (强智移动教务 qz_app)
 * source = 移动端 JSON API 响应: {data:[{date,courses}]} 或逐周合并 {"weeks":[…]}。
 * classTime 编码 "10304"=周一3-4节; classWeek 区间串带洞拆段, 等差2压缩单双周。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'

export class JwQzAppParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    let root: Record<string, unknown>
    try {
      root = JSON.parse(this.source) as Record<string, unknown>
    } catch {
      return result
    }
    const grids = extractGrids(root)
    const seen = new Set<string>()
    for (const grid of grids) {
      const rows = grid['courses']
      if (!Array.isArray(rows)) continue
      for (const el of rows) {
        if (!el || typeof el !== 'object' || Array.isArray(el)) continue
        const o = el as Record<string, unknown>
        // 逐周抓取同一行重复出现 — 完全相同的行只展开一次
        const dedupKey = JSON.stringify(o)
        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)
        const str = (k: string): string => (o[k] === undefined || o[k] === null ? '' : String(o[k]).trim())

        const name = str('courseName')
        if (name === '') continue
        const teacher = str('teacherName')
        const room = [str('classroomNub'), str('classroomName'), str('location')].find((s) => s !== '') ?? ''
        const timeSpecs = parseClassTime(str('classTime'))
        if (timeSpecs.length === 0) continue
        const weeks = parseWeekSpec(str('classWeek') === '' ? str('classWeekDetails') : str('classWeek'))

        for (const [day, startNode, endNode] of timeSpecs) {
          for (const [sw, ew, type] of weekRunsFromWeeks(weeks)) {
            result.push({ name, room, teacher, day, startNode, endNode, startWeek: sw, endWeek: ew, type })
          }
        }
      }
    }
    return result
  }

  confidence(): number {
    const s = this.source
    if (s.includes('"classWeekDetails"') && s.includes('"classTime"')) return 90
    if (s.includes('"classWeek"') && s.includes('"classTime"')) return 85
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('"classWeekDetails"')) f.push('classWeekDetails')
    if (this.source.includes('"classTime"')) f.push('classTime')
    if (this.source.includes('"courses":[')) f.push('courses[]')
    if (this.source.includes('"code"') && this.source.includes('"Msg"')) f.push('code/Msg envelope')
    return f
  }
}

/** 提取网格: weeks 信封优先, 退回 data[...] */
function extractGrids(root: Record<string, unknown>): Record<string, unknown>[] {
  const weeks = root['weeks']
  if (Array.isArray(weeks)) {
    return weeks
      .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object' && !Array.isArray(w))
      .flatMap((w) => {
        const data = w['data']
        return Array.isArray(data)
          ? data.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d))
          : []
      })
  }
  const data = root['data']
  if (!Array.isArray(data)) return []
  return data.filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && !Array.isArray(d))
}

/**
 * classTime 编码 → [(day, start, end)]。
 * "10304" → [(1,3,4)]; "301020304" → [(3,1,2),(3,3,4)]; 首位=星期, 余 2 位一对。
 */
export function parseClassTime(v: string): Array<[number, number, number]> {
  if (v === '' || !/^\d+$/.test(v)) return []
  const day = v.charCodeAt(0) - 48
  if (day < 1 || day > 7) return []
  const rest = v.substring(1)
  if (rest.length % 2 !== 0 || rest === '') return []
  const specs: Array<[number, number, number]> = []
  let i = 0
  while (i < rest.length) {
    const start = toIntOrNull(rest.substring(i, i + 2))
    if (start === null) return []
    const end =
      i + 4 <= rest.length
        ? toIntOrNull(rest.substring(i + 2, i + 4)) ?? start
        : start
    if (start < 1 || end < start) return []
    specs.push([day, start, end])
    i += 4
  }
  return specs
}

/** "1-4,6-19" → 周次列表; 带洞/单周混合, 域外忽略 */
export function parseWeekSpec(spec: string): number[] {
  const weeks = new Set<number>()
  for (const token of spec.split(',')) {
    const t = token.trim()
    if (t === '') continue
    const range = /^(\d+)-(\d+)$/.exec(t)
    if (range) {
      const lo = toIntOrNull(range[1])
      const hi = toIntOrNull(range[2])
      if (lo === null || hi === null) continue
      if (lo >= 1 && lo <= 30 && hi >= lo && hi <= 30) {
        for (let w = lo; w <= hi; w++) weeks.add(w)
      }
    } else {
      const one = /^(\d+)$/.exec(t)
      const v = one ? toIntOrNull(one[1]) : null
      if (v !== null && v >= 1 && v <= 30) weeks.add(v)
    }
  }
  return [...weeks].sort((a, b) => a - b)
}

/** 周次列表 → 连续段 (与 wisedu weekRuns 同语义, 输入为列表) */
export function weekRunsFromWeeks(weeks: number[]): Array<[number, number, number]> {
  if (weeks.length === 0) return []
  const runs: Array<[number, number]> = []
  let start = weeks[0]
  let prev = weeks[0]
  for (let i = 1; i < weeks.length; i++) {
    const w = weeks[i]
    if (w === prev + 1) {
      prev = w
    } else {
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
