/**
 * 提醒页动态预览 — ReminderScreen.kt loadReminderSchedulePreview +
 * buildDailyPreviewText / buildBeforeClassPreviewText (183-236) 的 web 对位。
 * 课程/时间解析与 scheduler.fireSummary/fireBeforeClass 共用同一 coursesOn/courseStartStr。
 */

import i18next from 'i18next'
import { db } from '../../data/db'
import type { Course, Table } from '../../data/types'
import { localizedDay } from '../../components/schedule/CardsGridView'
import { toIsoDay } from './fireOnce'
import { coursesOn, courseStartStr, currentTable } from './scheduler'

export interface ReminderCoursePreview {
  dayIso: string
  course: Course
  /** HH:mm; 无法解析 = '--:--' (Android PREVIEW_TIME_FORMAT fallback) */
  startTime: string
}

export interface ReminderDayPreview {
  dayIso: string
  date: Date
  courses: Course[]
  firstCourse: ReminderCoursePreview | null
}

export interface ReminderSchedulePreview {
  today: ReminderDayPreview
  tomorrow: ReminderDayPreview
  nextClass: ReminderCoursePreview | null
}

/** 课程列表按开始时间排序 (同时间按 startNode) — Android compareBy(startTime, startNode) */
function sortByStart(table: Table, courses: Course[]): Course[] {
  return [...courses].sort((a, b) => {
    const sa = courseStartStr(table, a) || '99:99'
    const sb = courseStartStr(table, b) || '99:99'
    return sa < sb ? -1 : sa > sb ? 1 : a.startNode - b.startNode
  })
}

export async function loadReminderSchedulePreview(): Promise<ReminderSchedulePreview | null> {
  const table = await currentTable()
  if (!table) return null
  const all = await db.courses.where('tableId').equals(table.id).toArray()
  if (all.length === 0) return null

  const today = new Date()
  const coursesOnDay = (date: Date): Promise<Course[]> => coursesOn(table, date, all)
  const coursesToday = sortByStart(table, await coursesOnDay(today))

  const dayPreview = (date: Date, dayCourses: Course[]): ReminderDayPreview => {
    const first = dayCourses[0]
    return {
      dayIso: toIsoDay(date),
      date,
      courses: dayCourses,
      firstCourse: first
        ? { dayIso: toIsoDay(date), course: first, startTime: courseStartStr(table, first) || '--:--' }
        : null,
    }
  }

  // 下节课搜索窗 = maxWeek*7+7 天 (Android searchDays); 今天只看未来时刻
  const now = new Date()
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const searchDays = Math.max(1, table.maxWeek) * 7 + 7
  let nextClass: ReminderCoursePreview | null = null
  for (let offset = 0; offset <= searchDays; offset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    const candidates = sortByStart(table, await coursesOnDay(date))
      .map((course) => ({ course, start: courseStartStr(table, course) }))
      .filter(({ start }) => start !== '')
      .filter(({ start }) => !(offset === 0 && start <= nowHm))
      .map(({ course, start }) => ({ dayIso: toIsoDay(date), course, startTime: start }))
    if (candidates.length > 0) {
      nextClass = candidates[0]
      break
    }
  }

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  return {
    today: dayPreview(today, coursesToday),
    tomorrow: dayPreview(tomorrow, sortByStart(table, await coursesOnDay(tomorrow))),
    nextClass,
  }
}

/** DateUtils.shortDateSlash 1:1 — "M/d" 不补零 */
function shortDateSlash(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function localizedDayName(d: Date): string {
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  // DateUtils.localizedDay 对位 — web 单一实现 CardsGridView.localizedDay (zh 一律简体)
  return localizedDay(dow, i18next.language)
}

function previewCourseFields(c: Course): { name: string; room: string; teacher: string } {
  const name = c.courseName.trim() === '' ? i18next.t('default_course_name') : c.courseName
  const room = c.room.trim() === '' ? i18next.t('notif_room_unknown') : c.room
  const teacher = c.teacher.trim() === '' ? '' : i18next.t('reminder_preview_teacher', { v1: c.teacher })
  return { name, room, teacher }
}

/** buildDailyPreviewText 1:1 — dateLabelRes = today/tomorrow 变体 */
export function buildDailyPreviewText(day: ReminderDayPreview, dateLabelKey: string): string {
  const dateLabel = i18next.t(dateLabelKey, { v1: shortDateSlash(day.date), v2: localizedDayName(day.date) })
  const first = day.firstCourse
  if (!first) return i18next.t('reminder_daily_preview_dynamic_no_course', { v1: dateLabel })
  const { name, room, teacher } = previewCourseFields(first.course)
  return i18next.t('reminder_daily_preview_dynamic', {
    v1: dateLabel,
    v2: day.courses.length,
    v3: name,
    v4: first.startTime,
    v5: room,
    v6: teacher,
  })
}

/** buildBeforeClassPreviewText 1:1 */
export function buildBeforeClassPreviewText(next: ReminderCoursePreview | null): string {
  if (!next) return i18next.t('reminder_before_class_preview_dynamic_no_course')
  const d = new Date(next.dayIso + 'T00:00:00')
  const dateLabel = i18next.t('reminder_preview_date', { v1: shortDateSlash(d), v2: localizedDayName(d) })
  const { name, room, teacher } = previewCourseFields(next.course)
  return i18next.t('reminder_before_class_preview_dynamic', {
    v1: dateLabel,
    v2: name,
    v3: next.startTime,
    v4: room,
    v5: teacher,
  })
}
