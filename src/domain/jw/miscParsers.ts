/**
 * CF(青果/乘方) + PKU(北大) + BNUZ(北师珠) + URP 双代 + HNUST — Kotlin 同名解析器 1:1 移植
 */

import {
  parseHtmlDoc, getElementsByTag, getElementById, getElementsByClass,
  text, attr, toIntOrNull,
  type JwCourse, type JwParser,
} from './jwCourse'

// ── 共享: weekIntList2WeekBeanList (JwChengFangParser companion, URP/网格变体复用) ──

/**
 * 周次数组归并 → (start, end, type)[]
 * Kotlin JwChengFangParser.weekIntList2WeekBeanList 逐行同构:
 * gap=1 连续每周; gap=2 且首项奇=单周/偶=双周; 其他断段。
 */
export function weekIntList2WeekBeanList(input: number[]): Array<[number, number, number]> {
  if (input.length === 0) return []
  const a = [...input].sort((x, y) => x - y)
  let reset = 0
  let start = 0
  let end = 0
  let type = -1
  const list: Array<[number, number, number]> = []
  const flush = () => {
    list.push([start, end, type])
    type = -1
    reset = 0
  }
  for (let i = 0; i < a.length; i++) {
    if (reset === 1) flush()
    if (i < a.length - 1) {
      const gap = a[i + 1] - a[i]
      if (type === -1) {
        start = a[i]
        if (gap === 1) {
          type = 0
          end = a[i + 1]
        } else if (gap === 2) {
          type = a[i] % 2 !== 0 ? 1 : 2
          end = a[i + 1]
        } else {
          end = a[i]
          type = 0
          reset = 1
        }
      } else if (type === 0 && gap === 1) {
        end = a[i + 1]
      } else if ((type === 1 || type === 2) && gap === 2) {
        end = a[i + 1]
      } else {
        reset = 1
      }
    }
    if (i === a.length - 1) {
      if (type === -1) {
        start = a[i]
        end = a[i]
        type = 0
      }
      list.push([start, end, type])
    }
  }
  return list
}

// ── JwChengFangParser (cf) ───────────────────────────────────────────────

/** 从 HTML 抠 var kbxx = [...] — 字符串感知括号配对 (① 有意偏离: 不截断分号) */
export function extractKbxxJson(html: string): string | null {
  const marker = 'var kbxx'
  const idx = html.indexOf(marker)
  if (idx < 0) return null
  let arrStart = idx + marker.length
  while (arrStart < html.length && html[arrStart] !== '[') arrStart++
  if (arrStart >= html.length) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = arrStart; i < html.length; i++) {
    const c = html[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) return html.substring(arrStart, i + 1)
    }
  }
  return null
}

export class JwChengFangParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    const json = extractKbxxJson(this.source)
    if (!json) return result
    let arr: Record<string, unknown>[]
    try {
      arr = JSON.parse(json) as Record<string, unknown>[]
    } catch {
      return result
    }
    for (const o of arr) {
      const name = String(o['kcmc'] ?? '').trim()
      if (name === '') continue
      const teacher = String(o['teaxms'] ?? '').trim()
      const room = String(o['jxcdmcs'] ?? '').trim()
      const day = toIntOrNull(String(o['xq'] ?? '').trim())
      if (day === null) continue
      const jcdm2 = String(o['jcdm2'] ?? '').trim()
      if (jcdm2 === '') continue
      const nodes = jcdm2.split(',').map((x) => toIntOrNull(x.trim())).filter((v): v is number => v !== null)
      if (nodes.length === 0) continue
      const startNode = nodes[0]
      const step = nodes[nodes.length - 1] - startNode + 1
      const zcs = String(o['zcs'] ?? '').trim()
      if (zcs === '') continue
      const weekList = zcs.split(',').map((x) => toIntOrNull(x.trim())).filter((v): v is number => v !== null)
      if (weekList.length === 0) continue
      for (const [wb0, wb1, wb2] of weekIntList2WeekBeanList(weekList)) {
        result.push({
          name, room, teacher,
          day: Math.min(Math.max(day, 1), 7),
          startNode: Math.max(startNode, 1),
          endNode: Math.max(startNode + step - 1, startNode),
          startWeek: Math.max(wb0, 1),
          endWeek: Math.max(wb1, wb0),
          type: wb2,
        })
      }
    }
    return result
  }

  /** var kbxx + CF 字段四件套 = 100; 仅 var kbxx = 70 */
  confidence(): number {
    if (!this.source.includes('var kbxx')) return 0
    const hasFields =
      this.source.includes('kcmc') &&
      (this.source.includes('teaxms') || this.source.includes('jxcdmcs') || this.source.includes('jcdm2'))
    return hasFields ? 100 : 70
  }

  matchedFeatures(): string[] {
    if (!this.source.includes('var kbxx')) return []
    const f = ['var kbxx']
    if (this.source.includes('kcmc')) f.push('字段=kcmc')
    if (this.source.includes('teaxms')) f.push('字段=teaxms')
    if (this.source.includes('jxcdmcs')) f.push('字段=jxcdmcs')
    if (this.source.includes('jcdm2')) f.push('字段=jcdm2')
    return f
  }
}

// ── JwPekingParser (pku) ─────────────────────────────────────────────────

/** 上游 Common.nodePattern1 原文, 不可改字符 */
const NODE_PATTERN1 = /\d{1,2}[~]*\d*节/
const CHINESE_WEEK_LIST = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']

export class JwPekingParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    const doc = parseHtmlDoc(this.source)
    const table = doc.querySelector('table[class="datagrid"]')
    if (!table) return result
    const tbody = table.querySelector('tbody')
    if (!tbody) return result

    let teacher = ''
    for (const tr of getElementsByTag(tbody, 'tr')) {
      const tds = getElementsByTag(tr, 'td')
      if (tds.length < 11) continue
      if (text(tds[8]).includes('未')) continue
      const courseName = text(tds[0])
      teacher = text(tds[4])

      let startWeek = 1
      let endWeek = 16
      let startNode = 1
      let endNode = 2
      let type = 0
      let day = 7

      const timeBlocks = tds[7].innerHTML.split('<br>')
      for (const block of timeBlocks) {
        const timeInfo = text(parseHtmlDoc(block).body)
          .split(' ')
          .filter((s) => s !== '')
        if (timeInfo.length < 2) continue
        const token0 = timeInfo[0]
        if (token0.includes('~')) {
          const sw = toIntOrNull(token0.split('~')[0].replace(/\D/g, ''))
          if (sw !== null) startWeek = sw
          const ew = toIntOrNull(token0.split('~')[1]?.split('周')[0].replace(/\D/g, '') ?? '')
          if (ew !== null) endWeek = ew
        }
        type = timeInfo[1].includes('单') ? 1 : timeInfo[1].includes('双') ? 2 : 0
        for (let index = 1; index < CHINESE_WEEK_LIST.length; index++) {
          if (timeInfo[1].includes(CHINESE_WEEK_LIST[index])) {
            day = index
            break
          }
        }
        const m = NODE_PATTERN1.exec(timeInfo[1])
        if (m) {
          const v = m[0]
          const sn = toIntOrNull(v.split('~')[0].replace(/\D/g, ''))
          if (sn !== null) startNode = sn
          const en = toIntOrNull(v.split('~')[1]?.split('节')[0].replace(/\D/g, '') ?? '')
          if (en !== null) endNode = en
        }
        const room = timeInfo.length >= 3 ? timeInfo[2] : parenInner(timeInfo[1])
        result.push({
          name: courseName,
          day,
          startNode: Math.max(startNode, 1),
          endNode: Math.max(endNode, startNode),
          startWeek: Math.max(startWeek, 1),
          endWeek: Math.max(endWeek, startWeek),
          type,
          teacher,
          room,
        })
      }
    }
    return result
  }

  confidence(): number {
    try {
      const doc = parseHtmlDoc(this.source)
      if (doc.querySelector('table[class="datagrid"]')) return 100
      if (this.source.includes('elective.pku')) return 90
      return 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('datagrid')) f.push('class=datagrid')
    if (this.source.includes('elective.pku')) f.push('URL=elective.pku')
    return f
  }
}

function parenInner(s: string): string {
  const open = s.indexOf('(')
  const close = s.indexOf(')')
  return open >= 0 && close > open ? s.substring(open + 1, close) : ''
}

// ── JwBnuzParser (bnuz) ──────────────────────────────────────────────────

const BNUZ_NODE_PATTERN = /^\d+$/
const BNUZ_OTHER_HEADER = new Set([
  '时间', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日',
  '早晨', '上午', '下午', '晚上',
])

export class JwBnuzParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    const doc = parseHtmlDoc(this.source)
    const table1 = getElementById(doc, 'table1')
    if (!table1) return result
    let node = 0
    for (const tr of getElementsByTag(table1, 'tr')) {
      let countFlag = false
      let countDay = 1
      const tds = getElementsByTag(tr, 'td')
      for (const td of tds) {
        const courseValue = text(td)
        if (BNUZ_OTHER_HEADER.has(courseValue)) continue
        if (courseValue === '') {
          if (countFlag) countDay++
          continue
        }
        if (BNUZ_NODE_PATTERN.test(courseValue)) {
          node = parseInt(courseValue, 10)
          countFlag = true
          continue
        }
        const tdHtml = td.innerHTML
        if (!tdHtml.includes('</span>')) {
          countDay++
          continue
        }
        // B2: </span> 后到末个 <br> 前, 按 <br> 切 + 空行过滤 (B4)
        const infos = tdHtml
          .split('</span>')[1]
          .split(/<br>/i)
          .slice(0, -1)
          .map((s) => s.trim())
          .filter((s) => s !== '')
        if (infos.length === 0) {
          countDay++
          continue
        }
        const courseName = infos[0]
        let i = 1
        while (i < infos.length) {
          if (i + 1 >= infos.length) break
          const teacherAndWeek = infos[i]
          const roomStr = infos[i + 1]
          if (!teacherAndWeek.includes('{') || !teacherAndWeek.includes('}')) {
            i += 2
            continue
          }
          const teacher = teacherAndWeek.split('{')[0].trim()
          const weekStr = teacherAndWeek.split('{')[1].split('}')[0].trim()
          // B3: 无 "(N节)" 后缀丢弃该 section
          const step = toIntOrNull(roomStr.split(/(?=(?:[^()]*)$)/).slice(-1)[0].replace(/[^0-9]/g, '').trim())
          const stepParsed = parseStep(roomStr)
          void step
          if (stepParsed === null) {
            i += 2
            continue
          }
          const room = roomStr.substring(0, roomStr.lastIndexOf('(')).trim()
          for (const wp of weekStr.split(',')) {
            const item = wp.trim()
            if (item === '') continue
            const type = item.includes('单') ? 1 : item.includes('双') ? 2 : 0
            let startWeek: number
            let endWeek: number
            if (item.includes('-')) {
              const s = toIntOrNull(item.split('-')[0].replace(/\D/g, ''))
              if (s === null) continue
              startWeek = s
              endWeek = toIntOrNull(item.split('-')[1].replace(/\D/g, '')) ?? startWeek
            } else {
              const s = toIntOrNull(item.replace(/\D/g, ''))
              if (s === null) continue
              startWeek = s
              endWeek = startWeek
            }
            result.push({
              name: courseName,
              room,
              teacher,
              day: Math.min(Math.max(countDay, 1), 7),
              startNode: node,
              endNode: node + stepParsed - 1,
              startWeek: Math.max(startWeek, 1),
              endWeek: Math.max(endWeek, startWeek),
              type,
            })
          }
          i += 2
        }
        countDay++
      }
    }
    return result
  }

  confidence(): number {
    try {
      const doc = parseHtmlDoc(this.source)
      const table1 = getElementById(doc, 'table1')
      if (table1 && this.source.includes('</span>')) return 100
      if (this.source.includes('es.bnuz')) return 90
      if (table1) return 70
      return 0
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('table1')) f.push('id=table1')
    if (this.source.includes('</span>')) f.push('<span>课程名</span>')
    if (this.source.includes('es.bnuz')) f.push('URL=es.bnuz')
    if (this.source.includes('{') && this.source.includes('周')) f.push('{N-M周}')
    return f
  }
}

/** Kotlin substringAfterLast('(').substringBeforeLast('节') 等价: 取最后 '(' 与最后 '节' 间数字 */
function parseStep(roomStr: string): number | null {
  const lastOpen = roomStr.lastIndexOf('(')
  const lastJie = roomStr.lastIndexOf('节')
  if (lastOpen < 0 || lastJie < lastOpen) return null
  const raw = roomStr.substring(lastOpen + 1, lastJie).trim()
  return toIntOrNull(raw)
}

// ── JwUrpParser (urp) ────────────────────────────────────────────────────

export class JwUrpParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    const doc = parseHtmlDoc(this.source)
    // T10: URP 网格变体
    const grid = this.parseUrpGrid(doc)
    if (grid.length > 0) return grid

    let tables = Array.from(doc.querySelectorAll('[class="displayTag"]'))
    if (tables.length === 0) {
      tables = Array.from(doc.querySelectorAll('[class="table table-striped table-bordered"]'))
    }
    if (tables.length === 0) return result

    for (const table of tables) {
      if (text(table).includes('星期一')) continue
      const thead = getElementsByTag(table, 'thead')[0]
      if (!thead) continue
      const ths = getElementsByTag(thead, 'th')
      const headSize = ths.length

      let nameIdx = -1
      let teacherIdx = -1
      let weekIdx = -1
      let dayIdx = -1
      let nodeIdx = -1
      let stepIdx = -1
      let buildingIdx = -1
      let roomIdx = -1

      ths.map(text).forEach((s, i) => {
        const t = s.trim()
        if (t === '课程名') nameIdx = i
        else if (t === '教师') teacherIdx = i
        else if (t === '周次') weekIdx = i
        else if (t === '星期') dayIdx = i
        else if (t === '节次') nodeIdx = i
        else if (t === '节数') stepIdx = i
        else if (t === '教学楼') buildingIdx = i
        else if (t === '教室') roomIdx = i
      })
      if (weekIdx === -1 || nodeIdx === -1 || nameIdx === -1) continue

      const tbody = getElementsByTag(table, 'tbody')[0]
      if (!tbody) continue
      let courseName = ''
      let teacher = ''

      for (const tr of getElementsByTag(tbody, 'tr')) {
        const tds = getElementsByTag(tr, 'td')
        const wholeFlag = tds.length > headSize - weekIdx
        const acDayIdx = wholeFlag ? dayIdx : dayIdx - weekIdx
        const dayTd = tds[acDayIdx]
        if (!dayTd || text(dayTd).trim() === '') continue

        if (wholeFlag) {
          courseName = text(tds[nameIdx])
          teacher = text(tds[teacherIdx]).trim()
        }

        let room = ''
        try {
          const bIdx = wholeFlag ? buildingIdx : buildingIdx - weekIdx
          const rIdx = wholeFlag ? roomIdx : roomIdx - weekIdx
          room = text(tds[bIdx]).trim() + text(tds[rIdx]).trim()
        } catch {
          room = ''
        }

        const nodeE = tds[wholeFlag ? nodeIdx : nodeIdx - weekIdx]
        const startNode = this.getStartNode(text(nodeE))
        let step: number
        if (stepIdx !== -1) {
          const sIdx = wholeFlag ? stepIdx : stepIdx - weekIdx
          step = toIntOrNull(text(tds[sIdx]).trim()) ?? 1
        } else {
          const nodeText = text(nodeE).trim()
          const dashIdx = nodeText.indexOf('-')
          const end = dashIdx >= 0 ? toIntOrNull(nodeText.substring(dashIdx + 1).split('节')[0].trim()) ?? startNode : startNode
          step = end - startNode + 1
        }
        const day = this.getDay(text(tds[acDayIdx]))
        const acWeekIdx = wholeFlag ? weekIdx : 0
        const weekStr = text(tds[acWeekIdx]).trim()

        for (const [sw, ew, ty] of this.weekStrToRanges(weekStr)) {
          result.push({
            name: courseName, room, teacher, day,
            startNode, endNode: startNode + step - 1,
            startWeek: sw, endWeek: ew, type: ty,
          })
        }
      }
    }
    return result
  }

  private getDay(str: string): number {
    const t = str.trim()
    const v = toIntOrNull(t)
    if (v !== null) return v
    switch (t) {
      case '星期一': return 1
      case '星期二': return 2
      case '星期三': return 3
      case '星期四': return 4
      case '星期五': return 5
      case '星期六': return 6
      case '星期日':
      case '星期天': return 7
      default: return 1
    }
  }

  private getStartNode(s: string): number {
    const t = s.trim()
    if (t.includes('-')) {
      return toIntOrNull(t.split('-')[0]) ?? 1
    }
    return (
      toIntOrNull(t.split('第')[1]?.split('大')[0]?.split('小')[0] ?? '') ?? 1
    )
  }

  private weekStrToRanges(weekStr: string): Array<[number, number, number]> {
    const result: Array<[number, number, number]> = []
    if (weekStr.trim() === '') {
      result.push([1, 20, 0])
      return result
    }
    const type = weekStr.includes('单') ? 1 : weekStr.includes('双') ? 2 : 0
    const cleaned = weekStr.replace(/周/g, '').replace(/[()]/g, '').replace(/单/g, '').replace(/双/g, '').trim()
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-')
      const s = toIntOrNull(parts[0].trim()) ?? 1
      const e = toIntOrNull((parts[1] ?? '').trim()) ?? s
      result.push([s, e, type])
    } else if (cleaned.includes(',')) {
      const weeks = cleaned.split(',').map((x) => toIntOrNull(x.trim())).filter((v): v is number => v !== null)
      result.push(...weekIntList2WeekBeanList(weeks))
    } else {
      const v = toIntOrNull(cleaned) ?? 1
      result.push([v, v, type])
    }
    return result
  }

  /** T10 网格变体: td[id=day_node] + div.class_div ≥5 p */
  private parseUrpGrid(doc: Document): JwCourse[] {
    const result: JwCourse[] = []
    const gridTds = Array.from(doc.querySelectorAll('td[id]'))
    for (const td of gridTds) {
      const id = attr(td, 'id')
      const parts = id.split('_')
      if (parts.length !== 2) continue
      const day = toIntOrNull(parts[0])
      if (day === null || day < 1 || day > 7) continue
      const node = toIntOrNull(parts[1])
      if (node === null) continue
      for (const div of getElementsByClass(td, 'class_div')) {
        const ps = getElementsByTag(div, 'p')
        if (ps.length < 5) continue
        const name = text(ps[0]).trim()
        if (name === '') continue
        const teacher = text(ps[2]).trim()
        const weekStr = text(ps[3]).trim()
        const nodeStr = text(ps[4]).trim()
        const ranges = this.gridWeekRanges(weekStr)
        if (ranges.length === 0) continue
        const nParts = nodeStr.replace(/节/g, '').split('-')
        const startNode = toIntOrNull((nParts[0] ?? '').trim()) ?? node
        const endNode = toIntOrNull((nParts[1] ?? '').trim()) ?? startNode
        const room = ps.length >= 6 ? text(ps[5]).trim() : ''
        for (const [sw, ew, ty] of ranges) {
          result.push({
            name, teacher, room, day,
            startNode, endNode,
            startWeek: sw, endWeek: ew, type: ty,
          })
        }
      }
    }
    return result
  }

  private gridWeekRanges(weekStr: string): Array<[number, number, number]> {
    if (weekStr.trim() === '') return []
    const result: Array<[number, number, number]> = []
    const cleaned = weekStr.replace(/周/g, '')
    for (const seg0 of cleaned.split(/[,，;；]/)) {
      const seg = seg0.trim()
      if (seg === '') continue
      const type = seg.includes('单') ? 1 : seg.includes('双') ? 2 : 0
      const digits = seg.replace(/[^0-9-]/g, '')
      if (digits.includes('-')) {
        const parts = digits.split('-')
        const s = toIntOrNull(parts[0] ?? '')
        if (s === null) continue
        const e = toIntOrNull(parts[1] ?? '') ?? s
        if (type === 0) {
          result.push([s, e, 0])
        } else {
          const weeks = []
          for (let w = s; w <= e; w++) {
            if (type === 1 ? w % 2 === 1 : w % 2 === 0) weeks.push(w)
          }
          result.push(...weekIntList2WeekBeanList(weeks))
        }
      } else {
        const v = toIntOrNull(digits)
        if (v === null) continue
        result.push([v, v, type])
      }
    }
    return result
  }

  confidence(): number {
    const gridMatch = /td[^>]+id="\d+_\d+"/.test(this.source) && this.source.includes('class_div')
    if (gridMatch) return 100
    if (this.source.includes('displayTag')) return 100
    if (this.source.includes('table-striped')) return 90
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('displayTag')) f.push('class=displayTag')
    if (this.source.includes('table-striped')) f.push('class=table table-striped table-bordered')
    return f
  }
}

// ── JwNewUrpParser (urp_new) ─────────────────────────────────────────────

/** 从 HTML 抠含 dateList 的最大合法 JSON (括号配对, 字符串感知) */
export function extractJsonFromHtml(html: string): string | null {
  const marker = 'dateList'
  const idx = html.indexOf(marker)
  if (idx < 0) return null
  let start = idx
  while (start > 0 && html[start] !== '{') start--
  if (html[start] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  let end = start
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"' && !escape) { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (depth !== 0) return null
  return html.substring(start, end + 1)
}

export class JwNewUrpParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    const jsonText = extractJsonFromHtml(this.source)
    if (!jsonText) return result
    let root: Record<string, unknown>
    try {
      root = JSON.parse(jsonText) as Record<string, unknown>
    } catch {
      return result
    }
    const dateList = root['dateList']
    if (!Array.isArray(dateList) || dateList.length === 0) return result
    const firstDate = dateList[0] as Record<string, unknown>
    const courseList = firstDate['selectCourseList']
    if (!Array.isArray(courseList)) return result

    for (const course of courseList) {
      const c = course as Record<string, unknown>
      const name = String(c['courseName'] ?? '').trim()
      const teacher = String(c['attendClassTeacher'] ?? '').trim()
      const timeAndPlaceList = c['timeAndPlaceList']
      if (!Array.isArray(timeAndPlaceList)) continue
      for (const tpRaw of timeAndPlaceList) {
        const tp = tpRaw as Record<string, unknown>
        const day = typeof tp['classDay'] === 'number' ? tp['classDay'] as number : toIntOrNull(String(tp['classDay'] ?? '')) ?? 1
        const startNode = typeof tp['classSessions'] === 'number' ? tp['classSessions'] as number : toIntOrNull(String(tp['classSessions'] ?? '')) ?? 1
        const continuing = typeof tp['continuingSession'] === 'number' ? tp['continuingSession'] as number : toIntOrNull(String(tp['continuingSession'] ?? '')) ?? 1
        const endNode = startNode + continuing - 1
        const classWeek = String(tp['classWeek'] ?? '')
        const campus = String(tp['campusName'] ?? '')
        const building = String(tp['teachingBuildingName'] ?? '')
        const room = String(tp['classroomName'] ?? '')
        const fullRoom = (campus + building + room).trim()

        const weekBits = parseWeekBits(classWeek)
        if (weekBits.length === 0) continue
        for (const [sw, ew, ty] of weekBitsToRanges(weekBits)) {
          result.push({
            name, room: fullRoom, teacher, day,
            startNode, endNode,
            startWeek: sw, endWeek: ew, type: ty,
          })
        }
      }
    }
    return result
  }

  confidence(): number {
    const hasDate = this.source.includes('dateList')
    const hasSelect = this.source.includes('selectCourseList')
    const hasTime = this.source.includes('timeAndPlaceList')
    if (hasDate && hasSelect && hasTime) return 100
    if (hasDate && hasSelect) return 80
    if (hasDate) return 50
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('dateList')) f.push('dateList')
    if (this.source.includes('selectCourseList')) f.push('selectCourseList')
    if (this.source.includes('timeAndPlaceList')) f.push('timeAndPlaceList')
    if (this.source.includes('classWeek')) f.push('classWeek')
    return f
  }
}

function parseWeekBits(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '1') out.push(i + 1)
  }
  return out
}

/** Kotlin weekBitsToRanges 逐行同构 (含 gap=2 分支的 continue 语义) */
function weekBitsToRanges(weeks: number[]): Array<[number, number, number]> {
  if (weeks.length === 0) return []
  const result: Array<[number, number, number]> = []
  let i = 0
  while (i < weeks.length) {
    const start = weeks[i]
    let end = start
    if (i + 1 < weeks.length) {
      const gap = weeks[i + 1] - start
      if (gap === 1) {
        end = weeks[i + 1]
        let k = i + 1
        while (k + 1 < weeks.length && weeks[k + 1] - weeks[k] === 1) { k++; end = weeks[k] }
        i = k + 1
        result.push([start, end, 0])
      } else if (gap === 2) {
        end = weeks[i + 1]
        let k = i + 1
        while (k + 1 < weeks.length && weeks[k + 1] - weeks[k] === 2) { k++; end = weeks[k] }
        const type = start % 2 !== 0 ? 1 : 2
        i = k + 1
        result.push([start, end, type])
        continue
      } else {
        i++
        result.push([start, end, 0])
        continue
      }
    } else {
      result.push([start, end, 0])
      i++
    }
  }
  return result
}

// ── JwHnustParser (hnust) ────────────────────────────────────────────────

const WEEK_PATTERN2 = /\d{1,2}周/

export class JwHnustParser implements JwParser {
  readonly source: string
  readonly oldQzType: number

  constructor(source: string, oldQzType = 0) {
    this.source = source
    this.oldQzType = oldQzType
  }

  generateCourseList(): JwCourse[] {
    const courseList: JwCourse[] = []
    const doc = parseHtmlDoc(this.source)
    const kbtable = getElementById(doc, 'kbtable')
    if (!kbtable) return courseList // H1
    for (const tr of getElementsByTag(kbtable, 'tr')) {
      const tds = getElementsByTag(tr, 'td')
      if (tds.length === 0) continue
      let day = -1
      for (const td of tds) {
        day++
        for (const div of getElementsByTag(td, 'div')) {
          const style = attr(div, 'style').replace(/ /g, '').toLowerCase() // H2
          if (text(div).trim() === '') continue
          if (this.oldQzType === 0) {
            if (style !== 'display:none;') continue
          } else {
            if (style === 'display:none;') continue
          }
          const split = div.innerHTML.split('<br>').map((s) => s.trim())
          let preIndex = -1
          for (let i = 0; i < split.length; i++) {
            if (WEEK_PATTERN2.test(split[i])) {
              if (preIndex !== -1) this.toCourse(split, preIndex, div, day, courseList)
              preIndex = i
            }
            if (i === split.length - 1) this.toCourse(split, preIndex, div, day, courseList)
          }
        }
      }
    }
    return courseList
  }

  private toCourse(split: string[], preIndex: number, div: Element, day: number, out: JwCourse[]): void {
    if (preIndex === -1) return
    if (preIndex - 1 < 0 || preIndex + 1 >= split.length) return // H3/H5
    const courseName = text(parseHtmlDoc(split[0]).body).trim()
    const room = text(parseHtmlDoc(split[preIndex + 1]).body).trim()
    const teacher = text(parseHtmlDoc(split[preIndex - 1]).body).trim()
    const timeInfo = text(parseHtmlDoc(split[preIndex]).body).trim().split(',')
    for (const t of timeInfo) {
      const s = t.trim()
      if (s === '') continue
      const weekStr = s.split('周')[0].trim()
      if (weekStr === '') continue
      let startWeek: number
      let endWeek: number
      if (weekStr.includes('-')) {
        const sw = toIntOrNull(weekStr.split('-')[0].replace(/\D/g, ''))
        if (sw === null) continue // H4
        startWeek = sw
        endWeek = toIntOrNull(weekStr.split('-')[1].replace(/\D/g, '')) ?? startWeek
      } else {
        const sw = toIntOrNull(weekStr.replace(/\D/g, ''))
        if (sw === null) continue
        startWeek = sw
        endWeek = startWeek
      }
      const idHead = attr(div, 'id').split('-')[0] ?? ''
      const nodeIdx = toIntOrNull(idHead.replace(/\D/g, ''))
      if (nodeIdx === null) continue // H4
      const startNode = nodeIdx * 2 - 1
      out.push({
        name: courseName, teacher, room,
        day: Math.min(Math.max(day, 1), 7),
        startNode: Math.max(startNode, 1),
        endNode: Math.max(startNode + 1, startNode),
        startWeek: Math.max(startWeek, 1),
        endWeek: Math.max(endWeek, startWeek),
        type: 0,
      })
    }
  }

  confidence(): number {
    try {
      const doc = parseHtmlDoc(this.source)
      if (!getElementById(doc, 'kbtable')) return 0
      const hiddenDivs = Array.from(doc.querySelectorAll('[style]'))
      const hasIdDiv = Array.from(doc.querySelectorAll('div[id]')).length > 0
      if (hiddenDivs.length > 0 && hasIdDiv) return 100
      if (hiddenDivs.length > 0) return 80
      return 60
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('kbtable')) f.push('id=kbtable')
    if (this.source.includes('display:none') || this.source.includes('display: none')) f.push('div[style=display:none]')
    if (/div[^>]+id="\d+-\d+"/.test(this.source)) f.push('div id=N-M')
    return f
  }
}
