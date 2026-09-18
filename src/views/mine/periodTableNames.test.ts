import { describe, it, expect } from 'vitest'
import { isTableNameTaken, suggestUniqueName } from './periodTableNames'

describe('TimeTableUtils.suggestUniqueName 1:1 (issue#40 全局唯一名)', () => {
  it('isTableNameTaken: 空名不占位', () => {
    expect(isTableNameTaken('', ['A'], ['B'])).toBe(false)
  })
  it('isTableNameTaken: 课表名∪作息表名命中', () => {
    expect(isTableNameTaken('A', ['A'], [])).toBe(true)
    expect(isTableNameTaken('B', [], ['B'])).toBe(true)
    expect(isTableNameTaken('C', ['A'], ['B'])).toBe(false)
  })
  it('suggestUniqueName: 未撞名原样返回', () => {
    expect(suggestUniqueName('X', ['A'], ['B'])).toBe('X')
  })
  it('suggestUniqueName: 撞名顺延 2/3, 跳过 paren 形态', () => {
    expect(suggestUniqueName('A', ['A'], [])).toBe('A2')
    expect(suggestUniqueName('A', ['A', 'A2'], ['A(3)'])).toBe('A4')
  })
  it('suggestUniqueName: 空名回退 defaultName 参与顺延', () => {
    expect(suggestUniqueName('', [], [], '新建作息表')).toBe('新建作息表')
    expect(suggestUniqueName(' ', ['新建作息表'], [], '新建作息表')).toBe('新建作息表2')
  })
  it('suggestUniqueName: 课表与作息表共享一个命名空间', () => {
    // 课表已有「标准」→ 作息表预填名自动顺延
    expect(suggestUniqueName('标准', ['标准'], [])).toBe('标准2')
  })
})
