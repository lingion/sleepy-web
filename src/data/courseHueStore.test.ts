import 'fake-indexeddb/auto'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { db } from './db'
import { DEFAULT_PREFS, type Course } from './types'
import { refreshCourseHues } from './courseHueStore'
import { persistedCourseHue } from './courseHueCache'
const course = (id: number, groupId: string) => ({ id, tableId: 1, groupId } as Course)
beforeEach(async () => { await db.delete(); await db.open() })
afterEach(async () => { await db.delete() })
it('keeps stored colors when a new group arrives and across another refresh', async () => {
  const prefs = { ...DEFAULT_PREFS, courseColorMode: 1 as const }
  await db.courses.bulkPut([course(1, 'math'), course(2, 'physics')])
  expect(await refreshCourseHues(prefs, false)).toBe(2)
  const before = await db.courseColors.toArray()
  await db.courses.put(course(3, 'chemistry'))
  expect(await refreshCourseHues(prefs, false)).toBe(1)
  for (const row of before) expect(await db.courseColors.get([row.tableKey, row.groupId])).toEqual(row)
  expect(await refreshCourseHues(prefs, false)).toBe(0)
  expect(persistedCourseHue('math')).toBe(before.find(row => row.groupId === 'math')?.hue)
})
it('uses the persisted signature rather than rebuilding existing custom colors on load', async () => {
  await db.courses.put(course(1, 'math'))
  await db.courseColors.put({ tableKey: '__global__', groupId: 'math', hue: 123 })
  await db.prefs.put({ key: 'course-color-signature', value: '2:50' })
  const prefs = { ...DEFAULT_PREFS, courseColorMode: 2 as const, courseColorSeedHue: 50 }
  expect(await refreshCourseHues(prefs, false)).toBe(0)
  expect(persistedCourseHue('math')).toBe(123)
  expect(await refreshCourseHues(prefs, false, true)).toBe(1)
  expect(persistedCourseHue('math')).not.toBe(123)
})
