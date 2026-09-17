import { detectVersion, type Clock } from './sleepyNativeFormat'
import { parseSleepyV1, type ParseResultV1, type ParsedCourse, type ParsedPeriodTable } from './sleepyNativeParser'

export type { ParsedPeriodTable }

/**
 * 课表分派解析 — Kotlin ScheduleParser.kt 1:1 移植 (分派链 + 6 路子解析器)
 *
 * 9 路分派链(顺序关键, §6.2/§6.3):
 * v2 拒绝 → sleepy-v1 → Excel Frameset 报错 → WakeUp 分享文本(courseDetailJson)
 * → WakeUp JSON → ICS(含 NEU 块模型) → HTML → CSV → 纯文本
 */

export type { ParseResultV1, ParsedCourse }
export type ParseResult = ParseResultV1 & { groupIdsAuthoritative: boolean }

export interface ExportCourseInput {
  groupId: string
  courseName: string
  alias?: string
  teacher: string
  room: string
  note: string
  day: number
  startNode: number
  step: number
  startWeek: number
  endWeek: number
  type: number
  color: string
  ownTime?: boolean
  startTime?: string
  endTime?: string
}

/** Result 语义: ok=true / err=IllegalArgumentException 消息 */
export type ParseOutcome =
  | { ok: true; value: ParseResult }
  | { ok: false; error: Error }

export function parseSchedule(
  rawText: string,
  defaultTableId: number,
  defaultColor = '#FF6750A4',
): ParseOutcome {
  try {
    return { ok: true, value: parseDispatch(rawText, defaultTableId, defaultColor) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }
  }
}

function parseDispatch(rawText: string, defaultTableId: number, defaultColor: string): ParseResult {
  const raw = rawText.trim()
  if (raw === '') throw new Error('空内容')
  // 防呆: 先统一全角字符(AI 常输出 １－２ / ～), 再提取标识, 再分派
  const trimmed = extractMarkedBody(normalizeFullWidth(raw))

  // 兼容: 导出端常在 JSON 前加 "【来自Sleepy】\n课程分享：\n\n" 前缀, 剥掉再判别
  const body = !trimmed.startsWith('{') && trimmed.includes('{')
    ? trimmed.substring(trimmed.indexOf('{'))
    : trimmed

  const dv = detectVersion(trimmed)
  if (dv > 1) {
    throw new Error(`文件由新版 Sleepy 导出(v${dv})，请升级 Sleepy 后导入`)
  }
  if (dv === 1) {
    return parseSleepyV1(trimmed, defaultTableId, defaultColor) as ParseResult
  }
  if (isExcelFrameset(trimmed)) {
    throw new Error(excelFramesetError(trimmed))
  }
  if (body.includes('"courseDetailJson"')) {
    return parseWakeUpShareText(body, defaultTableId)
  }
  if (body.startsWith('{') && (body.includes('"courses"') || body.includes('"tableInfo"'))) {
    return parseWakeUpJson(body, defaultTableId, defaultColor)
  }
  if (body.startsWith('BEGIN:VCALENDAR') || body.startsWith('BEGIN:VEVENT')) {
    return parseIcs(body, defaultTableId, defaultColor)
  }
  if (startsWithAnyTag(trimmed, 'html', 'body', 'table', 'div', 'section', 'article')) {
    return parseHtml(trimmed, defaultTableId, defaultColor)
  }
  if (isLikelyCsv(trimmed)) {
    return parseCsv(trimmed, defaultTableId, defaultColor)
  }
  return parseSimpleText(trimmed, defaultTableId, defaultColor)
}

function startsWithAnyTag(s: string, ...tags: string[]): boolean {
  const t = s.trim().toLowerCase()
  if (t.startsWith('<!doctype') || t.startsWith('<?xml')) return true
  return tags.some((tag) => t.startsWith(`<${tag}`))
}

// ---- Excel Frameset 识别 (issue #6) ----

export function isExcelFrameset(html: string): boolean {
  const lower = html.toLowerCase()
  if (!lower.includes('<frameset')) return false
  return lower.includes('excel workbook frameset') || /\.files\/sheet\d+\.html/.test(lower)
}

export function excelSheetRef(html: string): string {
  const shLink = /<link[^>]*id\s*=\s*"?shLink"?[^>]*>/i.exec(html)
    ?? /<frame[^>]*src\s*=\s*"?([^">]*)"?["]?[^>]*>/i.exec(html)
  const m = shLink
    ? (/href\s*=\s*"?([^">\s]+)"?/i.exec(shLink[0]) ?? /src\s*=\s*"?([^">\s]+)"?/i.exec(shLink[0]))
    : null
  return m ? m[1].trim() : ''
}

function excelFramesetError(html: string): string {
  const ref = excelSheetRef(html)
  const extra = ref !== '' ? `（课表在附属文件 ${ref} 里，本应用无法读取）` : ''
  return `这是 Excel 导出的网页${extra}，无法直接解析。请在 Excel 中另存为 CSV 文件或普通网页（不要选「单个文件网页/网页-筛选」格式）后重新导入`
}

// ---- marker / 全角归一 ----

export function extractMarkedBody(text: string): string {
  const markerRegex = (kind: string): RegExp => {
    const k = kind.toLowerCase()
    return new RegExp(`[<{(]{2,4}\\s*SLEEPY\\s*[-_ ]?\\s*${k}\\s*[>})]{2,4}`, 'i')
  }
  const beginM = markerRegex('begin').exec(text)
  const endM = markerRegex('end').exec(text)
  let out: string
  if (beginM && endM && endM.index > beginM.index + beginM[0].length - 1) {
    out = text.substring(beginM.index + beginM[0].length, endM.index)
  } else if (beginM) {
    out = text.substring(beginM.index + beginM[0].length)
  } else if (endM) {
    out = text.substring(0, endM.index)
  } else {
    out = text
  }
  return out.trim()
}

export function normalizeFullWidth(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code >= 0xff10 && code <= 0xff19) out += String.fromCharCode(code - 0xff10 + 0x30)
    else if (code >= 0xff41 && code <= 0xff5a) out += String.fromCharCode(code - 0xff41 + 0x61)
    else if (code >= 0xff21 && code <= 0xff3a) out += String.fromCharCode(code - 0xff21 + 0x41)
    else if (ch === '－' || ch === '—' || ch === '―' || ch === '﹣') out += '-'
    else if (ch === '～') out += '~'
    else if (ch === '　') out += ' '
    else if (ch === '﻿') out += ' ' // BOM
    else out += ch
  }
  return out
}

// ---- WakeUp 分享文本 / JSON ----

interface WakeupCourseJson {
  name?: string
  courseName?: string
  teacher?: string
  position?: string
  room?: string
  note?: string
  day?: number
  startNode?: number
  step?: number
  startWeek?: number
  endWeek?: number
  type?: number
  color?: string
}

function courseFromJson(o: WakeupCourseJson, tableId: number, dfltColor: string, noteDflt: string): ParsedCourse {
  return {
    groupId: '',
    tableId,
    courseName: o.name ?? o.courseName ?? '未命名',
    alias: '',
    teacher: o.teacher ?? '',
    room: o.position ?? o.room ?? '',
    note: o.note ?? noteDflt,
    day: o.day ?? 1,
    startNode: o.startNode ?? 1,
    step: o.step ?? 1,
    startWeek: o.startWeek ?? 1,
    endWeek: o.endWeek ?? 16,
    type: o.type ?? 0,
    color: o.color ?? dfltColor,
    ownTime: false,
    startTime: '',
    endTime: '',
  }
}

function parseWakeUpShareText(text: string, defaultTableId: number): ParseResult {
  const jsonStart = text.indexOf('{')
  if (jsonStart < 0) throw new Error('找不到 JSON')
  const jsonStr = text.substring(jsonStart)
  const root = JSON.parse(jsonStr) as Record<string, unknown>
  const name = (root['name'] as string) ?? '导入的课表'
  const tableInfo = root['tableInfo'] as Record<string, unknown> | undefined
  const startDate = (root['startDate'] as string)
    ?? (tableInfo?.['startDate'] as string)
    ?? todayISO()

  const courseDetailJsonStr = root['courseDetailJson'] as string | undefined
  let courses: ParsedCourse[]
  if (courseDetailJsonStr !== undefined && courseDetailJsonStr !== '') {
    // courseDetailJson 是 URL-encoded JSON 字符串 (application/x-www-form-urlencoded: + → 空格)
    const decoded = decodeURIComponent(courseDetailJsonStr.replace(/\+/g, ' '))
    const arr = JSON.parse(decoded) as WakeupCourseJson[]
    courses = arr.map((o) => courseFromJson(o, defaultTableId, '#FF6750A4', ''))
  } else {
    const arr = (root['courses'] ?? tableInfo?.['courses']) as WakeupCourseJson[] | undefined
    if (!arr) throw new Error('找不到 courses 字段')
    courses = arr.map((o) => courseFromJson(o, defaultTableId, '#FF6750A4', ''))
  }

  const harvested = harvestTimeFromTableInfo(root, name)
  return lossless(name, startDate, courses, harvested.timeJson, harvested.nodesPerDay, false, harvested.periodTable)
}

function parseWakeUpJson(text: string, defaultTableId: number, defaultColor: string): ParseResult {
  const root = JSON.parse(text) as Record<string, unknown>
  const name = (root['name'] as string) ?? '导入的课表'
  const startDate = (root['startDate'] as string) ?? todayISO()
  // v1.0.56 T11: 纯作息 JSON(只有 tableInfo.timeList, 无 courses)是合法形态 —
  // 空课程 + periodTable 非空 → 导入端 T9 纯作息路径只建作息表
  const rawCourses = root['courses'] as WakeupCourseJson[] | undefined
  const timeListNonEmpty = (() => {
    const list = (root['tableInfo'] as Record<string, unknown> | undefined)?.['timeList']
    return Array.isArray(list) && list.length > 0
  })()
  const arr = rawCourses ?? (timeListNonEmpty ? [] : null)
  if (arr === null) throw new Error('找不到 courses 数组')
  const courses = arr.map((o) => courseFromJson(o, defaultTableId, defaultColor, ''))
  const harvested = harvestTimeFromTableInfo(root, name)
  return lossless(name, startDate, courses, harvested.timeJson, harvested.nodesPerDay, false, harvested.periodTable)
}

/**
 * 从 tableInfo 收割节次时间表: Sleepy 导出 time=原文 / WakeUp 原生 timeList 逐条转。
 * v1.0.56 T10: 收割结果同时产出 ParsedPeriodTable — 混合导入(课程+节次)时自动建一张
 * 同名作息表并绑定, 不再只填课表兼容列。sourceId=0(无既有表可指)。
 */
function harvestTimeFromTableInfo(root: Record<string, unknown>, tableName: string): HarvestedTime {
  const tableInfo = root['tableInfo'] as Record<string, unknown> | undefined
  if (!tableInfo) return { timeJson: '', nodesPerDay: 0, periodTable: null }
  const declared = typeof tableInfo['nodesPerDay'] === 'number' ? tableInfo['nodesPerDay'] as number : 0
  // Sleepy 自家: time 字段就是 timeJson 原文
  const time = tableInfo['time'] as string | undefined
  if (time !== undefined && time.trim() !== '') {
    const nodes = parseNodesSafe(time)
    if (nodes.length > 0) {
      const nodesPerDay = Math.max(nodes[nodes.length - 1].node, declared)
      return {
        timeJson: time,
        nodesPerDay,
        periodTable: { sourceId: 0, name: tableName, nodesPerDay, timeJson: time },
      }
    }
  }
  // WakeUp 原生: timeList 数组
  const timeList = tableInfo['timeList'] as Array<Record<string, unknown>> | undefined
  if (!timeList) return { timeJson: '', nodesPerDay: declared, periodTable: null }
  const nodeTimes = new Map<number, [Clock, Clock]>()
  for (const o of timeList) {
    const node = typeof o['node'] === 'number' ? o['node'] as number : 0
    const st = typeof o['startTime'] === 'string' ? parseHmLenient(o['startTime'] as string) : null
    const et = typeof o['endTime'] === 'string' ? parseHmLenient(o['endTime'] as string) : null
    if (node >= 1 && st && et && clockBefore(st, et)) nodeTimes.set(node, [st, et])
  }
  if (nodeTimes.size === 0) return { timeJson: '', nodesPerDay: declared, periodTable: null }
  const builtJson = buildTimeJson(nodeTimes)
  const nodesPerDay = Math.max(Math.max(...nodeTimes.keys()), declared)
  return {
    timeJson: builtJson,
    nodesPerDay,
    periodTable: { sourceId: 0, name: tableName, nodesPerDay, timeJson: builtJson },
  }
}

interface HarvestedTime {
  timeJson: string
  nodesPerDay: number
  periodTable: ParsedPeriodTable | null
}

/** "08:00" / "8:00" / "0800" → Clock; 非法 null */
function parseHmLenient(s: string): Clock | null {
  const m = /(\d{1,2}):?(\d{2})/.exec(s.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 ? { h, m: mi } : null
}

function clockBefore(a: Clock, b: Clock): boolean {
  return a.h < b.h || (a.h === b.h && a.m < b.m)
}

function parseNodesSafe(timeJson: string): Array<{ node: number; start: string; end: string }> {
  try {
    const arr = JSON.parse(timeJson) as Array<Record<string, unknown>>
    return arr
      .map((o) => ({ node: Number(o['node']), start: String(o['start'] ?? ''), end: String(o['end'] ?? '') }))
      .filter((n) => Number.isFinite(n.node))
      .sort((a, b) => a.node - b.node)
  } catch {
    return []
  }
}

function buildTimeJson(nodeTimes: Map<number, [Clock, Clock]>): string {
  if (nodeTimes.size === 0) return ''
  const parts = [...nodeTimes.keys()].sort((a, b) => a - b).map((node) => {
    const [s, e] = nodeTimes.get(node)!
    return `{"node":${node},"start":"${fmtT(s)}","end":"${fmtT(e)}"}`
  })
  return `[${parts.join(',')}]`
}

function fmtT(t: Clock): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(t.h)}:${p(t.m)}`
}

function todayISO(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** v7.10.16k 无损收尾 — 全格式路径统一: 节次数 = max(作息声明, 课程到达); timeJson 原样不伪造 */
function lossless(
  tableName: string,
  startDate: string,
  courses: ParsedCourse[],
  timeJson: string,
  declaredNodes: number,
  groupIdsAuthoritative: boolean,
  // v1.0.56 T10: 混合导入自动建作息表 — 非 null 时落库端(ImportAsNew)自动建同名作息表并绑定
  periodTable: ParsedPeriodTable | null = null,
): ParseResult {
  const courseReach = courses.length === 0
    ? 0
    : Math.max(...courses.map((c) => c.startNode + c.step - 1))
  return {
    tableName,
    startDate,
    courses,
    timeJson,
    nodesPerDay: Math.max(declaredNodes, courseReach),
    droppedLines: [],
    warnings: [],
    maxWeek: 0,
    groupIdsAuthoritative,
    periodTable,
  }
}

// ---- ICS (RFC 5545, WakeUp 导出 + Sleepy 导出 + NEU 块模型) ----

interface IcsEvent {
  name: string
  day: number
  startNode: number
  step: number
  teacher: string
  room: string
  firstDate: Date
  lastDate: Date
  interval: number
}

interface NeuBlock {
  startMin: number
  endMin: number
  nodeCount: number
  firstNode: number
}

function parseIcs(text: string, defaultTableId: number, defaultColor: string): ParseResult {
  const events: IcsEvent[] = []
  const isNeuIcs = /^PRODID:.*NEU_Wisedu2Wakeup/m.test(text)
  const neuBlocks = isNeuIcs ? analyzeNeuBlocks(text) : []
  const nodeTimes = new Map<number, [Clock, Clock]>()

  for (const raw of text.split('BEGIN:VEVENT').slice(1)) {
    const end = raw.indexOf('END:VEVENT')
    const block = end > 0 ? raw.substring(0, end) : raw

    const summary = extractIcsField(block, 'SUMMARY')
    if (summary === null) continue
    const location = extractIcsField(block, 'LOCATION') ?? ''
    const description = extractIcsField(block, 'DESCRIPTION') ?? ''
    // ICS 折行已在 extractIcsField 剥除; 字面 \n 转义切行
    const descLines = description.split('\\n')

    const teacher =
      descLines.length >= 3 ? descLines[2].trim()
        : description.startsWith('老师：') ? description.split('老师：')[1]?.trim() ?? ''
          : description.startsWith('老师:') ? description.split('老师:')[1]?.trim() ?? ''
            : ''
    const room =
      descLines.length >= 2 && descLines[1].trim() !== '' ? descLines[1].trim()
        : location !== '' && teacher !== '' && location.endsWith(teacher)
          ? location.slice(0, location.length - teacher.length).trim()
          : location

    const day = extractIcsDayOfWeek(block)
    if (day === null) continue
    const dtstart = extractIcsDate(block)
    if (dtstart === null) continue
    const explicitNode = extractIcsNode(description)
    const inferred = explicitNode
      ?? (isNeuIcs ? neuSpanFor(neuBlocks, block) : extractIcsTime(block))
    if (inferred === null) continue
    const [startNode, step] = inferred

    if (!isNeuIcs) harvestNodeTimes(block, startNode, step, nodeTimes)

    const rrule = extractIcsField(block, 'RRULE') ?? ''
    const interval = rrule.includes('INTERVAL=2') ? 2 : 1
    const untilMatch = /UNTIL=(\d{8})/.exec(rrule)
    const untilDate = untilMatch ? (parseIcsDate(untilMatch[1]) ?? dtstart) : dtstart
    // UNTIL 是最后一次发生的日历日(可能晚 0-6 天) → 对齐回同星期几
    const deltaDays = daysBetween(dtstart, untilDate)
    const aligned = deltaDays - (((deltaDays % 7) + 7) % 7)
    const lastOccurrence = addDays(dtstart, aligned)

    events.push({ name: summary, day, startNode, step, teacher, room, firstDate: dtstart, lastDate: lastOccurrence, interval })
  }

  if (events.length === 0) {
    return {
      tableName: '导入的 ICS 课表',
      startDate: todayISO(),
      courses: [],
      timeJson: '',
      nodesPerDay: 0,
      droppedLines: [],
      warnings: [],
      maxWeek: 0,
      groupIdsAuthoritative: false,
      periodTable: null,
    }
  }

  // 锚点 = 最早 DTSTART 所在周的周一
  const anchor = toMonday(events.reduce((min, e) => (e.firstDate < min ? e.firstDate : min), events[0].firstDate))
  const weekOf = (d: Date): number => Math.floor(daysBetween(anchor, d) / 7) + 1

  // 按 (课名,星期,节次,教师) 聚合; room 不进键(防假单双周, 24sp 管理心理学实证)
  const groups = new Map<string, { key: { name: string; day: number; node: number; step: number; teacher: string }; chunks: Array<[number, number, string]>; interval: number }>()
  for (const e of events) {
    const key = { name: e.name, day: e.day, node: e.startNode, step: e.step, teacher: e.teacher }
    const k = `${key.name}|${key.day}|${key.node}|${key.step}|${key.teacher}`
    if (!groups.has(k)) groups.set(k, { key, chunks: [], interval: e.interval })
    groups.get(k)!.chunks.push([weekOf(e.firstDate), weekOf(e.lastDate), e.room])
  }

  const courses: ParsedCourse[] = []
  for (const { key, chunks, interval } of groups.values()) {
    const sorted = [...chunks].sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
    const emit = (startWeek: number, endWeek: number, type: number, room: string) => {
      courses.push({
        groupId: '', tableId: defaultTableId, courseName: key.name, alias: '',
        teacher: key.teacher, room, note: '', day: key.day,
        startNode: key.node, step: key.step,
        startWeek, endWeek, type, color: defaultColor,
        ownTime: false, startTime: '', endTime: '',
      })
    }
    const spans = sorted.map((c) => [c[0], c[1]] as [number, number])
    const contiguous = spans.every((b, i) => i === 0 || b[0] - spans[i - 1][1] === 1)
    const allSingleSameParitySpaced2 = (): boolean => {
      if (spans.some((s) => s[0] !== s[1])) return false
      const parities = new Set(spans.map((s) => ((s[0] % 2) + 2) % 2))
      if (parities.size !== 1) return false
      return spans.every((s, i) => i === 0 || s[0] - spans[i - 1][0] === 2)
    }

    if (spans.length === 1) {
      emit(spans[0][0], spans[0][1], 0, sorted[0][2])
    } else if (contiguous) {
      emit(spans[0][0], spans[spans.length - 1][1], 0, sorted[0][2])
    } else if (interval === 2 || allSingleSameParitySpaced2()) {
      const startW = spans[0][0]
      emit(startW, spans[spans.length - 1][0], ((startW % 2) + 2) % 2 === 1 ? 1 : 2, sorted[0][2])
    } else {
      // 散周: 按教室分段合并连续段
      let curRoom: string | null = null
      let curStart = 0
      let curEnd = 0
      for (const [a, b, r] of sorted) {
        if (r === curRoom && a <= curEnd + 1) {
          curEnd = Math.max(curEnd, b)
        } else {
          if (curRoom !== null) emit(curStart, curEnd, 0, curRoom)
          curRoom = r
          curStart = a
          curEnd = b
        }
      }
      if (curRoom !== null) emit(curStart, curEnd, 0, curRoom)
    }
  }

  const timeMap = isNeuIcs ? buildNeuTimetable(neuBlocks) : nodeTimes
  return lossless(
    '导入的 ICS 课表',
    isoOf(anchor),
    courses,
    buildTimeJson(timeMap),
    timeMap.size === 0 ? 0 : Math.max(...timeMap.keys()),
    false,
  )
}

// ---- Date 工具 (UTC 语义, 防时区漂移) ----

function mkDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}
function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}
/** ISO 周一 = 该日所在周的周一 (Java with(DayOfWeek.MONDAY) 语义) */
function toMonday(d: Date): Date {
  const dow = d.getUTCDay() // 0=Sun
  return addDays(d, -((dow + 6) % 7))
}

function parseIcsDate(s: string): Date | null {
  if (s.length < 8) return null
  const y = parseInt(s.substring(0, 4), 10)
  const m = parseInt(s.substring(4, 6), 10)
  const d = parseInt(s.substring(6, 8), 10)
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return null
  return mkDate(y, m, d)
}

function extractIcsDate(block: string): Date | null {
  const dtstart = extractIcsField(block, 'DTSTART')
  if (dtstart === null) return null
  return parseIcsDate(dtstart.split('T')[0].slice(0, 8))
}

/** DESCRIPTION "第X - Y节" → [X, Y-X+1]; 兼容 Sleepy 导出(无此行 → null) */
function extractIcsNode(description: string): [number, number] | null {
  const m = /第\s*(\d+)\s*[-–]\s*(\d+)\s*节/.exec(description)
  if (!m) return null
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  if (a < 1 || b < a) return null
  return [a, b - a + 1]
}

/** ICS 字段提取(容忍折行: 下一行以空格开头) */
function extractIcsField(block: string, name: string): string | null {
  const regex = new RegExp(`^${name}(?:;[^:]*)?:(.*(?:\\n .*)*)`, 'm')
  const m = regex.exec(block)
  if (!m) return null
  return m[1].replace(/\n /g, '').trim()
}

/** NEU 块模型 (issue #28): 原子块 = 起止间不含其他事件开始时刻 */
function analyzeNeuBlocks(text: string): NeuBlock[] {
  const shapes: Array<[number, number]> = []
  for (const raw of text.split('BEGIN:VEVENT').slice(1)) {
    const endIdx = raw.indexOf('END:VEVENT')
    const block = endIdx > 0 ? raw.substring(0, endIdx) : raw
    const startS = extractIcsField(block, 'DTSTART')
    const endS = extractIcsField(block, 'DTEND')
    if (startS === null || endS === null) continue
    const st = parseIcsTimeOfDaySafe(startS.split('T')[1]?.slice(0, 6) ?? '')
    const fin = parseIcsTimeOfDaySafe(endS.split('T')[1]?.slice(0, 6) ?? '')
    if (st === null || fin === null || st >= fin) continue
    shapes.push([st, fin])
  }
  const startTimes = [...new Set(shapes.map((s) => s[0]))].sort((a, b) => a - b)
  let acc = 1
  return startTimes.map((s) => {
    // 原子块终点 = 该开始时刻所有事件里最早的结束时刻(连排事件终点属于后面的块)
    const end = Math.min(...shapes.filter((x) => x[0] === s).map((x) => x[1]))
    const nodeCount = Math.max(1, Math.round((end - s) / 50))
    const blk: NeuBlock = { startMin: s, endMin: end, nodeCount, firstNode: acc }
    acc += nodeCount
    return blk
  })
}

/** 事件 → [firstNode, step]: 终点=某块终点 → 跨块; 否则按起点块每节分钟数折算 */
function neuSpanFor(blocks: NeuBlock[], block: string): [number, number] | null {
  const dtstart = extractIcsField(block, 'DTSTART')
  const dtend = extractIcsField(block, 'DTEND')
  if (dtstart === null || dtend === null) return null
  const start = parseIcsTimeOfDaySafe(dtstart.split('T')[1]?.slice(0, 6) ?? '')
  const end = parseIcsTimeOfDaySafe(dtend.split('T')[1]?.slice(0, 6) ?? '')
  if (start === null || end === null) return null
  const i = blocks.findIndex((b) => b.startMin === start)
  if (i < 0) return null
  const b = blocks[i]
  const j = blocks.findIndex((x) => x.endMin === end)
  if (j > i) return [b.firstNode, blocks[j].firstNode + blocks[j].nodeCount - 1 - b.firstNode + 1]
  const perNode = (b.endMin - b.startMin) / b.nodeCount
  const step = Math.max(1, Math.round((end - start) / perNode))
  return [b.firstNode, step]
}

/** 块模型 → 节次表: 块内均匀插值截断到分钟, 块间空档不产生行 */
function buildNeuTimetable(blocks: NeuBlock[]): Map<number, [Clock, Clock]> {
  const out = new Map<number, [Clock, Clock]>()
  for (const b of blocks) {
    const perNodeSec = ((b.endMin - b.startMin) * 60) / b.nodeCount
    for (let k = 0; k < b.nodeCount; k++) {
      const startSec = b.startMin * 60 + k * perNodeSec
      const endSec = b.startMin * 60 + (k + 1) * perNodeSec
      const s = minOfClock(Math.round(startSec / 60))
      const e = minOfClock(Math.round(endSec / 60))
      out.set(b.firstNode + k, [s, e])
    }
  }
  return out
}

function minOfClock(totalMin: number): Clock {
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 }
}

/** DTSTART 时间 → 节次 (50min 周期近似 + 10min 防边界抖动; 8:00=第1节) */
function extractIcsTime(block: string): [number, number] | null {
  const dtstart = extractIcsField(block, 'DTSTART')
  const dtend = extractIcsField(block, 'DTEND')
  if (dtstart === null || dtend === null) return null
  const start = parseIcsTimeOfDaySafe(dtstart.split('T')[1]?.slice(0, 6) ?? '')
  const end = parseIcsTimeOfDaySafe(dtend.split('T')[1]?.slice(0, 6) ?? '')
  if (start === null || end === null) return null
  const duration = end - start
  const startNode = Math.floor((start - 480 + 10) / 50) + 1
  const step = Math.max(1, Math.round(duration / 50))
  return [Math.max(1, startNode), step]
}

function parseIcsTimeOfDaySafe(s: string): number | null {
  // "HHmmss" → 当日分钟; 非法 null
  if (s.length < 4 || !/^\d{4,6}$/.test(s)) return null
  const h = parseInt(s.substring(0, 2), 10)
  const m = parseInt(s.substring(2, 4), 10)
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 星期几: 优先 DTSTART 日期推算, 退 RRULE.BYDAY */
function extractIcsDayOfWeek(block: string): number | null {
  const dtstart = extractIcsField(block, 'DTSTART')
  if (dtstart !== null) {
    const dateStr = dtstart.split('T')[0].slice(0, 8)
    if (dateStr.length === 8) {
      const date = parseIcsDate(dateStr)
      if (date !== null) {
        const dow = date.getUTCDay() // 0=Sun
        return dow === 0 ? 7 : dow
      }
    }
  }
  const rrule = extractIcsField(block, 'RRULE')
  if (rrule === null) return null
  const m = /BYDAY=([A-Z]{2})/.exec(rrule)
  if (!m) return null
  const map: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }
  return map[m[1]] ?? null
}

/** 单 VEVENT 收割节次边界: step≤2 逐节锚定; step>2 只锚两端 */
function harvestNodeTimes(
  block: string,
  startNode: number,
  step: number,
  out: Map<number, [Clock, Clock]>,
): void {
  const dtstart = extractIcsField(block, 'DTSTART')
  const dtend = extractIcsField(block, 'DTEND')
  if (dtstart === null || dtend === null) return
  const start = parseIcsTimeOfDaySafe(dtstart.split('T')[1]?.slice(0, 6) ?? '')
  const end = parseIcsTimeOfDaySafe(dtend.split('T')[1]?.slice(0, 6) ?? '')
  if (start === null || end === null || start >= end) return

  const endNode = startNode + step - 1
  if (step <= 2) {
    for (let n = startNode; n <= endNode; n++) {
      const prev = out.get(n)
      const s = n === startNode ? minOfClock(start) : prev?.[0] ?? minOfClock(start)
      const e = n === endNode ? minOfClock(end) : prev?.[1] ?? minOfClock(end)
      out.set(n, [s, e])
    }
  } else {
    const prevFirst = out.get(startNode)
    const prevLast = out.get(endNode)
    out.set(startNode, [minOfClock(start), prevFirst?.[1] ?? minOfClock(end)])
    out.set(endNode, [prevLast?.[0] ?? minOfClock(start), minOfClock(end)])
  }
}

// ---- 纯文本 ----

const TIME_TABLE_REGEX = /^\s*(?:时间表|节次|第)?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*节?\s*[\s:：]*\s*(\d{1,2}):(\d{2})\s*[-–~～至\s]+\s*(\d{1,2}):(\d{2})\s*$/

/** TIME 块标识(宽松: 大小写/2-4 括号/-_ 空格变体) */
function timeMarkerRegex(kind: string): RegExp {
  const k = kind.toLowerCase()
  return new RegExp(`[<{(]{2,4}\\s*SLEEPY\\s*[-_ ]?\\s*TIME\\s*[-_ ]?\\s*${k}\\s*[>})]{2,4}`, 'i')
}

/** 切出作息块: 双标识严格 / 单 BEGIN 自愈吞行 / 无标识裸行兼容 */
function extractTimeBlock(text: string): [string, string] {
  const beginM = timeMarkerRegex('begin').exec(text)
  if (!beginM) return [text, '']
  const afterBegin = text.substring(beginM.index + beginM[0].length)
  const endM = timeMarkerRegex('end').exec(afterBegin)
  if (endM) {
    return [afterBegin.substring(endM.index + endM[0].length), afterBegin.substring(0, endM.index)]
  }
  // TIME-END 缺失: 吞连续作息行, 首个非作息行起归还正文
  const lines = afterBegin.split('\n')
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (l.trim() === '' || TIME_TABLE_REGEX.test(l.trim())) i++
    else break
  }
  return [lines.slice(i).join('\n'), lines.slice(0, i).filter((l) => l.trim() !== '').join('\n')]
}

function parseSimpleText(text: string, defaultTableId: number, defaultColor: string): ParseResult {
  const courses: ParsedCourse[] = []
  const dropped: string[] = []
  const nodeTimes = new Map<number, [Clock, Clock]>()

  const [courseText, timeBlock] = extractTimeBlock(text)
  const timeBlockDropped: string[] = []
  for (const tl of timeBlock.split('\n')) {
    if (tl.trim() === '') continue
    const tt = TIME_TABLE_REGEX.exec(tl)
    if (!tt) {
      timeBlockDropped.push(tl.trim().slice(0, 40))
      continue
    }
    if (applyTimeTableRow(tt, nodeTimes)) continue
    timeBlockDropped.push(tl.trim().slice(0, 40))
  }

  const lines = courseText.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))

  for (const raw of lines) {
    // 裸作息行兼容: "带两个 HH:mm 的行"必是时间表行(课程行不含冒号)
    const tt = TIME_TABLE_REGEX.exec(raw)
    if (tt !== null) {
      applyTimeTableRow(tt, nodeTimes)
      continue
    }
    // 剥 Markdown: 管道表格行 + |---| 分隔行 + 星号加粗 + 反引号
    let line = raw.trim()
    if (/^\|?[\s|:-]+\|?$/.test(line)) continue
    if (line.startsWith('|') || line.endsWith('|')) {
      line = line.replace(/^\|+/, '').replace(/\|+$/, '').replace(/\s*\|\s*/g, '\t')
    }
    line = line.replace(/\*\*/g, '').replace(/`/g, '').trim()

    const parts = line.split(/\s+|，/).map((p) => p.trim()).filter((p) => p !== '')
    if (parts.length < 6) {
      if (line !== '') dropped.push(line.slice(0, 40))
      continue
    }

    const name = parts[0]
    const teacher = parts[1]
    const room = parts[2]
    // 纯数字 0/8 越界也收(钳 1..7), 其余 parseDay(周一/Monday)
    const dayNum = strictInt(parts[3]) ?? parseDayCsv(parts[3])
    if (dayNum === null) {
      dropped.push(line.slice(0, 40))
      continue
    }
    const day = Math.min(7, Math.max(1, dayNum))
    const nodeRange = parseRange(parts[4])
    if (nodeRange === null) {
      dropped.push(line.slice(0, 40))
      continue
    }
    const [ns, ne] = sortRange(nodeRange)
    const step = Math.max(1, ne - ns + 1)
    const weekRange = parseRange(parts[5])
    if (weekRange === null) {
      dropped.push(line.slice(0, 40))
      continue
    }
    const [sw, ew] = sortRange(weekRange)
    const type = parts[6] !== undefined ? parseType(parts[6]) : 3

    courses.push({
      groupId: '', tableId: defaultTableId, courseName: name, alias: '',
      teacher, room, note: '', day,
      startNode: ns, step, startWeek: sw, endWeek: ew, type, color: defaultColor,
      ownTime: false, startTime: '', endTime: '',
    })
  }

  if (courses.length === 0) throw new Error('未能解析任何课程')

  const courseReach = Math.max(...courses.map((c) => c.startNode + c.step - 1))
  const nodesPerDay = Math.max(nodeTimes.size === 0 ? 0 : Math.max(...nodeTimes.keys()), courseReach)
  return {
    tableName: '导入的课表',
    startDate: todayISO(),
    courses,
    timeJson: buildTimeJson(nodeTimes),
    nodesPerDay,
    droppedLines: [...dropped, ...timeBlockDropped],
    warnings: [],
    maxWeek: 0,
    groupIdsAuthoritative: false,
    periodTable: null,
  }
}

/** 作息正则捕获组 → nodeTimes; 形状/逻辑非法 false */
function applyTimeTableRow(tt: RegExpExecArray, nodeTimes: Map<number, [Clock, Clock]>): boolean {
  const startNode = strictInt(tt[1])
  const endNode = tt[2] !== undefined ? strictInt(tt[2]) ?? startNode : startNode
  const st = mkClock(tt[3], tt[4])
  const et = mkClock(tt[5], tt[6])
  if (startNode === null || endNode === null || endNode < startNode || st === null || et === null || !clockBefore(st, et)) return false
  for (let node = startNode; node <= endNode; node++) nodeTimes.set(node, [st, et])
  return true
}

function mkClock(h: string, m: string): Clock | null {
  const hh = parseInt(h, 10)
  const mm = parseInt(m, 10)
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh > 23 || mm > 59) return null
  return { h: hh, m: mm }
}

function strictInt(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s.trim())) return null
  return parseInt(s.trim(), 10)
}

function sortRange(p: [number, number]): [number, number] {
  return p[0] <= p[1] ? p : [p[1], p[0]]
}

function parseRange(s: string): [number, number] | null {
  const parts = s.split(/[-~至]/)
  if (parts.length === 1) {
    const n = strictInt(parts[0])
    return n === null ? null : [n, n]
  }
  if (parts.length !== 2) return null
  const start = strictInt(parts[0])
  const end = strictInt(parts[1])
  if (start === null || end === null) return null
  return [start, end]
}

// ---- CSV ----

function isLikelyCsv(s: string): boolean {
  if (s.split('\n').length < 2) return false
  const firstLine = (s.split('\n')[0] ?? '').toLowerCase()
  if (!firstLine.includes(',')) return false
  const hasCourse = firstLine.includes('课程') || firstLine.includes('course') || firstLine.includes('name')
  const hasTeacher = firstLine.includes('教师') || firstLine.includes('老师') || firstLine.includes('teacher')
  const hasDay = firstLine.includes('星期') || firstLine.includes('周几') || firstLine.includes('day') || firstLine.includes('周次')
  return hasCourse && (hasTeacher || hasDay)
}

/** "星期"列: 周一/1/Monday/mon */
function parseDayCsv(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (t === '') return null
  const n = strictInt(t)
  if (n !== null) return n >= 1 && n <= 7 ? n : null
  if (t.includes('周')) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
    for (const [k, v] of Object.entries(map)) if (t.includes(k)) return v
  }
  const enMap: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }
  for (const [k, v] of Object.entries(enMap)) if (t.startsWith(k)) return v
  return null
}

/** 类型列: 空/未知 → 3 (不再回退 0=每周, 防"周次=6 单次实验"误标每周) */
function parseType(s: string): number {
  const t = s.trim().toLowerCase()
  if (t === '') return 3
  if (t === '0' || t === '每周' || t === '每周都上') return 0
  if (t.includes('单') || t === '1' || t === 'odd') return 1
  if (t.includes('双') || t === '2' || t === 'even') return 2
  if (t === '3' || t.includes('自定义') || t.includes('按周次')) return 3
  return 3
}

/** 周次多区间: "2-5,7-9,11-14" / 离散 "11,13,15" / 单周 "5" */
function parseWeekRanges(s: string): Array<[number, number]> {
  if (s.trim() === '') return []
  const result: Array<[number, number]> = []
  for (const part of s.split(/[,，;；]/)) {
    const t = part.trim()
    if (t === '') continue
    const pair = parseRange(t)
    if (pair !== null) result.push(pair)
  }
  return result
}

/** CSV 引号转义解析 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let sb = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && i + 1 < n && text[i + 1] === '"') {
        sb += '"'
        i += 2
      } else if (c === '"') {
        inQuotes = false
        i++
      } else {
        sb += c
        i++
      }
    } else if (c === '"') {
      inQuotes = true
      i++
    } else if (c === ',') {
      cur.push(sb)
      sb = ''
      i++
    } else if (c === '\n') {
      cur.push(sb)
      sb = ''
      rows.push(cur)
      cur = []
      i++
    } else if (c === '\r') {
      i++
    } else {
      sb += c
      i++
    }
  }
  if (sb !== '' || cur.length > 0) {
    cur.push(sb)
    rows.push(cur)
  }
  return rows
}

function parseCsv(text: string, defaultTableId: number, defaultColor: string): ParseResult {
  const rows = parseCsvRows(text)
  if (rows.length < 2) throw new Error('CSV 至少需要表头 + 1 行数据')

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const findCol = (...keys: string[]): number | null => {
    for (const k of keys) {
      const idx = header.findIndex((h) => h.includes(k.toLowerCase()))
      if (idx >= 0) return idx
    }
    return null
  }

  const nameIdx = findCol('课程名', '课程', '名称', 'course', 'name')
  if (nameIdx === null) throw new Error('找不到课程名列')
  const teacherIdx = findCol('教师', '老师', 'teacher')
  const roomIdx = findCol('教室', '位置', '地点', 'room', 'position')
  const timeStartIdx = findCol('开始时间', '上课时间', 'start time', 'starttime')
  const timeEndIdx = findCol('结束时间', '下课时间', 'end time', 'endtime')
  const dayIdx = findCol('星期', '周几', 'day')
  if (dayIdx === null) throw new Error('找不到星期列')
  const nodeStartIdx = findCol('开始节数', '开始节次', '起节', '节次起', 'start node')
  const nodeEndIdx = findCol('结束节数', '结束节次', '止节', '节次止', 'end node')
  const nodeIdx = nodeStartIdx === null && nodeEndIdx === null
    ? findCol('节次', '节点', '上课节次', 'node', '节', 'class')
    : null
  const weekIdx = findCol('周次', '周数', 'weeks', 'week')
  if (weekIdx === null) throw new Error('找不到周次列')
  const typeIdx = findCol('类型', 'type', '周类型')
  const noteIdx = findCol('备注', 'note', 'remark')

  if (nodeStartIdx === null && nodeEndIdx === null && nodeIdx === null) {
    throw new Error('找不到节次列（需要 \'节次\' 或 \'开始节数\'+\'结束节数\'）')
  }

  const courses: ParsedCourse[] = []
  const nodeTimes = new Map<number, [Clock, Clock]>()
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || row.every((c) => c.trim() === '')) continue
    const cell = (idx: number | null): string => (idx === null ? '' : row[idx]?.trim() ?? '')

    const name = cell(nameIdx)
    if (name === '') continue

    const day = parseDayCsv(cell(dayIdx))
    if (day === null) continue

    let nodeStart: number
    let nodeEnd: number
    if (nodeStartIdx !== null && nodeEndIdx !== null) {
      const s = strictInt(cell(nodeStartIdx))
      const e = strictInt(cell(nodeEndIdx))
      if (s === null || e === null) continue
      nodeStart = s
      nodeEnd = e
    } else {
      const r = parseRange(cell(nodeIdx))
      if (r === null) continue
      nodeStart = r[0]
      nodeEnd = r[1]
    }
    const step = Math.max(1, nodeEnd - nodeStart + 1)

    // 时间列收割: 该行真实起止钟点 → 首末节边界作息
    if (timeStartIdx !== null && timeEndIdx !== null) {
      const tr = parseTimeRange(`${cell(timeStartIdx)}-${cell(timeEndIdx)}`)
      if (tr !== null) {
        const [st, et] = tr
        const prevFirst = nodeTimes.get(nodeStart)
        nodeTimes.set(nodeStart, [prevFirst?.[0] ?? st, nodeEnd === nodeStart ? et : prevFirst?.[1] ?? et])
        if (nodeEnd !== nodeStart) {
          const prevLast = nodeTimes.get(nodeEnd)
          nodeTimes.set(nodeEnd, [prevLast?.[0] ?? st, et])
        }
      }
    }

    const weekRanges = parseWeekRanges(cell(weekIdx))
    if (weekRanges.length === 0) continue

    const teacher = cell(teacherIdx)
    const room = cell(roomIdx)
    const note = cell(noteIdx)
    const type = parseType(cell(typeIdx))

    for (const [startWeek, endWeek] of weekRanges) {
      courses.push({
        groupId: '', tableId: defaultTableId, courseName: name, alias: '',
        teacher, room, note, day,
        startNode: nodeStart, step, startWeek, endWeek, type, color: defaultColor,
        ownTime: false, startTime: '', endTime: '',
      })
    }
  }

  if (courses.length === 0) throw new Error('未能解析任何课程')

  const courseReach = Math.max(...courses.map((c) => c.startNode + c.step - 1))
  const nodesPerDay = Math.max(nodeTimes.size === 0 ? 0 : Math.max(...nodeTimes.keys()), courseReach)
  return {
    tableName: '导入的 CSV 课表',
    startDate: todayISO(),
    courses,
    timeJson: buildTimeJson(nodeTimes),
    nodesPerDay,
    droppedLines: [],
    warnings: [],
    maxWeek: 0,
    groupIdsAuthoritative: false,
    periodTable: null,
  }
}

/** "08:00-09:35" / "08:00~09:35" → Clock 对; 非法/逆序 null */
function parseTimeRange(s: string): [Clock, Clock] | null {
  const m = /(\d{1,2}):(\d{2})\s*[-–~～至\s]+\s*(\d{1,2}):(\d{2})/.exec(s)
  if (!m) return null
  const st = mkClock(m[1], m[2])
  const et = mkClock(m[3], m[4])
  if (st === null || et === null || !clockBefore(st, et)) return null
  return [st, et]
}

// ---- HTML ----

function parseHtml(text: string, defaultTableId: number, defaultColor: string): ParseResult {
  const tables = extractHtmlTables(text)
  if (tables.length === 0) throw new Error('HTML 中未找到表格')

  const courses: ParsedCourse[] = []
  for (const rows of tables) {
    if (rows.length === 0) continue
    courses.push(...parseHtmlTableRows(rows, defaultTableId, defaultColor))
  }
  if (courses.length === 0) throw new Error('HTML 中未能解析出任何课程')
  return lossless('导入的 HTML 课表', todayISO(), courses, '', 0, false)
}

function extractHtmlTables(html: string): string[][][] {
  const tables: string[][][] = []
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi
  const tagRegex = /<[^>]+>/g

  let tMatch: RegExpExecArray | null
  while ((tMatch = tableRegex.exec(html)) !== null) {
    const tableBody = tMatch[1]
    const rows: string[][] = []
    let trMatch: RegExpExecArray | null
    trRegex.lastIndex = 0
    while ((trMatch = trRegex.exec(tableBody)) !== null) {
      const trBody = trMatch[1]
      const cells: string[] = []
      let cellMatch: RegExpExecArray | null
      cellRegex.lastIndex = 0
      while ((cellMatch = cellRegex.exec(trBody)) !== null) {
        cells.push(
          cellMatch[2]
            .replace(tagRegex, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim(),
        )
      }
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) tables.push(rows)
  }
  return tables
}

function parseHtmlTableRows(rows: string[][], defaultTableId: number, defaultColor: string): ParsedCourse[] {
  // 表头行识别: 含 课程/course/name
  const headerIdx = rows.findIndex((row) => {
    const t = row.join(' ').toLowerCase()
    return t.includes('课程') || t.includes('course') || t.includes('name')
  })
  if (headerIdx < 0) {
    // 退化: 按文本行走 parseSimpleText
    const text = rows.flat().join('\n')
    try {
      return parseSimpleText(text, defaultTableId, defaultColor).courses
    } catch {
      return []
    }
  }
  const header = rows[headerIdx].map((h) => h.trim().toLowerCase())
  const findCol = (...keys: string[]): number | null => {
    for (const k of keys) {
      const idx = header.findIndex((h) => h.includes(k.toLowerCase()))
      if (idx >= 0) return idx
    }
    return null
  }
  const nameIdx = findCol('课程', 'course', 'name')
  if (nameIdx === null) return []
  const teacherIdx = findCol('教师', '老师', 'teacher')
  const roomIdx = findCol('教室', '位置', 'room', 'position', '地点')
  const dayIdx = findCol('星期', '周几', 'day')
  const nodeStartIdx = findCol('开始节数', '开始节次', '起节', '节次起', 'start node')
  const nodeEndIdx = findCol('结束节数', '结束节次', '止节', '节次止', 'end node')
  const nodeIdx = nodeStartIdx === null && nodeEndIdx === null
    ? findCol('节次', '节点', 'node', '上课节次')
    : null
  const weekIdx = findCol('周次', '周数', 'weeks', 'week')
  const typeIdx = findCol('类型', 'type')
  const noteIdx = findCol('备注', 'note')

  if (nodeStartIdx === null && nodeEndIdx === null && nodeIdx === null) return []
  if (weekIdx === null) return []

  const courses: ParsedCourse[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length === 0 || row.every((c) => c.trim() === '')) continue
    const cell = (idx: number | null): string => (idx === null ? '' : row[idx]?.trim() ?? '')

    const name = cell(nameIdx)
    if (name === '') continue
    const dayRaw = cell(dayIdx)
    const day = parseDayCsv(dayRaw)
    if (day === null) continue

    let nodeStart: number
    let nodeEnd: number
    if (nodeStartIdx !== null && nodeEndIdx !== null) {
      const s = strictInt(cell(nodeStartIdx))
      const e = strictInt(cell(nodeEndIdx))
      if (s === null || e === null) continue
      nodeStart = s
      nodeEnd = e
    } else {
      const r = parseRange(cell(nodeIdx))
      if (r === null) continue
      nodeStart = r[0]
      nodeEnd = r[1]
    }
    const step = Math.max(1, nodeEnd - nodeStart + 1)
    const weekRanges = parseWeekRanges(cell(weekIdx))
    if (weekRanges.length === 0) continue
    const type = parseType(cell(typeIdx))
    const teacher = cell(teacherIdx)
    const room = cell(roomIdx)
    const note = cell(noteIdx)

    for (const [startWeek, endWeek] of weekRanges) {
      courses.push({
        groupId: '', tableId: defaultTableId, courseName: name, alias: '',
        teacher, room, note, day,
        startNode: nodeStart, step, startWeek, endWeek, type, color: defaultColor,
        ownTime: false, startTime: '', endTime: '',
      })
    }
  }
  return courses
}
