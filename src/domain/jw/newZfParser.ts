/**
 * JwNewZfParser — Kotlin data/jw/JwNewZfParser.kt 1:1 移植 (正方新版 zf_new)
 *
 * JSON 主路: "kbList"/"xskbcx_json"/"kbxx" marker 严格键匹配 + var 赋值形态 +
 * 纯 JSON 页面 + {Msg,code,data:[{kbList}]} 深层穿透。
 * HTML 兜底: table1+festival / kbgrid_table_0 / kblist_table / kbcontent 容器 / QZ 兜底。
 * T4 修复全保留: marker 收紧/字段优先级/jc 三形态/CF 白名单防御。
 */

import {
  parseHtmlDoc, getElementsByTag, getElementById, getElementsByClass, selectFirst,
  text, innerHtml, attr, toIntOrNull, bitsToRanges, weekSuffixType,
  type JwCourse, type JwParser,
} from './jwCourse'
import { JwQzParser } from './qzParser'
import { JwParseException } from './jwFetchError'

const JSON_MARKERS = ['"kbList"', '"xskbcx_json"', '"kbxx"']
const NODE_PATTERN = /\(\d{1,2}[-]*\d*节/

export class JwNewZfParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    // 1. 嵌入 JSON
    const fromJson = this.parseEmbeddedJson()
    if (fromJson.length > 0) return fromJson
    // 2. HTML 表格
    return this.parseHtmlTable()
  }

  // ─── JSON 提取 ────────────────────────────────────────────

  private parseEmbeddedJson(): JwCourse[] {
    for (const marker of JSON_MARKERS) {
      const idx = findJsonKeyIndex(this.source, marker)
      if (idx === null) continue
      const jsonStr = extractBalanced(this.source, idx)
      if (!jsonStr) continue
      const courses = this.parseCourseJsonArray(jsonStr)
      if (courses.length > 0) return courses
    }
    // JS 变量赋值形态 var kbList = [...]
    for (const name of ['kbList', 'xskbcx_json', 'kbxx']) {
      const idx = findJsonVarIndex(this.source, name)
      if (idx === null) continue
      const jsonStr = extractBalanced(this.source, idx)
      if (!jsonStr) continue
      const courses = this.parseCourseJsonArray(jsonStr)
      if (courses.length > 0) return courses
    }
    // 纯 JSON 页面
    const trimmed = this.source.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const courses = this.parseCourseJsonArray(trimmed)
      if (courses.length > 0) return courses
    }
    return []
  }

  private parseCourseJsonArray(jsonStr: string): JwCourse[] {
    const result: JwCourse[] = []
    try {
      let arr: Record<string, unknown>[] | null
      if (jsonStr[0] === '[') {
        arr = JSON.parse(jsonStr) as Record<string, unknown>[]
      } else if (jsonStr[0] === '{') {
        arr = findKbListArray(JSON.parse(jsonStr) as Record<string, unknown>, 0)
      } else {
        return []
      }
      if (!arr) return []

      for (const o of arr) {
        // CF(青果) 字段白名单防御
        if ('teaxms' in o || 'jxcdmcs' in o || 'jcdm2' in o || 'zcs' in o) continue
        // 课程名(必填)
        const name = firstStr(o, 'kcmc', 'kcm', 'kc_mc', 'courseName', 'rlkcmc', 'jxbmc')
        if (name === '') continue
        // 教师(主流=xm)
        const teacher = firstStr(o, 'xm', 'jsxm', 'teacher', 'attendClassTeacher', 'skjs')
        // 教室(主流=cdmc)
        const room = firstStr(o, 'cdmc', 'classroomName', 'jxcd', 'jsmc', 'jxlh', 'jasdm')
        // 星期(数字 xqj 优先, xqjmc 文本兜底)
        const dayInt = firstInt(o, 'xqj', 'kcxq', 'xq', 'classDay', 'skxq')
        const day = dayInt ?? xqjmcToInt(o)
        if (day === null) continue
        // 节次(字符串)
        const jcStr = firstStr(o, 'jcs', 'jc', 'classSessions', 'ksjcsd', 'ksjc')
        if (jcStr === '') continue
        // 周次
        const zcStr = firstStr(o, 'zcd', 'kkzc', 'zc', 'classWeek', 'skzc')
        const ranges = parseWeekStr(zcStr)
        // 节次展开
        for (const [sn, en] of parseSectionRanges(jcStr)) {
          for (const [sw, ew, ty] of ranges) {
            result.push({
              name,
              room,
              teacher,
              day: Math.min(Math.max(day, 1), 7),
              startNode: Math.max(sn, 1),
              endNode: Math.max(en, sn),
              startWeek: sw,
              endWeek: ew,
              type: ty,
            })
          }
        }
      }
    } catch {
      // JSON 解析失败静默 (候选链兜底)
    }
    return result
  }

  // ─── HTML 表格解析 ────────────────────────────────────────

  private parseHtmlTable(): JwCourse[] {
    const doc = parseHtmlDoc(this.source)

    // 1. 上游 table1 + td.festival
    const table1 = getElementById(doc, 'table1')
    if (table1 && selectFirst(table1, 'td.festival')) {
      const result = parseTable1FestivalView(table1)
      if (result.length > 0) return result
    }
    // 2. shiguang 网格
    const gridTable = getElementById(doc, 'kbgrid_table_0')
    if (gridTable) {
      const result = parseKbgridTable0(gridTable)
      if (result.length > 0) return result
    }
    // 3. shiguang 列表
    const listTable = getElementById(doc, 'kblist_table')
    if (listTable) {
      const result = parseKblistTable(listTable)
      if (result.length > 0) return result
    }
    // 4. 强智 / kbgrid 兜底
    const container =
      getElementById(doc, 'kbtable') ??
      getElementById(doc, 'kbgrid') ??
      selectFirst(doc, 'table.el-table__body') ??
      selectFirst(doc, '.kbcapi-table') ??
      selectFirst(doc, '[id*=kb]')
    if (container) {
      const result = parseKbcontentContainer(container)
      if (result.length > 0) return result
    }
    // 5. QZ 兜底
    try {
      return new JwQzParser(this.source).generateCourseList()
    } catch (e) {
      if (e instanceof JwParseException) return []
      throw e
    }
  }

  /** T8: zftal-ui-/kbList=100; kblist_table=80; kbtable/kbgrid=70 */
  confidence(): number {
    const lower = this.source.toLowerCase()
    if (lower.includes('zftal-ui-') || lower.includes('"kblist"')) return 100
    if (lower.includes('kblist_table')) return 80
    if (lower.includes('kbtable') || lower.includes('kbgrid')) return 70
    return 0
  }

  matchedFeatures(): string[] {
    const lower = this.source.toLowerCase()
    const features: string[] = []
    if (lower.includes('"kblist"')) features.push('kbList')
    if (lower.includes('kbgrid_table_0')) features.push('kbgrid_table_0')
    if (lower.includes('kblist_table')) features.push('kblist_table')
    return features
  }
}

// ─── 模块级工具 ────────────────────────────────────────────

/** 严格 JSON 键搜索: marker 后非空字符须为 { 或 [ (允许单个冒号) */
function findJsonKeyIndex(s: string, quotedKey: string): number | null {
  let from = 0
  for (;;) {
    const idx = s.indexOf(quotedKey, from)
    if (idx < 0) return null
    const after = idx + quotedKey.length
    if (after >= s.length) return null
    let p = after
    while (p < s.length && /\s/.test(s[p])) p++
    if (p < s.length && s[p] === ':') {
      p++
      while (p < s.length && /\s/.test(s[p])) p++
    }
    if (p >= s.length) {
      from = idx + 1
      continue
    }
    if (s[p] === '{' || s[p] === '[') return p
    from = idx + 1
  }
}

/** JS 变量赋值形态 var kbList = [...] */
function findJsonVarIndex(s: string, name: string): number | null {
  const marker = `var ${name}`
  let from = 0
  for (;;) {
    const idx = s.indexOf(marker, from)
    if (idx < 0) return null
    let p = idx + marker.length
    while (p < s.length && /\s/.test(s[p])) p++
    if (p < s.length && s[p] === '=') {
      p++
      while (p < s.length && /\s/.test(s[p])) p++
      if (p < s.length && (s[p] === '{' || s[p] === '[')) return p
    }
    from = idx + 1
  }
}

/** 括号配对提取 (字符串感知) */
function extractBalanced(s: string, start: number): string | null {
  if (start >= s.length) return null
  const open = s[start]
  const close = open === '[' ? ']' : open === '{' ? '}' : null
  if (!close) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return s.substring(start, i + 1)
    }
  }
  return null
}

function findKbListArray(obj: Record<string, unknown>, depth: number): Record<string, unknown>[] | null {
  if (depth > 4) return null
  for (const key of ['kbList', 'kbxx', 'tmp_list']) {
    const v = obj[key]
    if (Array.isArray(v)) return v as Record<string, unknown>[]
  }
  for (const key of Object.keys(obj)) {
    const v = obj[key]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const hit = findKbListArray(v as Record<string, unknown>, depth + 1)
      if (hit) return hit
    } else if (Array.isArray(v)) {
      for (const inner of v) {
        if (inner && typeof inner === 'object') {
          const hit = findKbListArray(inner as Record<string, unknown>, depth + 1)
          if (hit) return hit
        }
      }
    }
  }
  return null
}

/** 节次串 → [start,end][]: 范围 / 补零 / 多段 (三形态) */
export function parseSectionRanges(s: string): Array<[number, number]> {
  if (s.trim() === '') return []
  const out: Array<[number, number]> = []
  for (const seg of s.split(/[,，;；]/)) {
    const t = seg.trim()
    if (t === '') continue
    if (t.includes('-')) {
      const parts = t.split('-', 2).map((x) => x.trim())
      const a = toIntOrNull(parts[0] ?? '')
      const b = toIntOrNull(parts[1] ?? '')
      if (a !== null && b !== null && a >= 1 && a <= 16 && b >= 1 && b <= 16) out.push([a, b])
      continue
    }
    const digits = t.replace(/\D/g, '')
    if (digits === '') continue
    // 偶数长度补零串 "0102" → 01,02
    if (digits.length >= 2 && digits.length % 2 === 0 && digits.startsWith('0')) {
      let i = 0
      let ok = true
      const nums: number[] = []
      while (i + 1 < digits.length) {
        const v = toIntOrNull(digits.substring(i, i + 2))
        if (v === null || v < 1 || v > 16) { ok = false; break }
        nums.push(v)
        i += 2
      }
      if (ok && nums.length >= 2) {
        for (let k = 0; k + 1 < nums.length; k += 2) out.push([nums[k], nums[k + 1]])
      } else if (ok && nums.length === 1) {
        out.push([nums[0], nums[0]])
      }
      continue
    }
    const v = toIntOrNull(digits)
    if (v !== null && v >= 1 && v <= 16) out.push([v, v])
  }
  return out
}

/** xqjmc 星期文本 → 1..7 ("星期一"/"周一"/"周天") */
function xqjmcToInt(o: Record<string, unknown>): number | null {
  const s = String(o['xqjmc'] ?? '').trim()
  if (s === '') return null
  const zh = ['一', '二', '三', '四', '五', '六', '日', '天']
  for (const c of s) {
    const idx = zh.indexOf(c)
    if (idx >= 0) return idx >= 6 ? 7 : idx + 1
  }
  return null
}

function firstStr(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (v !== undefined && v !== null) {
      const s = String(v).trim()
      if (s !== '') return s
    }
  }
  return ''
}

function firstInt(o: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k]
    if (v !== undefined && v !== null) {
      const s = String(v).trim()
      if (s !== '') {
        const n = toIntOrNull(s)
        if (n !== null) return n
      }
    }
  }
  return null
}

/** 周次串 → (start, end, type)[] (T4 加固) */
export function parseWeekStr(s0: string): Array<[number, number, number]> {
  const s = s0.replace(/\{/g, '').replace(/\}/g, '').replace(/第/g, '').trim()
  if (s === '') return [[1, 16, 0]]
  const result: Array<[number, number, number]> = []

  // bitmap 模式
  if (s.length >= 10 && /^[01]+$/.test(s)) {
    const weeks = s.split('').map((c, i) => (c === '1' ? i + 1 : 0)).filter((v) => v > 0)
    return bitsToRanges(weeks)
  }

  for (const part0 of s.split(/[,，;；]/)) {
    const part = part0.trim()
    if (part === '') continue
    const type = weekSuffixType(part)
    const cleaned = part
      .replace(/周/g, '')
      .replace(/[()（）]/g, '')
      .trim()
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-', 2)
      const startDigits = (parts[0] ?? '').replace(/\D/g, '')
      const endDigits = (parts[1] ?? '').replace(/\D/g, '')
      const start = startDigits !== '' ? toIntOrNull(startDigits) : null
      const end = endDigits !== '' ? toIntOrNull(endDigits) : null
      if (start !== null && end !== null) result.push([start, end, type])
    } else {
      const digits = cleaned.replace(/\D/g, '')
      const v = digits !== '' ? toIntOrNull(digits) : null
      if (v !== null) result.push([v, v, type])
    }
  }
  return result.length > 0 ? result : [[1, 16, 0]]
}

// ─── HTML 变体 ────────────────────────────────────────────

function parseTable1FestivalView(table: Element): JwCourse[] {
  const result: JwCourse[] = []
  for (const tr of getElementsByTag(table, 'tr')) {
    const nodeStr = text(getElementsByClass(tr, 'festival')[0] ?? tr.ownerDocument!.createElement('i'))
    if (nodeStr === '') continue
    const rowNode = toIntOrNull(nodeStr)
    if (rowNode === null) continue
    for (const td of getElementsByTag(tr, 'td')) {
      const tdId = attr(td, 'id')
      if (tdId === '') continue
      const day = toIntOrNull(tdId[0])
      if (day === null || day < 1 || day > 7) continue
      for (const div of getElementsByTag(td, 'div')) {
        const courseText = text(div)
        if (courseText.length <= 1) continue
        const courseName = text(getElementsByClass(div, 'title')[0] ?? div.ownerDocument!.createElement('i'))
        if (courseName === '') continue
        let teacher = ''
        let room = ''
        let timeStr = ''
        for (const p of getElementsByTag(div, 'p')) {
          const title = attr(p, 'title')
          if (title === '教师') teacher = text(p)
          else if (title === '上课地点') room = text(p)
          else if (title === '节/周' || title === '周/节') timeStr = text(p)
        }
        if (timeStr === '') continue
        const nodeInfo = NODE_PATTERN.exec(timeStr)?.[0]
        if (!nodeInfo) continue
        const nodes = nodeInfo.substring(1).replace(/节$/, '').split('-')
        let startNode = toIntOrNull(nodes[0] ?? '') ?? 0
        const endNode = toIntOrNull(nodes[1] ?? '') ?? startNode
        if (startNode <= 0) startNode = rowNode
        const weekList = timeStr.replace(NODE_PATTERN, '').split(',')
        for (const weekPart of weekList) {
          const trimmed = weekPart.trim()
          if (trimmed === '') continue
          for (const [sw, ew, ty] of parseWeekStr(trimmed)) {
            result.push({ name: courseName, room, teacher, day, startNode, endNode, startWeek: sw, endWeek: ew, type: ty })
          }
        }
      }
    }
  }
  return result
}

function parseKbgridTable0(table: Element): JwCourse[] {
  const result: JwCourse[] = []
  for (const tr of getElementsByTag(table, 'tr')) {
    for (const td of getElementsByTag(tr, 'td')) {
      const tdId = attr(td, 'id')
      if (tdId === '') continue
      const day = toIntOrNull(tdId.split('-')[0] ?? '')
      if (day === null || day < 1 || day > 7) continue
      for (const tc of getElementsByClass(td, 'timetable_con')) {
        const titleDiv = getElementsByClass(tc, 'title')[0]
        const name = titleDiv ? text(titleDiv) : ''
        if (name === '') continue
        const pList = getElementsByTag(tc, 'p')
        if (pList.length < 3) continue
        const infoStr = text(pList[0])
        const position = text(pList[1])
        const teacher = text(pList[2])
        const nodeMatch = NODE_PATTERN.exec(infoStr)?.[0]
        if (!nodeMatch) continue
        const nodes = nodeMatch.substring(1).replace(/节$/, '').split('-')
        const startNode = toIntOrNull(nodes[0] ?? '')
        if (startNode === null) continue
        const endNode = toIntOrNull(nodes[1] ?? '') ?? startNode
        const weekStr = infoStr.replace(NODE_PATTERN, '').trim()
        for (const [sw, ew, ty] of parseWeekStr(weekStr)) {
          result.push({ name, room: position, teacher, day, startNode, endNode, startWeek: sw, endWeek: ew, type: ty })
        }
      }
    }
  }
  return result
}

function parseKblistTable(table: Element): JwCourse[] {
  const result: JwCourse[] = []
  const tbodies = getElementsByTag(table, 'tbody')
  for (let index = 0; index < tbodies.length; index++) {
    if (index === 0) continue
    if (index > 7) break
    const day = index
    for (const tr of getElementsByTag(tbodies[index], 'tr')) {
      const tds = getElementsByTag(tr, 'td')
      if (tds.length < 2) continue
      const sectionStr = text(tds[0])
      if (sectionStr === '') continue
      const nodes = sectionStr.split('-', 2)
      const startNode = toIntOrNull((nodes[0] ?? '').trim())
      if (startNode === null) continue
      const endNode = toIntOrNull((nodes[1] ?? '').trim()) ?? startNode
      const titleDiv = getElementsByClass(tds[1], 'title')[0]
      const name = titleDiv ? text(titleDiv) : ''
      if (name === '') continue
      const allText = text(tds[1])
      const weekStr = /周数\s*[：:]\s*(.+?)(?=上课地点|教师|$)/.exec(allText)?.[1]?.trim() ?? ''
      const room = /上课地点\s*[：:]\s*(.+?)(?=教师|$)/.exec(allText)?.[1]?.trim() ?? ''
      const teacher = /教师[\s　]*[：:]\s*(.+?)$/.exec(allText)?.[1]?.trim() ?? ''
      if (weekStr === '') continue
      for (const [sw, ew, ty] of parseWeekStr(weekStr)) {
        result.push({ name, room, teacher, day, startNode, endNode, startWeek: sw, endWeek: ew, type: ty })
      }
    }
  }
  return result
}

function parseKbcontentContainer(container: Element): JwCourse[] {
  const result: JwCourse[] = []
  const trs = getElementsByTag(container, 'tr')
  let nodeCount = 0
  for (const tr of trs) {
    const tds = getElementsByTag(tr, 'td')
    if (tds.length === 0) continue
    const firstCellText = text(tds[0])
    const isSectionHeader =
      firstCellText.includes('节') &&
      tds.every((td) => getElementsByClass(td, 'kbcontent').length === 0)
    if (isSectionHeader) continue
    nodeCount++
    let day = 0
    for (const td of tds) {
      day++
      for (const cell of getElementsByClass(td, 'kbcontent')) {
        const html = innerHtml(cell)
        if (html.trim() === '') continue
        for (const part of html.split('-----')) {
          result.push(...parseCell(part.trim(), day, nodeCount))
        }
      }
    }
  }
  return result
}

function parseCell(html: string, day: number, nodeCount: number): JwCourse[] {
  const cellDoc = parseHtmlDoc(html)
  const beforeFont = html.split('<font')[0].trim()
  const tmp = parseHtmlDoc(beforeFont)
  const name = text(tmp.body ?? cellDoc.body)
  if (name === '') return []
  const find = (t: string): Element[] =>
    Array.from(cellDoc.querySelectorAll(`[title="${t}"]`))
  const teacher = find('老师').map(text).join(' ')
  const room = find('教室').map(text).join(' ')
  const weekEl = find('周次(节次)')[0]
  const weekStr = text(weekEl).split('(周)')[0]
  const ranges = parseWeekStr(weekStr)
  const node = nodeCount * 2 - 1
  return ranges.map(([sw, ew, ty]) => ({
    name, room, teacher, day,
    startNode: node, endNode: node + 1,
    startWeek: sw, endWeek: ew, type: ty,
  }))
}
