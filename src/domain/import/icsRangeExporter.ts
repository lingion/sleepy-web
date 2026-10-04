/**
 * 日期展开 ICS 导出 — SystemCalendarManager.buildEventSpecs 的 web 对位。
 * Android 把课表"导入系统日历"为逐日事件 (范围: 未来7天/1个月/本学期, 考虑调休);
 * web 无系统日历写权限 → 同语义产出 .ics 文件, 由用户导入任意日历应用。
 *
 * 事件语义逐条对齐 buildEventSpecs:
 *  - 日期区间 [max(today, semesterStart), min(requestedEnd, semesterEnd)) 逐日扫描;
 *  - 每日课次 = day == effectiveDayOfWeek(date, transfers) && inWeek(week)
 *    (transfers 由调用方在 applyTransfers=false 时传空数组);
 *  - 时间非法 (end <= start) 的课跳过 (Android invalid++);
 *  - DESCRIPTION 带 week/节次/教师/备注/调课标注 + "Sleepy import key:" 标记;
 *  - VALARM 提前提醒 (Android REMINDER_MINUTES 对位), 首日首课闹钟标记保留在描述文本。
 */

import { parseNodes } from '../timeTable'
import { inWeek, normalizeNode } from '../../data/types'
import type { Course } from '../../data/types'
import type { ExportCourse, ExportTable } from './scheduleExporter'
import type { HolidayTransferEntry } from '../holiday/transfers'
import { effectiveDayOfWeek } from '../holiday/transfers'
import { mondayOfStart, currentWeek } from '../semester'

export type IcsRange = 'NEXT_WEEK' | 'NEXT_MONTH' | 'SEMESTER'

export interface DatedIcsOptions {
  range: IcsRange
  today: Date
  /** 生效调休映射 (calendarApplyTransfers=false 时传 []) */
  transfers: HolidayTransferEntry[]
  /** 事件提前提醒分钟; null = 不加 VALARM */
  reminderMinutes: number | null
  /** 首日首课闹钟标记写入描述 (web 日历无法单独设闹钟, 文本对位 firstPeriodAlarm) */
  firstAlarmEnabled: boolean
  firstAlarmMinutes: number
}

const SLEEPY_MARKER_PREFIX = 'Sleepy import key:'
const CN_DAY = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

export function buildDatedEvents(
  table: ExportTable,
  courses: ExportCourse[],
  opts: DatedIcsOptions
): Array<{ date: Date; week: number; course: Course; start: string; end: string; transferred: boolean }> {
  const semesterStart = mondayOfStart(table.startDate)
  if (!semesterStart) return []
  const semesterEnd = addDays(semesterStart, table.maxWeek * 7)
  const today = stripTime(opts.today)
  const start = maxDate(today, semesterStart)
  const requestedEnd =
    opts.range === 'NEXT_WEEK' ? addDays(today, 7)
      : opts.range === 'NEXT_MONTH' ? addMonths(today, 1)
        : semesterEnd
  const end = minDate(requestedEnd, semesterEnd)

  const nodeTimes = parseNodes(table.timeJson)
  const out: ReturnType<typeof buildDatedEvents> = []
  for (let date = start; date < end; date = addDays(date, 1)) {
    const week = currentWeek(table.startDate, date)
    const dayIso = localIso(date)
    const classDay = effectiveDayOfWeek(dayIso, opts.transfers)
    for (const c of courses) {
      // ExportCourse ⊂ Course; normalizeNode 只读 ownTime/startTime/endTime。
      // 导出 DTO 自带 isIrregularTime (Android effectiveCourseTime 同源), 缺省补齐非边缘课。
      const norm = normalizeNode(
        { ...c, isIrregularNode: false, level: 0, credit: 0, colorMode: 0 } as Course,
        table.timeJson
      )
      if (norm.day !== classDay || !inWeek(norm, week)) continue
      const times = courseTimes(norm, nodeTimes)
      if (!times || times[1] <= times[0]) continue // Android invalid++: 非法时段跳过
      const transferred = classDay !== localDow(date)
      out.push({ date, week, course: norm, start: times[0], end: times[1], transferred })
    }
  }
  return out
}

export function exportDatedIcs(table: ExportTable, courses: ExportCourse[], opts: DatedIcsOptions): string {
  const events = buildDatedEvents(table, courses, opts)
  const nodeTimes = parseNodes(table.timeJson)
  const firstDay = events.length > 0 ? events[0].date : null
  const sb: string[] = []
  sb.push('BEGIN:VCALENDAR')
  sb.push('VERSION:2.0')
  sb.push('PRODID:-//Sleepy//课程表//ZH')
  sb.push('CALSCALE:GREGORIAN')
  sb.push('METHOD:PUBLISH')
  sb.push(`X-WR-CALNAME:${esc(table.name)}`)
  for (const ev of events) {
    const marker = `${SLEEPY_MARKER_PREFIX}${table.id}:${ev.course.id}:${localIso(ev.date)}`
    // 首日首课闹钟 — Android 单独 Alarm 在 ICS 侧以附加提醒行对位
    const wantsFirstAlarm =
      opts.firstAlarmEnabled && firstDay !== null && ev.date.getTime() === firstDay.getTime() &&
      ev.course.startNode <= 1 && ev.course.startNode + ev.course.step > 1 && ev.start < '12:00' &&
      ev.course.id === firstDayFirstCourseId(events, firstDay, nodeTimes)
    const ymd = localIso(ev.date).replace(/-/g, '')
    sb.push('BEGIN:VEVENT')
    sb.push(`UID:${ev.course.id}-${ev.date.getTime()}@sleepy-dated`)
    sb.push(`DTSTAMP:${stamp()}`)
    sb.push(`DTSTART:${ymd}T${compact(ev.start)}`)
    sb.push(`DTEND:${ymd}T${compact(ev.end)}`)
    sb.push(`SUMMARY:${esc(ev.course.courseName)}`)
    if (ev.course.room.trim() !== '') sb.push(`LOCATION:${esc(ev.course.room)}`)
    let desc = `第${ev.week}周 · 第${ev.course.startNode}—${ev.course.startNode + ev.course.step - 1}节`
    if (ev.course.teacher.trim() !== '') desc += `\n教师：${ev.course.teacher}`
    if (ev.course.note.trim() !== '') desc += `\n备注：${ev.course.note}`
    if (ev.transferred) desc += `\n调课安排：按${CN_DAY[ev.course.day - 1] ?? ''}课程`
    if (wantsFirstAlarm) desc += `\n首课闹钟：提前 ${opts.firstAlarmMinutes} 分钟`
    desc += `\n${marker}`
    sb.push(`DESCRIPTION:${esc(desc)}`)
    if (opts.reminderMinutes !== null) {
      sb.push('BEGIN:VALARM')
      sb.push('ACTION:DISPLAY')
      sb.push(`TRIGGER:-PT${Math.min(999, Math.max(0, Math.trunc(opts.reminderMinutes)))}M`)
      sb.push(`DESCRIPTION:${esc(ev.course.courseName)}`)
      sb.push('END:VALARM')
    }
    sb.push('END:VEVENT')
  }
  sb.push('END:VCALENDAR')
  return sb.join('\r\n') + '\r\n'
}

// ---- 内部工具 ----

function firstDayFirstCourseId(
  events: ReturnType<typeof buildDatedEvents>, firstDay: Date, nodeTimes: ReturnType<typeof parseNodes>
): number | null {
  let best: { id: number; start: string } | null = null
  for (const ev of events) {
    if (ev.date.getTime() !== firstDay.getTime()) continue
    if (ev.course.startNode > 1) continue
    const t = courseTimes(ev.course, nodeTimes)
    if (!t) continue
    if (best === null || t[0] < best.start) best = { id: ev.course.id, start: t[0] }
  }
  return best?.id ?? null
}

/** 上课时间 [start,end] "HH:mm" — ownTime/isIrregularTime 优先, 否则节次表 (Android effectiveCourseTime 对位) */
function courseTimes(c: ExportCourse, nodeTimes: ReturnType<typeof parseNodes>): [string, string] | null {
  if ((c.ownTime || (c as { isIrregularTime?: boolean }).isIrregularTime) && c.startTime && c.endTime) {
    return [pad(c.startTime), pad(c.endTime)]
  }
  const s = nodeTimes.find((n) => n.node === c.startNode)
  const e = nodeTimes.find((n) => n.node === c.startNode + c.step - 1)
  if (!s || !e) return null
  return [s.start, e.end]
}

function pad(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${h.padStart(2, '0')}:${m?.padStart(2, '0') ?? '00'}`
}

function compact(hhmm: string): string {
  return hhmm.replace(/:/g, '') + '00'
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
}
function maxDate(a: Date, b: Date): Date {
  return a >= b ? a : b
}
function minDate(a: Date, b: Date): Date {
  return a <= b ? a : b
}
function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function localDow(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay()
}
function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}
