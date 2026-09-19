import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwXjuPostParser } from './xjuPostParser'

const source = readFileSync(join(import.meta.dirname, '__fixtures__', 'xju-postgraduate-dgdata.html'), 'utf8')

describe('JwXjuPostParser', () => {
  it('parses sunday-first Gwork table, rowspan, parity, and multiple entries', () => {
    const courses = new JwXjuPostParser(source).generateCourseList()
    const numeric = courses.find((c) => c.name === '数值分析')
    expect(numeric).toMatchObject({ day: 1, startNode: 1, endNode: 2, startWeek: 1, endWeek: 16, type: 1, teacher: '张教授', room: '理科楼-301' })
    expect(courses.find((c) => c.name === '随机过程')).toMatchObject({ day: 2, type: 2, startWeek: 2, endWeek: 15 })
    expect(courses.find((c) => c.name === '学术英语')).toMatchObject({ day: 4, teacher: 'Smith' })
  })

  it('does not parse unrelated pages', () => {
    expect(new JwXjuPostParser('<html><table id="DataGrid1"></table></html>').generateCourseList()).toEqual([])
  })
})
