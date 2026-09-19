import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwBjtuParser } from './bjtuParser'

const HERE = import.meta.dirname
const fixture = (name: string) => readFileSync(join(HERE, '__fixtures__', 'bjtu', name), 'utf8')
const parse = (src: string) => new JwBjtuParser(src).generateCourseList()

describe('JwBjtuParser', () => {
  it('parses stuschedule table and merges consecutive nodes', () => {
    const cs = parse(fixture('bjtu-stuschedule.sample.html'))
    expect(cs).toHaveLength(5)
    const math = cs.find((x) => x.name === '高等数学A(上)')!
    expect([math.day, math.startNode, math.endNode, math.startWeek, math.endWeek, math.teacher, math.room])
      .toEqual([1, 1, 2, 1, 16, '张三', '主校区, 主区, 3-302'])
  })

  it('parses schedule detail and chooses all-semester section when combined', () => {
    const src = `<!--sleepy-bjtu-doc:stuschedule-->${fixture('bjtu-stuschedule.sample.html')}<!--sleepy-bjtu-doc:schedule-->${fixture('bjtu-schedule.sample.html')}`
    const cs = parse(src)
    expect(cs).toHaveLength(8)
    const english = cs.filter((x) => x.name === '大学英语III')
    expect(english).toHaveLength(2)
    expect(english.map((x) => x.teacher).sort()).toEqual(['王五', '赵六'])
  })

  it('parses single/double and discrete week runs', () => {
    const cs = parse(fixture('bjtu-schedule.sample.html'))
    const linear = cs.find((x) => x.name === '线性代数')!
    expect([linear.startWeek, linear.endWeek, linear.type]).toEqual([1, 15, 1])
    const comp = cs.filter((x) => x.name === '计算机组成原理')
    expect(comp).toHaveLength(1)
    expect([comp[0].startWeek, comp[0].endWeek, comp[0].type]).toEqual([2, 12, 2])
  })

  it('skips login and foreign protocol pages', () => {
    expect(parse(fixture('bjtu-login.sample.html'))).toEqual([])
    expect(parse(fixture('bjtu-zf-foreign.sample.html'))).toEqual([])
    expect(new JwBjtuParser(fixture('bjtu-login.sample.html')).confidence()).toBe(0)
  })

  it('reports anchors and supports week/day helpers', () => {
    const p = new JwBjtuParser(fixture('bjtu-stuschedule.sample.html'))
    expect(p.confidence()).toBe(92)
    expect(p.dayOfWeek('星期一')).toBe(1)
    expect(p.dayOfWeek('周日')).toBe(7)
    expect(p.parseWeekRuns('第1-16周(单)')).toEqual([{ startWeek: 1, endWeek: 15, type: 1 }])
    expect(p.parseWeekRuns('第2,4,6周')).toEqual([{ startWeek: 2, endWeek: 6, type: 2 }])
    expect(p.matchedFeatures()).toEqual(expect.arrayContaining(['th:星期一', 'cell:第N节']))
  })
})
