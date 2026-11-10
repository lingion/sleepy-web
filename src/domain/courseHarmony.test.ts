import { describe, expect, it } from 'vitest'
import { courseColorAnchor, planCourseHues, ringDistance } from './courseHarmony'
describe('Android course palette policy', () => {
  it('classic mode creates no derived hues', () => { expect(planCourseHues(null, [], ['math'])).toEqual({}) })
  it('avoids theme and opposite hue bands while spacing thirteen courses', () => {
    const hues = Object.values(planCourseHues(265, [], Array.from({ length: 13 }, (_, i) => `course-${i}`)))
    for (const hue of hues) { expect(ringDistance(hue, 265)).toBeGreaterThanOrEqual(30); expect(ringDistance(hue, 85)).toBeGreaterThanOrEqual(30) }
    hues.forEach((hue, i) => hues.slice(i + 1).forEach(other => expect(ringDistance(hue, other)).toBeGreaterThanOrEqual(10)))
  })
  it('new groups avoid existing colors without moving them', () => {
    const existing = planCourseHues(265, [], ['a', 'b'])
    const next = planCourseHues(265, Object.values(existing), ['c'])
    Object.values(existing).forEach(hue => expect(ringDistance(hue, next.c)).toBeGreaterThanOrEqual(10))
    expect(courseColorAnchor(2, '#00FF00', -1)).toBe(120)
    expect(courseColorAnchor(2, '#00FF00', 360)).toBe(0)
  })
})
