import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwUcasParser } from './ucasParser'
const H = import.meta.dirname
const f = (n: string) => readFileSync(join(H, '__fixtures__', 'ucas', n), 'utf8')
const detail = (url: string, html: string) => `${JwUcasParser.DETAIL_MARKER_OPEN}${url}-->${html}${JwUcasParser.DETAIL_MARKER_CLOSE}`
describe('JwUcasParser', () => {
  it('parses JSON bitmap weeks and day/node encoding', () => {
    const cs = new JwUcasParser(f('course-time-list.sample.json')).generateCourseList()
    expect(cs).toHaveLength(3)
    expect(cs.find((x) => x.name === '新时代中国特色社会主义理论与实践')).toMatchObject({ day: 1, startNode: 1, endNode: 2, startWeek: 1, endWeek: 16, type: 0, room: '教学楼A101' })
    expect(cs.find((x) => x.name === '计算机体系结构')).toMatchObject({ day: 3, startNode: 10, endNode: 11, startWeek: 1, endWeek: 15, type: 1 })
    expect(cs.find((x) => x.name === '羽毛球')).toMatchObject({ day: 5, startNode: 5, endNode: 5, startWeek: 2, endWeek: 16, type: 2 })
  })
  it('parses grid with provisional weeks and merges adjacent nodes', () => {
    const cs = new JwUcasParser(f('person-schedule.sample.html')).generateCourseList()
    expect(cs).toHaveLength(6)
    expect(cs.find((x) => x.name === '新时代中国特色社会主义理论与实践')).toMatchObject({ day: 1, startNode: 1, endNode: 2, startWeek: 1, endWeek: 16 })
    expect(new JwUcasParser(f('person-schedule.sample.html')).confidence()).toBe(90)
  })
  it('enriches grid entries with exact detail weeks and room', () => {
    const combined = f('person-schedule.sample.html') + detail('x', f('coursetime-multi.sample.html'))
    const cs = new JwUcasParser(combined).generateCourseList()
    const tue = cs.filter((x) => x.name === '网络攻防基础' && x.day === 2)
    expect(tue.map((x) => [x.startWeek, x.endWeek])).toEqual([[2, 5], [7, 12]])
    expect(tue[0].room).toBe('实验楼207')
  })
  it('extracts and normalizes detail URLs', () => {
    expect(JwUcasParser.extractDetailUrls(`<a href='/course/coursetime/315751'>x</a><a href="/course/coursetime/315751">y</a>`)).toEqual(['https://xkcts.ucas.ac.cn:8443/course/coursetime/315751'])
    expect(JwUcasParser.extractDetailUrls(f('person-schedule.real-0906.html'))).toHaveLength(12)
  })
  it('splits parity, gaps and mixed steps', () => {
    expect(JwUcasParser.splitWeekRuns([2, 3, 4, 5, 7, 8])).toEqual([{ startWeek: 2, endWeek: 5, type: 0 }, { startWeek: 7, endWeek: 8, type: 0 }])
    expect(JwUcasParser.splitWeekRuns([2, 4, 6, 8])).toEqual([{ startWeek: 2, endWeek: 8, type: 2 }])
    expect(JwUcasParser.splitWeekRuns([1, 3, 5])).toEqual([{ startWeek: 1, endWeek: 5, type: 1 }])
  })
  it('handles malformed or irrelevant source', () => {
    expect(new JwUcasParser('{"selectedCourse":{},"courseTimeList":"bad"}').generateCourseList()).toEqual([])
    expect(new JwUcasParser('nothing relevant').generateCourseList()).toEqual([])
    expect(JwUcasParser.parseNumberList('2、3、4')).toEqual([2, 3, 4])
    expect(JwUcasParser.parseNumberList('1-3')).toEqual([1, 2, 3])
  })
})
