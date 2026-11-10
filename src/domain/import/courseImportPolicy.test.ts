import { expect, it } from 'vitest'
import { coursesConflict, firstMissingCourseNode, timeJsonForAppend } from './courseImportPolicy'

const c = { day: 1, startWeek: 1, endWeek: 16, type: 0, startNode: 1, step: 2, ownTime: false, startTime: '', endTime: '' }
const times = '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:55","end":"09:40"}]'
it('odd and even weeks do not conflict', () => expect(coursesConflict({ ...c, type: 1 }, { ...c, type: 2 })).toBe(false))
it('real own times override nominal overlapping nodes', () => {
  expect(coursesConflict({ ...c, ownTime: true, startTime: '12:00', endTime: '13:00' }, c, times)).toBe(false)
  expect(coursesConflict({ ...c, startNode: 3, ownTime: true, startTime: '08:30', endTime: '09:30' }, c, times)).toBe(true)
})
it('append preserves current slots and refuses to change a shared schedule', () => {
  const incoming = '[{"node":1,"start":"12:00","end":"13:00"},{"node":3,"start":"14:00","end":"14:45"}]'
  expect(timeJsonForAppend(times, incoming, 3, true)).toBe(times)
  const merged = JSON.parse(timeJsonForAppend(times, incoming, 3, false))
  expect(merged.find((r: {node:number}) => r.node === 1).start).toBe('08:00')
  expect(merged.find((r: {node:number}) => r.node === 3).start).toBe('14:00')
})
it('all occupied nodes must exist, own-time courses do not need nominal slots', () => {
  expect(firstMissingCourseNode([{ ...c, step: 3 }], times)).toBe(3)
  expect(firstMissingCourseNode([{ ...c, startNode: 13, ownTime: true }], times)).toBeNull()
})
