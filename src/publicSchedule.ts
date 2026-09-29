import { db } from './data/db'
import type { Course, Table } from './data/types'
import { parseSchedule } from './domain/import/scheduleParser'

/** Build-time opt-in for a static, read-only family schedule deployment. */
export function publicScheduleEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_SCHEDULE_PATH !== undefined
}

export function publicSchedulePath(): string {
  return import.meta.env.VITE_PUBLIC_SCHEDULE_PATH || '/schedule.sleepy'
}

/**
 * Loads the exported Android/Web .sleepy file bundled into a deployment and
 * hydrates the isolated browser database. The visitor never needs a login or
 * access to the owner's IndexedDB.
 */
export async function loadPublicSchedule(): Promise<boolean> {
  if (!publicScheduleEnabled()) return false
  const response = await fetch(publicSchedulePath(), { cache: 'no-store' })
  if (!response.ok) throw new Error(`Unable to load public schedule (${response.status})`)
  const parsed = parseSchedule(await response.text(), 1)
  if (!parsed.ok) throw parsed.error
  const result = parsed.value
  const hasPeriodTable = result.periodTable !== null
  const table: Table = {
    id: 1,
    name: result.tableName || 'Sleepy',
    timeJson: result.timeJson,
    smartConfigJson: '',
    isDefault: 1,
    startDate: result.startDate,
    nodeCount: result.nodesPerDay,
    maxWeek: result.maxWeek,
    createdAt: 1,
    periodTableId: hasPeriodTable ? 1 : null,
  }
  const courses: Course[] = result.courses.map((course, index) => ({
    id: index + 1,
    groupId: course.groupId,
    tableId: 1,
    courseName: course.courseName,
    teacher: course.teacher,
    room: course.room,
    note: course.note,
    alias: course.alias,
    day: course.day,
    startNode: course.startNode,
    step: course.step,
    startWeek: course.startWeek,
    endWeek: course.endWeek,
    type: course.type as Course['type'],
    color: course.color,
    colorMode: 0,
    ownTime: course.ownTime,
    isIrregularNode: false,
    isIrregularTime: course.ownTime,
    startTime: course.startTime,
    endTime: course.endTime,
    credit: 0,
    level: 0,
  }))
  await db.transaction('rw', db.timetables, db.courses, db.periodTables, db.prefs, async () => {
    await db.timetables.clear()
    await db.courses.clear()
    await db.periodTables.clear()
    if (result.periodTable) {
      await db.periodTables.put({
        id: 1,
        name: result.periodTable.name,
        nodesPerDay: result.periodTable.nodesPerDay,
        timeJson: result.periodTable.timeJson,
        smartConfigJson: '',
        createdAt: 1,
        updatedAt: 1,
      })
    }
    await db.timetables.put(table)
    await db.courses.bulkPut(courses)
    await db.prefs.put({ key: 'publicScheduleLoaded', value: '1' })
  })
  return true
}
