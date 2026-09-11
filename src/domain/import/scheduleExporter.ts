import { javaStringHash } from './uuid'
import { parseNodes } from '../timeTable'

/**
 * 课表导出器 — Kotlin ScheduleExporter.kt 1:1 移植
 * 1. WakeUp 兼容 JSON (原版 WakeUp app 可导入)
 * 2. WakeUp 分享文本 (URL 编码 courseDetailJson)
 * 3. ICS 日历 (系统日历 / Google / Apple)
 */

export interface ExportTable {
  id: number
  name: string
  startDate: string
  maxWeek: number
  nodesPerDay: number
  timeJson: string
  color: string
}

export interface ExportCourse {
  id: number
  groupId: string
  tableId: number
  courseName: string
  alias: string
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
  ownTime: boolean
  startTime: string
  endTime: string
}

function courseJsonArr(courses: ExportCourse[]): string {
  const arr = courses.map((c) => ({
    name: c.courseName,
    teacher: c.teacher,
    position: c.room,
    day: c.day,
    startNode: c.startNode,
    step: c.step,
    startWeek: c.startWeek,
    endWeek: c.endWeek,
    type: c.type,
    color: c.color,
  }))
  return JSON.stringify(arr)
}

/** 导出 WakeUp 兼容 JSON (pretty, 2 空格缩进 ≈ kotlinx prettyPrint) */
export function exportWakeUpJson(table: ExportTable, courses: ExportCourse[]): string {
  const obj = {
    name: table.name,
    startDate: table.startDate,
    tableInfo: {
      name: table.name,
      startDate: table.startDate,
      maxWeek: table.maxWeek,
      nodesPerDay: table.nodesPerDay,
      time: table.timeJson,
    },
    courses: courses.map((c) => ({
      name: c.courseName,
      teacher: c.teacher,
      position: c.room,
      day: c.day,
      startNode: c.startNode,
      step: c.step,
      startWeek: c.startWeek,
      endWeek: c.endWeek,
      type: c.type,
      color: c.color,
    })),
  }
  return JSON.stringify(obj, null, 2)
}

/** WakeUp 分享文本格式 (URL 编码的 courseDetailJson) */
export function exportWakeUpShareText(table: ExportTable, courses: ExportCourse[]): string {
  // kotlinx prettyPrint 的数组形态, URL 编码 (空格→+ 与 URLEncoder 一致)
  const courseDetailJson = courseJsonArr(courses)
    .replace(/,/g, ', ')
    .replace(/\{/g, '{ ')
    .replace(/:/g, ': ')
    .replace(/\}/g, ' }')
    .replace(/\[/g, '[\n    ')
    .replace(/\]/g, '\n  ]')
  const encoded = encodeURIComponent(courseDetailJson).replace(/%20/g, '+')

  const root = {
    name: table.name,
    startDate: table.startDate,
    courseDetailJson: encoded,
  }
  return '【来自Sleepy】\n课程分享：\n\n' + JSON.stringify(root, null, 2)
}

/** 导出 ICS 日历 */
export function exportIcs(table: ExportTable, courses: ExportCourse[]): string {
  const sb: string[] = []
  sb.push('BEGIN:VCALENDAR')
  sb.push('VERSION:2.0')
  sb.push('PRODID:-//Sleepy//课程表//ZH')
  sb.push('CALSCALE:GREGORIAN')
  sb.push('METHOD:PUBLISH')
  sb.push(`X-WR-CALNAME:${table.name}`)

  // 学期起始日规范为周一 (应用约定 day=1 对应周一)
  const startDate = parseIsoDate(table.startDate)
  const start = toMonday(startDate ?? new Date())
  const nodeStartTimes = parseNodeTimes(table.timeJson)

  for (const c of courses) {
    // 单双周按起止周奇偶选第一个实际发生周
    const firstWeek = c.type === 1
      ? (c.startWeek % 2 === 1 ? c.startWeek : c.startWeek + 1)
      : c.type === 2
        ? (c.startWeek % 2 === 0 ? c.startWeek : c.startWeek + 1)
        : c.startWeek
    // 起止周奇偶不符无实际发生周 → 跳过
    if (firstWeek > c.endWeek) continue

    const firstDate = addDays(addWeeks(start, firstWeek - 1), c.day - 1)
    const endDate = addDays(addWeeks(start, c.endWeek - 1), c.day - 1)
    const ymd = (d: Date) => isoOf(d).replace(/-/g, '')

    let startTime: string
    let endTime: string
    if (c.ownTime && c.startTime !== '' && c.endTime !== '') {
      startTime = compactTime(c.startTime)
      endTime = compactTime(c.endTime)
    } else {
      startTime = nodeStartTimes[c.startNode - 1]?.[0] ?? '080000'
      endTime = nodeStartTimes[c.startNode + c.step - 2]?.[1] ?? '090000'
    }

    const dtStart = `${ymd(firstDate)}T${startTime}`
    const dtEnd = `${ymd(firstDate)}T${endTime}`

    const byDayMap: Record<number, string> = { 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU' }
    const byDay = byDayMap[c.day] ?? null

    const interval = c.type === 1 || c.type === 2 ? ';INTERVAL=2' : ''
    const until = `;UNTIL=${ymd(endDate)}T235959Z`

    sb.push('BEGIN:VEVENT')
    // UID: id-javaHashCode(courseName)@sleepy — javaStringHash 保证跨端一致
    sb.push(`UID:${c.id}-${javaStringHash(c.courseName)}@sleepy`)
    sb.push(`DTSTAMP:${dtstampUtcNow()}`)
    sb.push(`DTSTART:${dtStart}`)
    sb.push(`DTEND:${dtEnd}`)
    sb.push(byDay !== null ? `RRULE:FREQ=WEEKLY;BYDAY=${byDay}${interval}${until}` : `RRULE:FREQ=WEEKLY${interval}${until}`)
    sb.push(`SUMMARY:${escapeIcs(c.courseName)}`)
    if (c.room.trim() !== '') sb.push(`LOCATION:${escapeIcs(c.room)}`)
    // 无损闭环: DESCRIPTION 写"第X-Y节"(字面 \n, 与 WakeUp 格式一致)
    const ownTimeLine = c.ownTime && c.startTime !== '' && c.endTime !== ''
      ? `\\n${c.startTime}-${c.endTime}` : ''
    sb.push(
      `DESCRIPTION:第${c.startNode} - ${c.startNode + c.step - 1}节` +
      (c.room.trim() !== '' ? `\\n${escapeIcs(c.room)}` : '') +
      (c.teacher.trim() !== '' ? `\\n${escapeIcs(c.teacher)}` : '') +
      ownTimeLine,
    )
    sb.push('END:VEVENT')
  }
  sb.push('END:VCALENDAR')
  return sb.join('\n')
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

/** "HH:mm" → ICS "HHmmss" */
function compactTime(hhmm: string): string {
  const t = hhmm.replace(/:/g, '').trim()
  return t.length === 4 ? `${t}00` : t
}

/** timeJson → [[startCompact, endCompact]] (去冒号, 4 位补 00); 解析失败 [] */
function parseNodeTimes(jsonStr: string): Array<[string, string]> {
  try {
    const nodes = parseNodes(jsonStr)
    const compact = (s: string): string => {
      const t = s.replace(/:/g, '')
      return t.length === 4 ? `${t}00` : t
    }
    return nodes.map((n) => [compact(n.start), compact(n.end)] as [string, string])
  } catch {
    return []
  }
}

// ---- Date 工具 (UTC 语义) ----

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim())
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return new Date(Date.UTC(y, mo - 1, d))
}

function toMonday(d: Date): Date {
  const dow = d.getUTCDay()
  return addDays(d, -((dow + 6) % 7))
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}
function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7)
}
function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** DTSTAMP: UTC now → yyyymmddThhmmssZ */
function dtstampUtcNow(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const y = now.getUTCFullYear()
  const mo = p(now.getUTCMonth() + 1)
  const d = p(now.getUTCDate())
  const h = p(now.getUTCHours())
  const mi = p(now.getUTCMinutes())
  const s = p(now.getUTCSeconds())
  return `${y}${mo}${d}T${h}${mi}${s}Z`
}
