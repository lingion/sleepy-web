/**
 * reminderStore 契约测试 — DEFAULT_REMINDER_PREFS 与 AppPrefs.kt getter 兜底值逐项对齐,
 * 并锁定 ReminderScreen.kt 的输入过滤 (digits-only / >999 整次作废)、debounce 落库值
 * 与 master→daily/beforeClass→fluid 三级开关的分区可见性 (enable/disable 依赖)。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_REMINDER_PREFS,
  MINUTES_DEBOUNCE_MS,
  MINUTES_MAX,
  MINUTES_MIN,
  clampReminderPrefs,
  commitMinutesInput,
  filterMinutesInput,
  fluidPrimaryLabelKey,
  isHHmm,
  loadReminderPrefs,
  reminderVisibility,
  useReminderStore,
  visiblePreviewKeys,
} from './reminderStore'

describe('DEFAULT_REMINDER_PREFS 对齐 AppPrefs.kt 兜底值', () => {
  it('master 默认 false (isReminderEnabled 兜底 false)', () => {
    expect(DEFAULT_REMINDER_PREFS.masterEnabled).toBe(false)
  })

  it('daily 默认 true / 时间默认 "07:00" (isDailyReminderEnabled / getDailyReminderTime)', () => {
    expect(DEFAULT_REMINDER_PREFS.dailyEnabled).toBe(true)
    expect(DEFAULT_REMINDER_PREFS.dailyTime).toBe('07:00')
  })

  it('beforeClass 默认 false / 提前分钟默认 10 (isBeforeClassEnabled / getBeforeClassMinutes)', () => {
    expect(DEFAULT_REMINDER_PREFS.beforeClassEnabled).toBe(false)
    expect(DEFAULT_REMINDER_PREFS.beforeClassMinutes).toBe(10)
  })

  it('banner 默认 true / fluid 默认 false / 胶囊主内容默认 room', () => {
    expect(DEFAULT_REMINDER_PREFS.bannerEnabled).toBe(true)
    expect(DEFAULT_REMINDER_PREFS.fluidEnabled).toBe(false)
    expect(DEFAULT_REMINDER_PREFS.fluidPrimary).toBe('room')
  })

  it('debounce 500ms、分钟量程 1..999 (LaunchedEffect delay/coerceIn)', () => {
    expect(MINUTES_DEBOUNCE_MS).toBe(500)
    expect(MINUTES_MIN).toBe(1)
    expect(MINUTES_MAX).toBe(999)
  })
})

describe('clampReminderPrefs — 值域校验', () => {
  it('分钟 coerceIn(1, 999): 0→1 / 5000→999 / 小数截断 / 非数回落 10', () => {
    expect(clampReminderPrefs({ beforeClassMinutes: 0 }).beforeClassMinutes).toBe(1)
    expect(clampReminderPrefs({ beforeClassMinutes: 5000 }).beforeClassMinutes).toBe(999)
    expect(clampReminderPrefs({ beforeClassMinutes: 15.9 }).beforeClassMinutes).toBe(15)
    expect(clampReminderPrefs({ beforeClassMinutes: Number.NaN }).beforeClassMinutes).toBe(10)
  })

  it('时间必须 HH:mm: 坏串回落 07:00, 边界 00:00/23:59 通过', () => {
    expect(clampReminderPrefs({ dailyTime: '7:00' }).dailyTime).toBe('07:00')
    expect(clampReminderPrefs({ dailyTime: '24:00' }).dailyTime).toBe('07:00')
    expect(clampReminderPrefs({ dailyTime: '08:60' }).dailyTime).toBe('07:00')
    expect(clampReminderPrefs({ dailyTime: '' }).dailyTime).toBe('07:00')
    expect(clampReminderPrefs({ dailyTime: '00:00' }).dailyTime).toBe('00:00')
    expect(clampReminderPrefs({ dailyTime: '23:59' }).dailyTime).toBe('23:59')
  })

  it('fluidPrimary 白名单 name/time/room — 其余 (含 legacy teacher) 回落 room', () => {
    expect(clampReminderPrefs({ fluidPrimary: 'name' }).fluidPrimary).toBe('name')
    expect(clampReminderPrefs({ fluidPrimary: 'time' }).fluidPrimary).toBe('time')
    expect(clampReminderPrefs({ fluidPrimary: 'teacher' as never }).fluidPrimary).toBe('room')
  })

  it('isHHmm 单元判定', () => {
    expect(isHHmm('07:00')).toBe(true)
    expect(isHHmm('07:0')).toBe(false)
    expect(isHHmm(undefined)).toBe(false)
  })
})

describe('分钟输入过滤与 debounce 落库 — TextField onValueChange / LaunchedEffect 同构', () => {
  it('剔除非数字; 空串允许 (清空)', () => {
    expect(filterMinutesInput('10', '1a0')).toBe('10')
    expect(filterMinutesInput('10', 'abc')).toBe('')
    expect(filterMinutesInput('10', '')).toBe('')
  })

  it('解析值 > 999 整次按键作废 (保留原值, 不钳成 999)', () => {
    expect(filterMinutesInput('10', '1000')).toBe('10')
    expect(filterMinutesInput('999', '9999')).toBe('999')
    expect(filterMinutesInput('10', '999')).toBe('999')
  })

  it('commitMinutesInput: 空串早退 null; 否则 coerceIn(1, 999)', () => {
    expect(commitMinutesInput('')).toBeNull()
    expect(commitMinutesInput('   ')).toBeNull()
    expect(commitMinutesInput('007')).toBe(7)
    expect(commitMinutesInput('0')).toBe(1)
    expect(commitMinutesInput('5000')).toBe(999)
  })
})

describe('reminderVisibility — 三级开关依赖链', () => {
  const base = { ...DEFAULT_REMINDER_PREFS }

  it('master 关 → 两个子卡整体隐藏 (Android if (masterEnabled))', () => {
    const v = reminderVisibility({ ...base, masterEnabled: false, dailyEnabled: true, beforeClassEnabled: true, fluidEnabled: true })
    expect(v.dailyCard).toBe(false)
    expect(v.beforeClassCard).toBe(false)
    expect(Object.values(v).every((x) => x === false)).toBe(true)
  })

  it('master 开 + daily 关 → 时间行/每日预览隐藏, 课前分区不受影响', () => {
    const v = reminderVisibility({ ...base, masterEnabled: true, dailyEnabled: false, beforeClassEnabled: true })
    expect(v.dailyCard).toBe(true)
    expect(v.dailyTimeRow).toBe(false)
    expect(v.dailyPreview).toBe(false)
    expect(v.beforeClassCard).toBe(true)
    expect(v.beforeClassMinutes).toBe(true)
  })

  it('beforeClass 关 → 分钟/预览/横幅/流体云全隐藏; 开 → 全显 (banner 默认 true 仍展示开关)', () => {
    const off = reminderVisibility({ ...base, masterEnabled: true, beforeClassEnabled: false })
    expect([off.beforeClassMinutes, off.beforeClassPreview, off.bannerRow, off.fluidRow, off.fluidFields]).toEqual([false, false, false, false, false])
    const on = reminderVisibility({ ...base, masterEnabled: true, beforeClassEnabled: true })
    expect([on.beforeClassMinutes, on.beforeClassPreview, on.bannerRow, on.fluidRow]).toEqual([true, true, true, true])
    expect(on.fluidFields).toBe(false)
  })

  it('fluid 开 → 胶囊主显示内容区出现', () => {
    const v = reminderVisibility({ ...base, masterEnabled: true, beforeClassEnabled: true, fluidEnabled: true })
    expect(v.fluidFields).toBe(true)
  })

  it('visiblePreviewKeys — 预览文案随两级开关派生', () => {
    expect(visiblePreviewKeys({ ...base, masterEnabled: false })).toEqual([])
    expect(visiblePreviewKeys({ ...base, masterEnabled: true, dailyEnabled: true, beforeClassEnabled: false })).toEqual(['reminder_daily_preview'])
    expect(visiblePreviewKeys({ ...base, masterEnabled: true, dailyEnabled: false, beforeClassEnabled: true })).toEqual(['reminder_before_class_preview'])
    expect(visiblePreviewKeys({ ...base, masterEnabled: true, dailyEnabled: true, beforeClassEnabled: true })).toEqual(['reminder_daily_preview', 'reminder_before_class_preview'])
  })

  it('fluidPrimaryLabelKey — name/time/room 映射, 未知兜底 room', () => {
    expect(fluidPrimaryLabelKey('name')).toBe('reminder_fluid_field_name')
    expect(fluidPrimaryLabelKey('time')).toBe('reminder_fluid_field_time')
    expect(fluidPrimaryLabelKey('room')).toBe('reminder_fluid_field_room')
    expect(fluidPrimaryLabelKey('teacher')).toBe('reminder_fluid_field_room')
  })
})

describe('localStorage 写穿 (AppPrefs SharedPreferences 同构)', () => {
  beforeEach(() => {
    localStorage.clear()
    useReminderStore.getState().reset()
  })

  it('update() 即写穿, 重新读取还原同一份配置', () => {
    useReminderStore.getState().update({ masterEnabled: true, dailyTime: '08:30', beforeClassMinutes: 15, fluidPrimary: 'name' })
    expect(localStorage.getItem('sleepy_reminder_master')).toBe('true')
    expect(localStorage.getItem('sleepy_daily_reminder_time')).toBe('08:30')
    expect(localStorage.getItem('sleepy_before_class_minutes')).toBe('15')
    expect(localStorage.getItem('sleepy_before_class_fluid_primary')).toBe('name')
    expect(loadReminderPrefs()).toEqual(useReminderStore.getState().prefs)
  })

  it('update() 钳制后再落库 (越界值不会污染存储)', () => {
    useReminderStore.getState().update({ beforeClassMinutes: 5000, dailyTime: '9:9', fluidPrimary: 'teacher' as never })
    expect(localStorage.getItem('sleepy_before_class_minutes')).toBe('999')
    expect(localStorage.getItem('sleepy_daily_reminder_time')).toBe('07:00')
    expect(localStorage.getItem('sleepy_before_class_fluid_primary')).toBe('room')
  })

  it('空存储 → 全默认; 坏值 → 逐字段回落默认', () => {
    localStorage.clear()
    expect(loadReminderPrefs()).toEqual(DEFAULT_REMINDER_PREFS)
    localStorage.setItem('sleepy_before_class_minutes', 'abc')
    localStorage.setItem('sleepy_daily_reminder_time', '2026-01-01T07:00')
    localStorage.setItem('sleepy_before_class_fluid_primary', 'teacher')
    const p = loadReminderPrefs()
    expect(p.beforeClassMinutes).toBe(10)
    expect(p.dailyTime).toBe('07:00')
    expect(p.fluidPrimary).toBe('room')
  })

  it('master 关闭只改 master, 子开关配置保留 (Android 注释: 重开后不丢 daily/beforeClass)', () => {
    useReminderStore.getState().update({ masterEnabled: true, dailyEnabled: true, beforeClassEnabled: true, fluidEnabled: true, beforeClassMinutes: 20 })
    useReminderStore.getState().update({ masterEnabled: false })
    const p = useReminderStore.getState().prefs
    expect(p.masterEnabled).toBe(false)
    expect(p.dailyEnabled).toBe(true)
    expect(p.beforeClassEnabled).toBe(true)
    expect(p.fluidEnabled).toBe(true)
    expect(p.beforeClassMinutes).toBe(20)
  })
})
