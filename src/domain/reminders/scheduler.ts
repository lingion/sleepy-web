/**
 * 提醒引擎 — CourseNotificationScheduler.kt 的页内定时器对位 (定案: 前端定时器 + Web 通知)。
 * AlarmManager 在 web 无等价物 → setInterval 1min tick + 分钟粒度触发; fired-once 台账防重;
 * 触发时数据现查 (Dexie/LiveQuery 同源), 不做整日预排, 天然对齐 Android scheduleToday 的按天重排。
 *
 * 与 Android 的差异 (平台限制, 均有说明):
 *  - 仅页面打开时工作 (无后台进程); 错过分钟点不回补；不能保证后台唤醒。
 *  - 流体云/进度条通知 (FluidCloudService) 不移植 — Web Notification 无法持续更新进度;
 *    fluid 开+banner 关时使用普通浏览器通知承接；两者全关不发。
 */

import i18next from 'i18next'
import { db } from '../../data/db'
import { normalizeNode, hydratedWith, type Course, type Table } from '../../data/types'
import { parseNodes } from '../timeTable'
import { coursesForDate } from '../courseOccurrence'
import { getHolidayTransfers } from '../../state/holidayStore'
import { resolveReminderTableScope } from './tableScope'
import { reminderAllowedOn } from './holidayPolicy'
import { useReminderStore, type ReminderPrefs } from '../../state/reminderStore'
import { notifyGranted, postNotify } from './notify'
import { alreadyFired, markFired, toIsoDay } from './fireOnce'
import { buildDailyAgenda, agendaNotificationLine, notificationSourceLabels, agendaHash } from './agenda'

const TICK_MS = 60_000

let timer: ReturnType<typeof setInterval> | null = null

/** 幂等启动 (StrictMode 双挂载安全); 随 prefs 变化由调用方重新 start。 */
export function startReminderEngine(): void {
  stopReminderEngine()
  tick()
  timer = setInterval(tick, TICK_MS)
}

export function stopReminderEngine(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

export async function tick(): Promise<void> {
  const p = useReminderStore.getState().prefs
  if (!p.masterEnabled || !notifyGranted()) return
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const today = now
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  try {
    if (p.dailyEnabled && p.todayEnabled && hhmm === p.dailyTime) {
      await fireSummary(today, false)
    }
    if (p.dailyEnabled && p.tomorrowEnabled && hhmm === p.tomorrowTime) {
      await fireSummary(tomorrow, true)
    }
    if (p.beforeClassEnabled && (p.bannerEnabled || p.fluidEnabled)) {
      await fireBeforeClass(now, p)
    }
  } catch {
    /* 引擎永不因单次 tick 崩溃 (Android receiver runCatching 同态度) */
  }
}

// ==================== 每日/明日摘要 ====================

/** Fresh repository reads are shared by the notification and its absolute-date destination. */
export async function loadDailyAgenda(date: string) {
  const tables = await reminderTables()
  const active: Table[] = []
  for (const table of tables) {
    if (await reminderAllowedOn(date, table.id, useReminderStore.getState().prefs)) active.push(table)
  }
  const summaries = await Promise.all(active.map(async table => ({ table, courses: await coursesOn(table, new Date(date + 'T12:00:00')) })))
  return { agenda: buildDailyAgenda(date, summaries, tables), suppressed: tables.length > 0 && active.length === 0 }
}

export async function fireSummary(targetDay: Date, isTomorrow: boolean): Promise<void> {
  const key = isTomorrow ? 'daily-tomorrow' : 'daily-today'
  const dayIso = toIsoDay(new Date()), date = toIsoDay(targetDay)
  if (alreadyFired(key, dayIso)) return
  const { agenda, suppressed } = await loadDailyAgenda(date)
  if (suppressed || agenda.sourceTables.length === 0) return
  const titleKey = isTomorrow ? 'notif_tomorrow_title' : 'notif_daily_title'
  let title: string, body: string
  if (!agenda.items.length) {
    title = i18next.t(isTomorrow ? 'notif_tomorrow_title_no_course' : 'notif_daily_title_no_course')
    body = i18next.t(isTomorrow ? 'notif_tomorrow_text_no_course' : 'notif_daily_text_no_course')
  } else {
    title = i18next.t(titleKey, { v1: agenda.items.length })
    const labels = notificationSourceLabels(agenda.sourceTables, i18next.t('agenda_table_unknown'))
    const lines = agenda.items.slice(0, 6).map(item => agendaNotificationLine(item, i18next.t('agenda_time_unknown'), i18next.t('notif_room_unknown'), labels))
    if (Object.keys(labels).length) lines.unshift(i18next.t('agenda_source_count', { v1: agenda.tableCount }))
    if (agenda.items.length > 6) lines.push(i18next.t('agenda_more', { v1: agenda.items.length - 6 }))
    body = lines.join('\n')
  }
  markFired(key, dayIso)
  postNotify({ tag: `sleepy-${key}-${dayIso}`, title, body, targetHash: agendaHash(date) })
}

// ==================== 课前提醒 ====================

/**
 * 每分钟窗口检测 (Android "每节课单独 alarm" 的轮询等价):
 * now ∈ [classStart − minutes, classStart − minutes + 60s) 即命中。
 * ref #143: 扫描所有开启表 (Android BeforeClassNotifyReceiver 只查 owner 表开关 →
 * reminderTables 过滤即等价; resync 收集全部开启表槽位 → web 每次现扫)。
 * 同刻多表命中逐项投递，各课程独立去重，不因首个命中丢掉其他提醒。
 */
export async function fireBeforeClass(now: Date, p: ReminderPrefs): Promise<void> {
  const tables = await reminderTables()
  const dayIso = toIsoDay(now)
  const nowMs = now.getTime()
  const hits: Array<{ table: Table; course: Course; startStr: string; startAt: number }> = []
  for (const table of tables) {
    if (!(await reminderAllowedOn(dayIso, table.id, p))) continue
    const courses = await coursesOn(table, now)
    for (const c of courses) {
      const startStr = courseStartStr(table, c)
      const startAt = timeOnDay(nowMs, startStr)
      if (startAt == null) continue
      const notifyAt = startAt - p.beforeClassMinutes * 60_000
      if (nowMs < notifyAt || nowMs >= notifyAt + 60_000) continue
      hits.push({ table, course: c, startStr, startAt })
    }
  }
  hits.sort((a, b) => a.startAt - b.startAt || a.table.id - b.table.id || a.course.startNode - b.course.startNode)
  for (const hit of hits) {
    const c = hit.course
    const key = `before-class-${c.id}-${dayIso}-${hit.startStr}`
    if (alreadyFired(key, dayIso)) continue
    markFired(key, dayIso)
    const name = displayName(c)
    const room = c.room || i18next.t('notif_room_unknown')
    const title = p.fluidEnabled && !p.bannerEnabled ? name : i18next.t('notif_before_class_title')
    const body = c.teacher.trim() === ''
      ? i18next.t('notif_before_class_text', { v1: name, v2: hit.startStr, v3: room })
      : i18next.t('notif_before_class_text_with_teacher', { v1: name, v2: hit.startStr, v3: room, v4: c.teacher })
    postNotify({ tag: `sleepy-${key}`, title, body })

  }
}

// ==================== 课程/时间解析 ====================

/** WidgetTableResolver.resolveCurrentTable 的 web 对位 = 默认课表 (预览通路 Android 仍单表, 保留) */
export async function currentTable(): Promise<Table | null> {
  const table = await db.timetables.where('isDefault').equals(1).first()
  return table ? hydratedWith(table, table.periodTableId ? await db.periodTables.get(table.periodTableId) : null) : null
}

/** resolveReminderTables 1:1 (ref #143): getAllTables().filter{reminderEnabled}; 缺列旧行=开 */
export async function reminderTables(): Promise<Table[]> {
  const all = await db.timetables.toArray()
  const effective = resolveReminderTableScope(all)
    .filter((t) => t.reminderEnabled !== 0)
    .sort((a, b) => a.id - b.id)
  return Promise.all(effective.map(async table => hydratedWith(table, table.periodTableId ? await db.periodTables.get(table.periodTableId) : null)))
}

/** 今日(或明日)在学期的课, 已按 normalizeNode 归一 (TodayView.todayCourses 同链路)。
 *  allCourses 传入 = 免重查 (预览循环逐日扫描; Android loadReminderSchedulePreview 先取全量)。 */
export async function coursesOn(table: Table, day: Date, allCourses?: Course[]): Promise<Course[]> {
  const dayIso = toIsoDay(day)
  const all = allCourses ?? (await db.courses.where('tableId').equals(table.id).toArray())
  return coursesForDate(dayIso, table.startDate, table.maxWeek, all, getHolidayTransfers(table.id))
    .map((c) => normalizeNode(c, table.timeJson))
}

export function courseStartStr(table: Table, c: Course): string {
  if (c.ownTime && c.startTime) return c.startTime
  const node = parseNodes(table.timeJson).find((n) => n.node === c.startNode)
  return node?.start ?? ''
}

function timeOnDay(dayMs: number, hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const d = new Date(dayMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2])).getTime()
}

/** Android 通知直接用 courseName (无别名分支) — CourseNotificationScheduler 1:1 */
function displayName(c: Course): string {
  return c.courseName
}
