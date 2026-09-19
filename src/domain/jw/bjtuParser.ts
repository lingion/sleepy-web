/**
 * JwBjtuParser — 北京交通大学教学支撑平台 HTML 课表。
 * Kotlin data/jw/JwBjtuParser.kt 1:1 移植。
 */

import { attr, parseHtmlDoc, text, type JwCourse, type JwParser } from './jwCourse'

const DOC_MARKER_PREFIX = '<!--sleepy-bjtu-doc:'
const PERIOD_LABEL_RE = /第\s*(\d+)\s*节/
const PERIOD_TIME_RE = /(\d{1,2}:\d{2})\s*[-–—~至]\s*(\d{1,2}:\d{2})/
const WEEK_FORM_RE = /第[\d,，、\s\-~—–－至到]+?周(?:\s*[（(]\s*(单|双)\s*[）)])?/g
const WEEK_NUM_RE = /(\d{1,2})(?:\s*[-~—–－至到]\s*(\d{1,2}))?/g
const FOREIGN_ANCHOR_RE = /jwglxt|xskbcx|zftal|default2\.aspx|xs_main|jqGrid/
const LOGIN_PAGE_RE = /\/client\/login\/|csrfmiddlewaretoken/
const MAX_WEEK = 30

interface WeekRun { startWeek: number; endWeek: number; type: number }
interface BlockInfo { name: string; day: number; node: number; weeksText: string; teacher: string; room: string }

export class JwBjtuParser implements JwParser {
  readonly source: string

  constructor(source: string) { this.source = source }

  generateCourseList(): JwCourse[] {
    if (!this.source.includes(DOC_MARKER_PREFIX) && FOREIGN_ANCHOR_RE.test(this.source)) return []
    const candidates: Array<{ label: string; courses: JwCourse[] }> = []
    for (const [label, body] of this.sections()) {
      if (this.isLoginLike(body)) continue
      const courses = this.parseTable(body)
      if (courses.length > 0) candidates.push({ label, courses })
    }
    candidates.sort((a, b) => a.courses.length - b.courses.length || this.sectionPriority(a.label) - this.sectionPriority(b.label))
    return candidates.at(-1)?.courses ?? []
  }

  confidence(): number {
    if (this.source.includes(DOC_MARKER_PREFIX)) return 95
    return this.hasTableAnchors(this.source) ? 92 : 0
  }

  matchedFeatures(): string[] {
    const out: string[] = []
    if (this.source.includes(DOC_MARKER_PREFIX)) out.push('bjtu:combined-doc')
    for (const [label] of this.sections()) {
      if (label === 'stuschedule') out.push('path:stuschedule')
      if (label === 'schedule') out.push('path:schedule')
    }
    if (this.source.includes('星期一')) out.push('th:星期一')
    if (PERIOD_LABEL_RE.test(this.source)) out.push('cell:第N节')
    PERIOD_LABEL_RE.lastIndex = 0
    if (PERIOD_TIME_RE.test(this.source)) out.push('cell:[HH:MM-HH:MM]')
    if (LOGIN_PAGE_RE.test(this.source)) out.push('guard:login-page')
    if (!this.source.includes(DOC_MARKER_PREFIX) && FOREIGN_ANCHOR_RE.test(this.source)) out.push('guard:foreign-anchor')
    return out
  }

  parseWeekRuns(value: string): WeekRun[] {
    const out: WeekRun[] = []
    WEEK_FORM_RE.lastIndex = 0
    for (const form of value.matchAll(WEEK_FORM_RE)) {
      const nums: Array<[number, number | null]> = []
      WEEK_NUM_RE.lastIndex = 0
      for (const m of form[0].matchAll(WEEK_NUM_RE)) nums.push([Number(m[1]), m[2] ? Number(m[2]) : null])
      if (nums.length === 0) continue
      const paritySuffix = form[1]
      const parity = paritySuffix === '单' ? 1 : paritySuffix === '双' ? 0 : -1
      const weeks = new Set<number>()
      for (const [a, b] of nums) {
        for (let w = a; w <= (b ?? a); w++) if (w >= 1 && w <= MAX_WEEK) weeks.add(w)
      }
      const filtered = [...weeks].sort((a, b) => a - b).filter((w) => parity < 0 || w % 2 === parity)
      if (filtered.length === 0) continue
      let runStart = filtered[0]
      let prev = filtered[0]
      let step = 0
      for (const week of filtered.slice(1)) {
        if (week === prev + 1 && step !== 2) { prev = week; step = 1 }
        else if (week === prev + 2 && step !== 1) { prev = week; step = 2 }
        else { out.push(makeRun(runStart, prev, step)); runStart = week; prev = week; step = 0 }
      }
      out.push(makeRun(runStart, prev, step))
    }
    return dedupeRuns(out)
  }

  dayOfWeek(value: string): number {
    const t = value.trim()
    if (t.length === 0 || t.length > 4) return 0
    const suffix: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
    for (const [key, day] of Object.entries(suffix)) if (t === `星期${key}` || t === `礼拜${key}` || t === `周${key}`) return day
    return 0
  }

  private sections(): Array<[string, string]> {
    if (!this.source.includes(DOC_MARKER_PREFIX)) return [['plain', this.source]]
    const out: Array<[string, string]> = []
    let index = this.source.indexOf(DOC_MARKER_PREFIX)
    while (index >= 0) {
      const labelStart = index + DOC_MARKER_PREFIX.length
      const arrow = this.source.indexOf('-->', labelStart)
      if (arrow < 0) break
      const next = this.source.indexOf(DOC_MARKER_PREFIX, arrow + 3)
      out.push([this.source.slice(labelStart, arrow).trim(), this.source.slice(arrow + 3, next < 0 ? this.source.length : next)])
      index = next
    }
    return out
  }

  private sectionPriority(label: string): number { return label === 'schedule' ? 2 : label === 'stuschedule' ? 1 : 0 }

  private hasTableAnchors(value: string): boolean {
    return value.includes('星期一') && PERIOD_LABEL_RE.test(value) && value.includes('周') && !FOREIGN_ANCHOR_RE.test(value)
  }

  private isLoginLike(value: string): boolean { return LOGIN_PAGE_RE.test(value) && !value.includes('星期一') }

  private parseTable(html: string): JwCourse[] {
    const doc = parseHtmlDoc(html)
    let dayStartCol = -1
    for (const tr of Array.from(doc.querySelectorAll('tr'))) {
      const cells = tableCells(tr)
      const firstDay = cells.findIndex((cell) => this.dayOfWeek(text(cell)) > 0)
      if (firstDay >= 0 && cells.length - firstDay >= 5) { dayStartCol = firstDay; break }
    }
    if (dayStartCol < 0) return []

    const infos: BlockInfo[] = []
    for (const tr of Array.from(doc.querySelectorAll('tr'))) {
      const cells = tableCells(tr)
      if (cells.length === 0) continue
      const period = PERIOD_LABEL_RE.exec(text(cells[0]))
      PERIOD_LABEL_RE.lastIndex = 0
      const node = period ? Number(period[1]) : null
      if (node === null || !Number.isFinite(node)) continue
      for (let col = dayStartCol; col < Math.min(dayStartCol + 7, cells.length); col++) {
        const day = col - dayStartCol + 1
        for (const block of cellBlocks(cells[col])) {
          const name = courseNameOf(block)
          if (!name) continue
          for (const [weeksText, teacher] of partsOf(block)) {
            infos.push({ name, day, node, weeksText, teacher, room: roomOf(block) })
          }
        }
      }
    }

    const groups = new Map<string, BlockInfo[]>()
    for (const item of infos) {
      const key = `${item.name}${item.weeksText}${item.room}${item.day}`
      const group = groups.get(key) ?? []
      group.push(item); groups.set(key, group)
    }
    const courses: JwCourse[] = []
    for (const members of groups.values()) {
      const first = members[0]
      const runs = this.parseWeekRuns(first.weeksText)
      const nodes = [...new Set(members.map((x) => x.node))].sort((a, b) => a - b)
      const segments: Array<[number, number]> = []
      for (const n of nodes) {
        const last = segments.at(-1)
        if (last && n === last[1] + 1) last[1] = n
        else segments.push([n, n])
      }
      for (const [startNode, endNode] of segments) for (const run of runs) {
        courses.push({ name: first.name, room: first.room, teacher: first.teacher, day: first.day, startNode, endNode, startWeek: run.startWeek, endWeek: run.endWeek, type: run.type })
      }
    }
    return courses
  }
}

function tableCells(tr: Element): Element[] { return Array.from(tr.children).filter((x) => x.tagName.toLowerCase() === 'th' || x.tagName.toLowerCase() === 'td') }
function cellBlocks(cell: Element): Element[] {
  const blocks = Array.from(cell.children).filter((x) => x.tagName.toLowerCase() === 'div' && text(x))
  return blocks.length > 0 ? blocks : [cell]
}
function courseNameOf(block: Element): string {
  const span = Array.from(block.querySelectorAll('span')).find((x) => !x.classList.contains('text-muted') && text(x))
  if (span) return text(span)
  const value = text(block)
  const bracket = value.indexOf(']')
  return bracket >= 0 ? value.slice(bracket + 1).trim() : value
}
function partsOf(block: Element): Array<[string, string]> {
  const title = attr(block, 'title')
  if (title.includes('周')) return [[title, teacherOf(block)]]
  const out: Array<[string, string]> = []
  for (const child of Array.from(block.children)) {
    if (child.tagName.toLowerCase() !== 'div') continue
    const value = text(child)
    if (value.includes('周')) out.push([value, Array.from(child.querySelectorAll('i')).map(text).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(',')])
  }
  return out.filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i)
}
function teacherOf(block: Element): string { return Array.from(block.querySelectorAll('i')).map(text).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(',') }
function roomOf(block: Element): string { return Array.from(block.querySelectorAll('span.text-muted')).map(text).find(Boolean) ?? '' }
function makeRun(startWeek: number, endWeek: number, step: number): WeekRun { return { startWeek, endWeek, type: step === 2 ? (startWeek % 2 === 1 ? 1 : 2) : 0 } }
function dedupeRuns(runs: WeekRun[]): WeekRun[] { return runs.filter((x, i, a) => a.findIndex((y) => y.startWeek === x.startWeek && y.endWeek === x.endWeek && y.type === x.type) === i) }
