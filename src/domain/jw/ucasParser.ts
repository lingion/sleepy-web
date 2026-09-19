import { parseHtmlDoc, text, type JwCourse, type JwParser } from './jwCourse'

export const UCAS_DETAIL_OPEN = '<!--sleepy-ucas-detail:'
export const UCAS_DETAIL_CLOSE = '<!--/sleepy-ucas-detail-->'
const DETAIL_HOST = 'https://xkcts.ucas.ac.cn:8443'
const DAY_BITS: Record<string, number> = { '10': 1, '11': 1, '100': 2, '110': 3, '1000': 4, '1010': 5, '1100': 6, '1110': 7 }
export interface WeekRun { startWeek: number; endWeek: number; type: number }
interface DetailBlock { day: number; startNode: number; endNode: number; room: string; weeks: number[] }
interface DetailPage { courseName: string; blocks: DetailBlock[] }

export class JwUcasParser implements JwParser {
  readonly source: string
  static readonly PROVISIONAL_START_WEEK = 1
  static readonly PROVISIONAL_END_WEEK = 16
  static readonly TYPE_DEFAULT = 0
  static readonly TYPE_ODD = 1
  static readonly TYPE_EVEN = 2
  static readonly DETAIL_MARKER_OPEN = UCAS_DETAIL_OPEN
  static readonly DETAIL_MARKER_CLOSE = UCAS_DETAIL_CLOSE
  constructor(source: string) { this.source = source }
  generateCourseList(): JwCourse[] { return this.parseJson() ?? this.parseHtml() }
  confidence(): number {
    if (this.source.includes('"courseTimeList"') && this.source.includes('"selectedCourse"')) return 95
    if (this.source.includes('个人课表') && this.source.includes('/course/coursetime/')) return 90
    return 0
  }
  matchedFeatures(): string[] { return [
    this.source.includes('"courseTimeList"') ? 'json:courseTimeList' : '',
    this.source.includes('"selectedCourse"') ? 'json:selectedCourse' : '',
    this.source.includes('个人课表') ? 'title:个人课表' : '',
    this.source.includes('/course/coursetime/') ? 'href:/course/coursetime/' : '',
  ].filter(Boolean) }

  static extractDetailUrls(html: string): string[] {
    const found = new Set<string>()
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\/course\/coursetime\/\d+/g)) found.add(m[0])
    for (const m of html.matchAll(/["'\s](\/course\/coursetime\/\d+)/g)) found.add(DETAIL_HOST + m[1])
    return [...found]
  }
  static parseNumberList(value: string): number[] {
    const out: number[] = []
    for (const m of value.matchAll(/(\d+)\s*(?:[-–—~至]\s*(\d+))?/g)) {
      const a = Number(m[1]); const b = m[2] ? Number(m[2]) : a
      for (let n = a; n <= b; n++) out.push(n)
    }
    return out
  }
  static splitWeekRuns(weeks: number[]): WeekRun[] {
    const sorted = [...new Set(weeks.filter((x) => x > 0))].sort((a, b) => a - b)
    if (!sorted.length) return []
    const out: WeekRun[] = []; let start = sorted[0]; let prev = start; let step = 0
    const flush = () => out.push({ startWeek: start, endWeek: prev, type: step === 2 ? (start % 2 ? 1 : 2) : 0 })
    for (const w of sorted.slice(1)) {
      if (w === prev + 1 && step !== 2) { prev = w; step = 1 }
      else if (w === prev + 2 && step !== 1) { prev = w; step = 2 }
      else { flush(); start = prev = w; step = 0 }
    }
    flush(); return out
  }

  private parseJson(): JwCourse[] | null {
    let root: any
    try {
      const objStart = this.source.indexOf('{')
      const arrStart = this.source.indexOf('[')
      const starts = [objStart, arrStart].filter((x) => x >= 0)
      const start = objStart >= 0 ? objStart : Math.min(...starts)
      if (!Number.isFinite(start)) return null
      root = JSON.parse(this.source.slice(start))
    } catch { return null }
    const list = Array.isArray(root) ? root : root?.courseTimeList ?? root?.data?.courseTimeList
    if (!Array.isArray(list)) return null
    const out: JwCourse[] = []
    for (const item of list) {
      if (!item || !String(item.courseName ?? '').trim()) continue
      const weeks = decodeWeeks(Number(item.courseWeek)); const decoded = decodeTime(Number(item.courseTime))
      if (!weeks.length || !decoded) continue
      for (const run of JwUcasParser.splitWeekRuns(weeks)) out.push({
        name: String(item.courseName).trim(), room: String(item.coursePlace ?? '').trim(), teacher: '', day: decoded[0], startNode: decoded[1], endNode: decoded[2], ...runToCourse(run),
      })
    }
    return out
  }

  private parseHtml(): JwCourse[] {
    const doc = parseHtmlDoc(this.source)
    const table = [...doc.querySelectorAll('table')].find((t) => text(t.querySelector('thead') ?? t).includes('节次/星期') && t.querySelector('a[href*="/course/coursetime/"]'))
    if (!table) return []
    const details = detailSections(this.source).map((html) => parseDetail(html)).filter((x): x is DetailPage => x !== null)
    const blocks = details.flatMap((p) => p.blocks.map((b) => [p.courseName, b] as const))
    const entries: Array<[string, number, number]> = []
    for (const row of table.querySelectorAll('tbody tr')) {
      const node = Number(nodeText(row.querySelector('th')))
      if (!Number.isFinite(node)) continue
      ;[...row.querySelectorAll(':scope > td')].forEach((cell, i) => cell.querySelectorAll('a[href*="/course/coursetime/"]').forEach((a) => {
        const name = text(a); if (name) entries.push([name, i + 1, node])
      }))
    }
    const groups = new Map<string, Array<[string, number, number]>>()
    for (const e of entries) {
      const blockIndex = blocks.findIndex(([name, b]) => name === e[0] && b.day === e[1] && e[2] >= b.startNode && e[2] <= b.endNode)
      const key = `${e[0]}${e[1]}${blockIndex}`; const g = groups.get(key) ?? []; g.push(e); groups.set(key, g)
    }
    const out: JwCourse[] = []
    for (const [key, group] of groups) {
      const [name, dayText, blockText] = key.split(''); const day = Number(dayText); const block = blocks[Number(blockText)]?.[1]
      const nodes = [...new Set(group.map((x) => x[2]))].sort((a, b) => a - b); const segments: Array<[number, number]> = []
      for (const n of nodes) { const last = segments.at(-1); if (last && n === last[1] + 1) last[1] = n; else segments.push([n, n]) }
      const runs = block ? JwUcasParser.splitWeekRuns(block.weeks) : [{ startWeek: 1, endWeek: 16, type: 0 }]
      for (const [startNode, endNode] of segments) for (const run of runs) out.push({ name, room: block?.room ?? '', teacher: '', day, startNode, endNode, ...runToCourse(run) })
    }
    return out
  }
}

function runToCourse(run: WeekRun): Pick<JwCourse, 'startWeek' | 'endWeek' | 'type'> { return run }
function nodeText(node: Element | null): string { return node?.textContent?.trim() ?? '' }
function decodeWeeks(value: number): number[] { const out: number[] = []; for (let bit = 0; value > 0; bit++, value = Math.floor(value / 2)) if (value % 2 === 1) out.push(bit + 1); return out }
function decodeTime(value: number): [number, number, number] | null {
  if (!value || value <= 0) return null
  const bits = value.toString(2); if (bits.length <= 12) return null
  const day = DAY_BITS[bits.slice(0, -12)]; if (!day) return null
  const nodes = [...bits.slice(-12)].reverse().map((x, i) => x === '1' ? i + 1 : 0).filter(Boolean)
  return nodes.length ? [day, nodes[0], nodes.at(-1)!] : null
}
function detailSections(source: string): string[] { const re = /<!--sleepy-ucas-detail:(.*?)-->(.*?)<!--\/sleepy-ucas-detail-->/gs; return [...source.matchAll(re)].map((m) => m[2]) }
function parseDetail(html: string): DetailPage | null {
  const doc = parseHtmlDoc(html); const rows = [...doc.querySelectorAll('tr')]; let name = ''
  for (const row of rows) if (nodeText(row.querySelector('th')) === '课程名称') name = nodeText(row.querySelector('td'))
  if (!name) {
    const match = html.replace(/<!--[\s\S]*?-->/g, '').match(/课程名称\s*[：:]\s*([^<\r\n]+)/)
    name = match?.[1]?.trim() ?? ''
  }
  if (!name) return null
  const blocks: DetailBlock[] = []; let time: RegExpMatchArray | null = null; let room = ''
  for (const row of rows) {
    const label = nodeText(row.querySelector('th')); const value = nodeText(row.querySelector('td'))
    if (label === '上课时间') time = value.match(/星期\s*([一二三四五六日天])\s*[：:]\s*第?\s*([\d、，,\s\-–—~至]+?)\s*节/)
    else if (label === '上课地点') room = value
    else if (label === '上课周次' && time) { const days: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }; const nodes = JwUcasParser.parseNumberList(time[2]); const weeks = JwUcasParser.parseNumberList(value); if (days[time[1]] && nodes.length && weeks.length) blocks.push({ day: days[time[1]], startNode: nodes[0], endNode: nodes.at(-1)!, room, weeks }); time = null }
  }
  return blocks.length ? { courseName: name, blocks } : null
}
