/**
 * prefsStore 契约测试 — DEFAULT_PREFS 与 AppPrefs.kt getter 兜底值逐项对齐
 * 锁定 2026-09-12 修正: displayMode=node(非 full/cards)/gridSubInfo=room/conflictStyle=rail/
 * conflictStackInset=RailInset=7/showDate=false/navDock=false/widgetSeparator=true
 * 以及 5 个补齐键 weekTwoColumnMode/weekHideEmptyDays/vertPunct/widgetColorless/courseColorless。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { DEFAULT_PREFS } from '../data/types'
import { usePrefsStore, resolveIsDark } from './prefsStore'

describe('DEFAULT_PREFS 对齐 AppPrefs.kt 兜底值', () => {
  it('displayMode 默认 node (getDisplayMode → "node")', () => {
    expect(DEFAULT_PREFS.displayMode).toBe('node')
  })

  it('gridSubInfo 默认 room (getGridSubInfo → "room")', () => {
    expect(DEFAULT_PREFS.gridSubInfo).toBe('room')
  })

  it('conflictStyle 默认 rail (getConflictStyle → "rail")', () => {
    expect(DEFAULT_PREFS.conflictStyle).toBe('rail')
  })

  it('冲突 inset 双滑杆默认 7dp (CONFLICT_TOP_INSET_DEFAULT = 7f), 量程 4..20', () => {
    expect(DEFAULT_PREFS.conflictStackInset).toBe(7)
    expect(DEFAULT_PREFS.conflictRailInset).toBe(7)
  })

  it('conflictFoldSize 默认 16dp (CONFLICT_FOLD_SIZE_DEFAULT), 量程 8..28', () => {
    expect(DEFAULT_PREFS.conflictFoldSize).toBe(16)
  })

  it('showDate 默认 false (isShowDate 兜底 false)', () => {
    expect(DEFAULT_PREFS.showDate).toBe(false)
  })

  it('navDock 默认 false (isNavDock 兜底 false)', () => {
    expect(DEFAULT_PREFS.navDock).toBe(false)
  })

  it('widgetSeparator 默认 true (isWidgetSeparator 兜底 true)', () => {
    expect(DEFAULT_PREFS.widgetSeparator).toBe(true)
  })

  it('缩放默认 1.0, 圆角比例默认 1.0', () => {
    expect(DEFAULT_PREFS.gridScale).toBe(1.0)
    expect(DEFAULT_PREFS.weekScale).toBe(1.0)
    expect(DEFAULT_PREFS.gridCornerRatio).toBe(1.0)
  })

  it('visibleDays 默认全开 "1,2,3,4,5,6,7"', () => {
    expect(DEFAULT_PREFS.visibleDays).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('补齐键: weekTwoColumnMode=days / 两栏与隐藏无课日默认关', () => {
    expect(DEFAULT_PREFS.weekTwoColumnMode).toBe('days')
    expect(DEFAULT_PREFS.weekTwoColumn).toBe(false)
    expect(DEFAULT_PREFS.weekHideEmptyDays).toBe(false)
  })

  it('补齐键: widget 三开关默认 colorless=false/vertPunct=false/courseColorless=false', () => {
    expect(DEFAULT_PREFS.widgetColorless).toBe(false)
    expect(DEFAULT_PREFS.vertPunct).toBe(false)
    expect(DEFAULT_PREFS.courseColorless).toBe(false)
  })

  it('语言默认 zh-CN (Android AppPrefs KEY_LANG 兜底), 高刷新默认 true', () => {
    expect(DEFAULT_PREFS.lang).toBe('zh-CN')
    expect(DEFAULT_PREFS.highRefresh).toBe(true)
  })

  it('补齐键: 节假日灰显 4 键默认 greyHoliday/GreyWeekend=true, Style=grey, IgnoreWorkday=true', () => {
    expect(DEFAULT_PREFS.holidayGreyHoliday).toBe(true)
    expect(DEFAULT_PREFS.holidayGreyWeekend).toBe(true)
    expect(DEFAULT_PREFS.holidayStyle).toBe('grey')
    expect(DEFAULT_PREFS.holidayIgnoreWorkday).toBe(true)
  })

  it('clampPrefs: update() 值域校验 (scale 0.7-1.3 / corner 0-2 / inset 4-20 / fold 8-28)', async () => {
    // jsdom 无 matchMedia — 桩可控行为 (与 resolveIsDark describe 同)
    ;(window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({
      matches: q.includes('dark'),
    })
    await usePrefsStore.getState().update({ gridScale: 5, weekScale: 0.1, gridCornerRatio: 99, conflictStackInset: 1, conflictRailInset: 99, conflictFoldSize: 0, visibleDays: [1, 9, 0, 3] })
    const p = usePrefsStore.getState().prefs
    expect(p.gridScale).toBe(1.3)
    expect(p.weekScale).toBe(0.7)
    expect(p.gridCornerRatio).toBe(2)
    expect(p.conflictStackInset).toBe(4)
    expect(p.conflictRailInset).toBe(20)
    expect(p.conflictFoldSize).toBe(8)
    expect(p.visibleDays).toEqual([1, 3])
  })
})

describe('resolveIsDark — 三态 themeMode', () => {
  beforeEach(() => {
    // jsdom 无 matchMedia 实现 — 桩一个可控行为
    ;(window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({
      matches: q.includes('dark'),
    })
  })

  it('dark → true, light → false', () => {
    expect(resolveIsDark({ ...DEFAULT_PREFS, themeMode: 'dark' })).toBe(true)
    expect(resolveIsDark({ ...DEFAULT_PREFS, themeMode: 'light' })).toBe(false)
  })

  it('system → 跟随 prefers-color-scheme', () => {
    expect(resolveIsDark({ ...DEFAULT_PREFS, themeMode: 'system' })).toBe(true)
  })
})
