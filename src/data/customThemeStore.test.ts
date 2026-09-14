/**
 * customThemeStore 单测 — CustomThemeCore 容错/upsert/delete 语义 + localStorage 门面。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  KEY_THEMES,
  DEFAULT_SURFACE_HUE,
  DEFAULT_SURFACE_CHROMA,
  parse,
  toJson,
  upsert,
  removeFrom,
  newId,
  getAllThemes,
  getThemeById,
  saveTheme,
  deleteTheme,
  type CustomTheme,
} from './customThemeStore'

const theme = (id: string, name = 'n'): CustomTheme => ({
  id,
  name,
  primary: '#112233',
  secondary: '#445566',
  tertiary: '#778899',
  surfaceHue: 265,
  surfaceChroma: 8,
  createdAt: 100,
})

describe('parse 容错 (HolidayManager 语义)', () => {
  it('整文档损坏 → 空列表', () => {
    expect(parse('not json')).toEqual([])
    expect(parse('{"not":"array"}')).toEqual([])
  })

  it('坏行跳过、好行保留', () => {
    const json = JSON.stringify([theme('a'), { name: '缺id' }, null, theme('b')])
    expect(parse(json).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('缺可选字段落默认值而非丢行', () => {
    const row = { id: 'x', name: 'x', primary: '#111111', secondary: '#222222', tertiary: '#333333' }
    const [t] = parse(JSON.stringify([row]))
    expect(t.surfaceHue).toBe(DEFAULT_SURFACE_HUE)
    expect(t.surfaceChroma).toBe(DEFAULT_SURFACE_CHROMA)
    expect(t.createdAt).toBe(0)
  })

  it('toJson/parse 往返一致', () => {
    const list = [theme('a', '甲'), theme('b', '乙')]
    expect(parse(toJson(list))).toEqual(list)
  })
})

describe('集合操作', () => {
  it('upsert: 存在原位替换, 不存在追加尾部', () => {
    const list = [theme('a'), theme('b')]
    upsert(list, theme('a', '甲改'))
    expect(list.map((t) => t.name)).toEqual(['甲改', 'n'])
    upsert(list, theme('c'))
    expect(list.map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('delete: 未知 id 返回 false 列表不动', () => {
    const list = [theme('a')]
    expect(removeFrom(list, 'zz')).toBe(false)
    expect(list).toHaveLength(1)
    expect(removeFrom(list, 'a')).toBe(true)
    expect(list).toHaveLength(0)
  })

  it('newId 形状唯一', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()))
    expect(ids.size).toBe(50)
  })
})

describe('localStorage 门面', () => {
  beforeEach(() => localStorage.clear())

  it('save → getAll → getById → delete 全链路', () => {
    saveTheme(theme('a', '甲'))
    saveTheme(theme('b', '乙'))
    expect(getAllThemes().map((t) => t.id)).toEqual(['a', 'b'])
    expect(getThemeById('a')?.name).toBe('甲')
    // upsert 复用同入口
    saveTheme(theme('a', '甲改'))
    expect(getAllThemes()).toHaveLength(2)
    expect(getThemeById('a')?.name).toBe('甲改')
    expect(deleteTheme('a')).toBe(true)
    expect(deleteTheme('a')).toBe(false)
    expect(getAllThemes().map((t) => t.id)).toEqual(['b'])
  })

  it('存储损坏 → 读空不抛, 保存可自愈', () => {
    localStorage.setItem(KEY_THEMES, '{{{corrupt')
    expect(getAllThemes()).toEqual([])
    saveTheme(theme('a'))
    expect(getAllThemes()).toHaveLength(1)
  })
})
