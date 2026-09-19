import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwYethanParser } from './yethanParser'

const source = readFileSync(join(import.meta.dirname, '__fixtures__', 'yethan-schedule.json'), 'utf8')

describe('JwYethanParser', () => {
  it('parses schedule JSON and preserves YETHAN week grammar', () => {
    const courses = new JwYethanParser(source).generateCourseList()
    expect(courses).toHaveLength(6)
    expect(courses.filter((c) => c.name === '测试课程A' && c.startNode === 5).map((c) => [c.startWeek, c.endWeek])).toEqual([[7, 7], [10, 12], [14, 15]])
    expect(courses.find((c) => c.name === '测试课程A')?.room).toBe('X30547(犀浦)')
    expect(courses.find((c) => c.name === '测试课程C')?.room).toBe('Online')
  })

  it('rejects malformed and expired responses', () => {
    expect(new JwYethanParser('not json').generateCourseList()).toEqual([])
    expect(new JwYethanParser('{"code":"A0422"}').generateCourseList()).toEqual([])
  })
})
