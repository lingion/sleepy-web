import { describe, expect, it } from 'vitest'
import type { Course } from '../data/types'
import { coursesForDate, dateOfWeekIso, mergeMatchingRows, resolveOccurrence, withoutOccurrence } from './courseOccurrence'
const course = { id: 4, tableId: 1, groupId: 'a', day: 1, startWeek: 1, endWeek: 10, type: 1, courseName: '数学', startNode: 2, step: 2, room: 'A' } as Course
describe('Android occurrence semantics', () => {
  it('splits the selected actual week and keeps parity and retained id', () => {
    expect(withoutOccurrence(course, '2026-09-21', '2026-09-07')).toEqual([
      { ...course, startWeek: 1, endWeek: 1 }, { ...course, id: 0, startWeek: 5, endWeek: 9 },
    ])
    expect(() => withoutOccurrence(course, '2026-09-14', '2026-09-07')).toThrow()
  })
  it('merges only exactly representable teaching sets and keeps duplicates', () => {
    const parts = withoutOccurrence(course, '2026-09-21', '2026-09-07')
    const full = mergeMatchingRows([...parts, { ...course, id: 0, startWeek: 3, endWeek: 3 }])
    expect(full).toHaveLength(1)
    expect(full[0]).toMatchObject({ id: 4, startWeek: 1, endWeek: 9, type: 1 })
    expect(mergeMatchingRows([course, { ...course, id: 5 }])).toHaveLength(2)
  })
  it('projects cross-week transfers once while fixedDate stays at its natural date', () => {
    const transfers = [{ sourceDate: '2026-09-07', targetDate: '2026-09-19', segmentId: 'x' }]
    const fixed = { ...course, id: 6, fixedDate: '2026-09-07' } as Course
    expect(coursesForDate('2026-09-07', '2026-09-07', 10, [course, fixed], transfers)).toEqual([fixed])
    expect(coursesForDate('2026-09-19', '2026-09-07', 10, [course, fixed], transfers)).toEqual([course])
    expect(resolveOccurrence(course, '2026-09-19', transfers)?.sourceDate).toBe('2026-09-07')
    expect(dateOfWeekIso('2026-09-09', 2, 7)).toBe('2026-09-20')
  })
})
