import { inWeek, type Course, type Table } from '../data/types'
import type { HolidayTransferEntry } from './holiday/transfers'

export interface CourseOccurrence { course: Course; sourceDate: string; displayDate: string }
const DAY = 86400000
export function isoDay(date: string): number { return Date.parse(`${date}T00:00:00Z`) / DAY }
export function isoOfDay(day: number): string { return new Date(day * DAY).toISOString().slice(0, 10) }
export function weekday(date: string): number { return new Date(`${date}T00:00:00Z`).getUTCDay() || 7 }
export function weekOfDate(startDate: string, date: string): number {
  const monday = isoDay(startDate) - weekday(startDate) + 1
  return Math.floor((isoDay(date) - monday) / 7) + 1
}
export function dateOfWeekIso(startDate: string, week: number, day: number): string {
  return isoOfDay(isoDay(startDate) - weekday(startDate) + 1 + (week - 1) * 7 + day - 1)
}
/** Target date is an extra teaching date; the mapped source is suppressed. */
export function courseDateForDate(date: string, transfers: HolidayTransferEntry[]): string | null {
  const target = [...transfers].reverse().find((entry) => entry.targetDate === date)
  if (target) return target.sourceDate
  if (transfers.some((entry) => entry.sourceDate === date)) return null
  return date
}
export function resolveOccurrence(course: Course, displayDate: string, transfers: HolidayTransferEntry[]): CourseOccurrence | null {
  const fixed = (course as Course & { fixedDate?: string | null }).fixedDate
  const sourceDate = fixed ?? courseDateForDate(displayDate, transfers)
  return sourceDate ? { course, sourceDate, displayDate } : null
}
export function coursesForDate(date: string, startDate: string, maxWeek: number, courses: Course[], transfers: HolidayTransferEntry[]): Course[] {
  const source = courseDateForDate(date, transfers)
  const week = source && startDate ? weekOfDate(startDate, source) : 1
  return courses.filter((course) => {
    const fixed = (course as Course & { fixedDate?: string | null }).fixedDate
    if (fixed) return fixed === date
    return source !== null && week !== null && week >= 1 && week <= maxWeek && course.day === weekday(source) && inWeek(course, week)
  })
}
export function projectWeekCourses(table: Table, week: number, courses: Course[], transfers: HolidayTransferEntry[]): Course[] {
  if (!table.startDate) return courses.filter((course) => inWeek(course, week))
  return Array.from({ length: 7 }, (_, i) => i + 1).flatMap((day) =>
    coursesForDate(dateOfWeekIso(table.startDate, week, day), table.startDate, table.maxWeek, courses, transfers).map((course) => ({ ...course, day })),
  )
}
/** Android CourseOccurrences.without: split only actual weeks and retain parity. */
export function withoutOccurrence(course: Course, sourceDate: string, startDate: string): Course[] {
  const fixed = (course as Course & { fixedDate?: string | null }).fixedDate
  if (fixed) {
    if (fixed !== sourceDate) throw new Error('单次课程日期已变化')
    return []
  }
  const week = weekOfDate(startDate, sourceDate)
  if (course.day !== weekday(sourceDate) || !inWeek(course, week)) throw new Error('该日期没有这次课程')
  const ranges = [[course.startWeek, week - 1], [week + 1, course.endWeek]]
  const remaining = ranges.flatMap(([a, b]) => {
    const actual = Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => i + a).filter((w) => inWeek(course, w))
    return actual.length ? [{ ...course, startWeek: actual[0], endWeek: actual[actual.length - 1] }] : []
  })
  return remaining.map((row, index) => ({ ...row, id: index === 0 ? course.id : 0 }))
}
function actualWeeks(course: Course): number[] {
  return Array.from({ length: Math.max(0, course.endWeek - course.startWeek + 1) }, (_, i) => i + course.startWeek).filter((week) => inWeek(course, week))
}
export function mergeMatchingRows(rows: Course[]): Course[] {
  const buckets = new Map<string, Course[]>()
  for (const row of rows) {
    const key = JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => !['id', 'startWeek', 'endWeek', 'type'].includes(key)).sort(([a], [b]) => a.localeCompare(b))))
    buckets.set(key, [...(buckets.get(key) ?? []), row])
  }
  return [...buckets.values()].flatMap((bucket) => {
    if (!bucket[0].groupId || (bucket[0] as Course & { fixedDate?: string | null }).fixedDate) return bucket
    const result = [...bucket].sort((a, b) => a.startWeek - b.startWeek || a.id - b.id)
    let changed = true
    while (changed) {
      changed = false
      search: for (let i = 0; i < result.length; i++) for (let j = i + 1; j < result.length; j++) {
        const a = result[i], b = result[j], aw = actualWeeks(a), bw = actualWeeks(b)
        if (!aw.length || !bw.length || aw.some((week) => bw.includes(week))) continue
        const union = [...new Set([...aw, ...bw])].sort((x, y) => x - y)
        const retained = [a, b].sort((x, y) => (x.id > 0 ? x.id : Infinity) - (y.id > 0 ? y.id : Infinity))[0]
        for (const type of [...new Set([retained.type, 0, 1, 2])]) {
          const merged = { ...retained, startWeek: union[0], endWeek: union[union.length - 1], type } as Course
          if (JSON.stringify(actualWeeks(merged)) !== JSON.stringify(union)) continue
          result[i] = merged; result.splice(j, 1); changed = true; break search
        }
      }
    }
    return result
  })
}
