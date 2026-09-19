/**
 * BOYA_PP (博雅研究生平台) — Kotlin JwBoyaPpParserTest.kt 1:1 移植。
 *
 * 数据源: 燕山大学研究生平台 yjsxt.ysu.edu.cn/pp 逐周实采 390 行
 * 裁剪至 56 行; 期望值与页面渲染 DOM (第 2 周视图) 逐格比对通过。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JwBoyaPpParser } from './boyaPpParser'

const HERE = import.meta.dirname

function fixture(): string {
  return readFileSync(join(HERE, '__fixtures__', 'boya-ysu.json'), 'utf8')
}

function parse(src: string = fixture()) {
  return new JwBoyaPpParser(src).generateCourseList()
}

/** 从 fixture 抽 rows 数组原文 (供裸数组/信封形态变体测试) */
function extractRowsForTest(src: string): string {
  const root = JSON.parse(src) as Record<string, unknown>
  return JSON.stringify(root['rows'])
}

describe('JwBoyaPpParser (boya_pp)', () => {
  it('56 行合并为 18 个课块', () => {
    expect(parse()).toHaveLength(18)
  })

  it('连续单节行合并为连堂块', () => {
    // 心理健康教育专题: day2 节 5/6/7/8 各一行 (week 2) → 5-8 连堂
    const c = parse().find((x) => x.name === '心理健康教育专题')!
    expect([c.day, c.startNode, c.endNode, c.startWeek, c.endWeek, c.type])
      .toEqual([2, 5, 8, 2, 2, 0])
    expect(c.teacher).toBe('李亚蕾')
    expect(c.room).toBe('西(四)201多媒体')
  })

  it('有缺口周次集拆为同槽位两段', () => {
    // 新时代 (weeks 裁剪为 2,3,10): day1 5-6 → [2-3] + [10] 两段
    const cs = parse().filter((x) => x.name === '新时代中国特色社会主义理论与实践' && x.day === 1)
    expect(cs).toHaveLength(2)
    const cont = cs.find((x) => x.startWeek === 2)!
    expect([cont.endWeek, cont.type]).toEqual([3, 0])
    const gap = cs.find((x) => x.startWeek === 10)!
    expect([gap.endWeek, gap.startNode, gap.endNode]).toEqual([10, 5, 6])
    expect(cs[0].teacher).toBe('何茜曦')
    expect(cs[0].room).toBe('（里）J207多媒体')
  })

  it('同槽位不同周节次范围不同时保持拆分', () => {
    // 集中授课: 材料 day6 第2周占 5-8 节(拆 5-6/7-8 两块), 第5-7周占 5-6 节, 第6周另占 3-4 节
    const cs = parse().filter((x) => x.name === '材料与化工现代研究方法' && x.day === 6)
    expect(cs).toHaveLength(5)
    expect(cs.some((x) => x.startNode === 3 && x.endNode === 4 && x.startWeek === 6 && x.endWeek === 6)).toBe(true)
    expect(cs.some((x) => x.startNode === 5 && x.endNode === 6 && x.startWeek === 2 && x.endWeek === 2)).toBe(true)
    expect(cs.some((x) => x.startNode === 5 && x.endNode === 6 && x.startWeek === 5 && x.endWeek === 7)).toBe(true)
    expect(cs.some((x) => x.startNode === 7 && x.endNode === 8 && x.startWeek === 2 && x.endWeek === 2)).toBe(true)
    expect(cs.some((x) => x.startNode === 7 && x.endNode === 8 && x.startWeek === 5 && x.endWeek === 5)).toBe(true)
    expect(cs[0].teacher).toBe('田克松')
  })

  it('同课不同教室保持独立课块', () => {
    // 高等催化原理: day3 9-12 @AD401 与 day7 9-12 @J105, weeks 裁剪为 2,7 → 各拆 2 段
    const cs = parse().filter((x) => x.name === '高等催化原理')
    expect(cs).toHaveLength(4)
    const d3 = cs.filter((x) => x.day === 3)
    expect(d3).toHaveLength(2)
    expect(d3.every((x) => x.startNode === 9 && x.endNode === 12 && x.room === '（里）AD401')).toBe(true)
    const d7 = cs.filter((x) => x.day === 7)
    expect(d7).toHaveLength(2)
    expect(d7.every((x) => x.room === '（里）J105')).toBe(true)
    expect(d3[0].teacher).toBe('张亚茹')
  })

  it('停课行被剔除', () => {
    expect(parse().some((x) => x.name === '测试停课课')).toBe(false)
  })

  it('字符串 whichWeek 容忍, 空教室回退 classroomCode', () => {
    const c = parse().find((x) => x.name === '测试字符串周次课')!
    expect([c.day, c.startNode, c.startWeek]).toEqual([4, 3, 6])
    expect(c.room).toBe('999888')
    expect(c.teacher).toBe('李四')
  })

  it('教师名连接去重', () => {
    const cs = parse().filter((x) => x.name === '学科前沿专题')
    expect(cs.length).toBeGreaterThan(0)
    for (const c of cs) expect(c.teacher).toBe('钟金玲')
  })

  it('裸数组形态与包装形态解析一致', () => {
    const bare = extractRowsForTest(fixture())
    expect(new JwBoyaPpParser(bare).generateCourseList()).toHaveLength(18)
  })

  it('code 信封形态与 fetch 形态解析一致', () => {
    const envelope = `{"code":200,"message":"操作成功","data":${extractRowsForTest(fixture())}}`
    expect(new JwBoyaPpParser(envelope).generateCourseList()).toHaveLength(18)
  })

  it('非 JSON 垃圾输入返回空列表不崩', () => {
    expect(new JwBoyaPpParser('<html>404</html>').generateCourseList()).toEqual([])
    expect(new JwBoyaPpParser('').generateCourseList()).toEqual([])
    expect(new JwBoyaPpParser('{"code":200,"data":[]}').generateCourseList()).toEqual([])
  })

  it('confidence 仅对博雅锚点高', () => {
    expect(new JwBoyaPpParser(fixture()).confidence()).toBeGreaterThanOrEqual(80)
    expect(new JwBoyaPpParser('{"kbList":[]}').confidence()).toBe(0)
  })
})
