/**
 * reminderStore 明日预告扩展 (PR48 / v1.0.57 同步移植) — 契约测试。
 *
 * 行为契约 (AppPrefs.kt:39-44 + TomorrowReminderPrefsTest.kt 1:1):
 *  - tomorrowEnabled 默认 false, tomorrowTime 默认 "22:00"
 *  - localStorage 键 sleepy_tomorrow_reminder / sleepy_tomorrow_reminder_time
 *  - clamp: 非法时间回落 22:00, 非法布尔回落 false
 *  - reminderVisibility: tomorrowRow = master && daily (Android `if (dailyEnabled)` 内)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_REMINDER_PREFS,
  clampReminderPrefs,
  loadReminderPrefs,
  persistReminderPrefs,
  reminderVisibility,
} from './reminderStore'

beforeEach(() => {
  localStorage.clear()
})

describe('reminderStore 明日预告 (PR48 移植)', () => {
  it('默认值: tomorrowEnabled=false, tomorrowTime=22:00', () => {
    expect(DEFAULT_REMINDER_PREFS.tomorrowEnabled).toBe(false)
    expect(DEFAULT_REMINDER_PREFS.tomorrowTime).toBe('22:00')
    expect(loadReminderPrefs().tomorrowEnabled).toBe(false)
    expect(loadReminderPrefs().tomorrowTime).toBe('22:00')
  })

  it('写穿读回 — persist 后 load 拿到同值', () => {
    persistReminderPrefs({
      ...DEFAULT_REMINDER_PREFS,
      tomorrowEnabled: true,
      tomorrowTime: '21:30',
    })
    const loaded = loadReminderPrefs()
    expect(loaded.tomorrowEnabled).toBe(true)
    expect(loaded.tomorrowTime).toBe('21:30')
  })

  it('clamp: 坏时间/坏布尔回落默认', () => {
    const clamped = clampReminderPrefs({
      ...DEFAULT_REMINDER_PREFS,
      tomorrowEnabled: 'yes' as unknown as boolean,
      tomorrowTime: '25:00',
    })
    expect(clamped.tomorrowEnabled).toBe(false)
    expect(clamped.tomorrowTime).toBe('22:00')
  })

  it('visible 行: master && daily 才显明日预告行', () => {
    const base = { ...DEFAULT_REMINDER_PREFS, masterEnabled: false, dailyEnabled: true }
    expect(reminderVisibility(base).tomorrowRow).toBe(false)
    expect(reminderVisibility({ ...base, masterEnabled: true }).tomorrowRow).toBe(true)
    expect(reminderVisibility({ ...base, masterEnabled: true, dailyEnabled: false }).tomorrowRow).toBe(false)
  })
})