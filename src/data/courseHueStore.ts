import { liveQuery } from 'dexie'
import { db } from './db'
import type { Prefs } from './types'
import { configureCourseHues } from './courseHueCache'
import { courseColorAnchor, planCourseHues } from '../domain/courseHarmony'
import { resolveThemeScheme } from '../theme/themes'

let queue = Promise.resolve(0)
/** Only the write side creates hues. Existing groups keep their hue when new courses arrive. */
export function refreshCourseHues(prefs: Prefs, isDark: boolean, recalculate = false): Promise<number> {
  const work = () => db.transaction('rw', db.courses, db.courseColors, db.prefs, async () => {
    const rows = (await db.courses.toArray()).sort((a, b) => a.id - b.id)
    const stored = (await db.courseColors.toArray()).filter(row => row.tableKey === '__global__')
    const hues = Object.fromEntries(stored.map(row => [row.groupId, row.hue]))
    const anchor = courseColorAnchor(prefs.courseColorMode, resolveThemeScheme(prefs.theme, isDark).primary, prefs.courseColorSeedHue)
    const signature = `${prefs.courseColorMode}:${anchor}`
    const previous = await db.prefs.get('course-color-signature')
    const all = recalculate || signature !== previous?.value
    const groups = [...new Set(rows.map(row => row.groupId).filter(Boolean))]
    const plan = planCourseHues(anchor, all ? [] : Object.values(hues), all ? groups : groups.filter(group => !Object.prototype.hasOwnProperty.call(hues, group)))
    if (Object.keys(plan).length) await db.courseColors.bulkPut(Object.entries(plan).map(([groupId, hue]) => ({ tableKey: '__global__', groupId, hue })))
    if (signature !== previous?.value) await db.prefs.put({ key: 'course-color-signature', value: signature })
    configureCourseHues(prefs.courseColorMode, { ...hues, ...plan })
    return Object.keys(plan).length
  })
  queue = queue.then(work, work)
  return queue
}
let started = false
export function observeCourseHues(getPrefs: () => Prefs, dark: (prefs: Prefs) => boolean, onChange: () => void): void {
  if (started) return
  started = true
  liveQuery(() => db.courses.toArray()).subscribe({
    next: () => { const prefs = getPrefs(); void refreshCourseHues(prefs, dark(prefs)).then(onChange).catch(() => {}) },
  })
}
