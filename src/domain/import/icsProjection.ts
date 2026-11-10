import type { Course } from '../../data/types'
import { coursesForDate, dateOfWeekIso } from '../courseOccurrence'
import type { HolidayTransferEntry } from '../holiday/transfers'
import type { ExportCourse, ExportTable } from './scheduleExporter'

export function occurrenceCourse(course: ExportCourse): Course {
  return { ...course, type: course.type as Course['type'], colorMode: 0, isIrregularNode: false, credit: 0, level: 0 }
}

/** Semester dates plus exceptional destinations and concrete single-course dates. */
export function icsDates(table: ExportTable, courses: ExportCourse[], transfers: HolidayTransferEntry[]): string[] {
  const dates = new Set<string>()
  for (let week = 1; week <= table.maxWeek; week++) for (let day = 1; day <= 7; day++) dates.add(dateOfWeekIso(table.startDate, week, day))
  for (const transfer of transfers) dates.add(transfer.targetDate)
  for (const course of courses) if (course.fixedDate) dates.add(course.fixedDate)
  return [...dates].sort()
}

/** Transfer exports are concrete occurrences, using the same source-week rules as the timetable. */
export function projectIcsCourses(table: ExportTable, courses: ExportCourse[], transfers: HolidayTransferEntry[]): ExportCourse[] {
  const rows = courses.map(occurrenceCourse)
  return icsDates(table, courses, transfers).flatMap(date =>
    coursesForDate(date, table.startDate, table.maxWeek, rows, transfers).map(course => ({
      ...course, fixedDate: date, type: 0,
    })),
  )
}
