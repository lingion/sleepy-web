import { db } from '../data/db'
import { hydratedWith, type Course, type Table } from '../data/types'

/** Deliver table, bound clocks and courses together, without an empty-course commit. */
export function loadScheduleData() {
  return db.transaction('r', db.timetables, db.periodTables, db.courses, db.prefs, async () => {
    const tables = await db.timetables.orderBy('id').toArray() as Table[]
    const selected = tables.find(table => table.isDefault === 1)
    const [period, courses, sampleId, dismissed] = await Promise.all([
      selected?.periodTableId ? db.periodTables.get(selected.periodTableId) : undefined,
      selected ? db.courses.where('tableId').equals(selected.id).toArray() : [] as Course[],
      db.prefs.get('sampleTableId'),
      db.prefs.get('sampleBannerDismissed'),
    ])
    return { tables, defaultTable: selected ? hydratedWith(selected, period) : undefined, courses, sampleMeta: { id: sampleId?.value, dismissed: dismissed?.value } }
  })
}

type ScheduleData = Awaited<ReturnType<typeof loadScheduleData>>

// Stored rows contain scalar properties. Compare all own keys, including optional
// fields; any new structured value conservatively causes an update.
function sameRecord<T extends object>(previous: T | undefined, next: T | undefined): boolean {
  if (previous === next) return true
  if (!previous || !next) return false
  const keys = Object.keys(previous) as (keyof T)[]
  return keys.length === Object.keys(next).length && keys.every(key => Object.hasOwn(next, key) && Object.is(previous[key], next[key]))
}

function sameRows<T extends object>(previous: T[], next: T[]): boolean {
  return previous.length === next.length && previous.every((row, index) => sameRecord(row, next[index]))
}

/** One query per mounted view: always read/subscribe, retain only equal results. */
export function createScheduleDataQuery(initial?: ScheduleData): () => Promise<ScheduleData> {
  let previous = initial
  return async () => {
    const next = await loadScheduleData()
    if (previous && sameRows(previous.tables, next.tables) && sameRecord(previous.defaultTable, next.defaultTable)
      && sameRows(previous.courses, next.courses) && sameRecord(previous.sampleMeta, next.sampleMeta)) return previous
    previous = next
    return next
  }
}

let initialScheduleData: ScheduleData | undefined

/** One boot snapshot, discarded after App's first commit even on another tab. */
export async function prepareInitialScheduleData(): Promise<void> {
  initialScheduleData = await loadScheduleData()
}
export const getInitialScheduleData = () => initialScheduleData
export function discardInitialScheduleData(): void { initialScheduleData = undefined }
