/**
 * 提醒引擎测试 — CourseNotificationScheduler 语义的 web 对位验证:
 * 分钟点触发 / fired-once 去重 / 假期调休生效周几 / 学期外闸门 / 课前窗口边界。
 * 真实 Dexie (fake-indexeddb) + jsdom; Notification 用捕获类替身; Date 用 fake timers
 * (toFake:['Date'] — 保留真实 setTimeout, 否则 fake-indexeddb 事务无法推进)。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '../../data/db'
import { insertTable, insertCourse } from '../../data/repository'
import { useReminderStore, DEFAULT_REMINDER_PREFS, type ReminderPrefs } from '../../state/reminderStore'
import { initI18n, i18next } from '../../i18n'
import { tick, fireSummary, fireBeforeClass } from './scheduler'
import { alreadyFired } from './fireOnce'

interface Posted {
  title: string
  body: string
  tag: string
}
let posted: Posted[]

class FakeNotification {
  static permission = 'granted'
  onclick: (() => void) | null = null
  constructor(title: string, options?: NotificationOptions) {
    posted.push({ title, body: String(options?.body ?? ''), tag: String(options?.tag ?? '') })
  }
  close() {}
}

function setPrefs(patch: Partial<ReminderPrefs>) {
  useReminderStore.setState({ prefs: { ...DEFAULT_REMINDER_PREFS, ...patch } })
}

/**
 * 学期 2026-09-01(周二)→ mondayOfStart=08-31(周一), maxWeek=20 (至 2027-01-18)。
 * 课程: 周三(3)高数 node1 08:00 / 周二(2)英语 node3 10:00 无教师 / 周四(4)体育 node1。
 */
async function seed(): Promise<number> {
  const tableId = await insertTable({
    name: '主表', startDate: '2026-09-01', maxWeek: 20, nodeCount: 12,
    timeJson: JSON.stringify([
      { node: 1, start: '08:00', end: '08:45' },
      { node: 2, start: '08:55', end: '09:40' },
      { node: 3, start: '10:00', end: '10:45' },
    ]),
    smartConfigJson: '', isDefault: 1, createdAt: 1000,
  })
  const base = {
    tableId, note: '', alias: '', step: 2, startWeek: 1, endWeek: 16,
    type: 0 as const, color: '#FF000000', colorMode: 0 as const, ownTime: false,
    isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '',
    credit: 0, level: 0,
  }
  await insertCourse({ ...base, groupId: 'g1', courseName: '高等数学', teacher: '张三', room: 'A101', day: 3, startNode: 1 })
  await insertCourse({ ...base, groupId: 'g2', courseName: '大学英语', teacher: '', room: '', day: 2, startNode: 3 })
  await insertCourse({ ...base, groupId: 'g3', courseName: '体育', teacher: '李四', room: '操场', day: 4, startNode: 1 })
  return tableId
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
  posted = []
  vi.stubGlobal('Notification', FakeNotification)
  FakeNotification.permission = 'granted'
  initI18n('zh-CN')
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('每日/明日摘要 (tick → fireSummary)', () => {
  it('今日摘要在 dailyTime 分钟点触发, 含首课信息; 同日重复 tick 只发一次', async () => {
    await seed()
    setPrefs({ masterEnabled: true, todayEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0, 30)) // 周三 07:00

    await tick()
    expect(posted).toHaveLength(1)
    expect(posted[0].tag).toBe('sleepy-daily-today-2026-09-02')
    expect(posted[0].body).toContain('高等数学')
    expect(posted[0].body).toContain('08:00')
    expect(posted[0].body).toContain('A101')

    await tick()
    expect(posted).toHaveLength(1)
    expect(alreadyFired('daily-today', '2026-09-02')).toBe(true)
  })

  it('明日摘要取明天(周四)的课, title 用明日键', async () => {
    await seed()
    setPrefs({ masterEnabled: true, todayEnabled: false, tomorrowEnabled: true, tomorrowTime: '22:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 22, 0))

    await tick()
    expect(posted).toHaveLength(1)
    expect(posted[0].tag).toBe('sleepy-daily-tomorrow-2026-09-02')
    expect(posted[0].title).toContain('3') // 明天=9月3日(周四)
    expect(posted[0].body).toContain('体育')
  })

  it('目标日无课 → no_course 文案', async () => {
    await seed()
    setPrefs({ masterEnabled: true })
    vi.setSystemTime(new Date(2026, 8, 6, 7, 0)) // 周日无课
    await fireSummary(new Date(2026, 8, 6), false)
    expect(posted).toHaveLength(1)
    expect(posted[0].title).toBe(i18next.t('notif_daily_title_no_course', { v1: 6 }))
    expect(posted[0].body).toBe(i18next.t('notif_daily_text_no_course'))
  })

  it('master 关 / 未到分钟点 / 权限未授予 → 不发', async () => {
    await seed()
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0))

    setPrefs({ masterEnabled: false, dailyTime: '07:00' })
    await tick()
    expect(posted).toHaveLength(0)

    setPrefs({ masterEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 1))
    await tick()
    expect(posted).toHaveLength(0)

    setPrefs({ masterEnabled: true, dailyTime: '07:00' })
    FakeNotification.permission = 'denied'
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0))
    await tick()
    expect(posted).toHaveLength(0)
  })
})

describe('课前提醒 (fireBeforeClass)', () => {
  const p = (): ReminderPrefs => useReminderStore.getState().prefs

  it('开课时点前 minutes 分钟窗口内命中, 窗口外不发, 同课当日只发一次', async () => {
    await seed()
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10 })
    const wed = (h: number, m: number) => new Date(2026, 8, 2, h, m, 0)

    await fireBeforeClass(wed(7, 49), p()) // notifyAt=07:50 之前
    expect(posted).toHaveLength(0)
    await fireBeforeClass(wed(7, 50), p()) // 命中高数 08:00
    expect(posted).toHaveLength(1)
    expect(posted[0].title).toBe(i18next.t('notif_before_class_title'))
    expect(posted[0].body).toContain('高等数学')
    expect(posted[0].body).toContain('张三') // 有教师变体
    await fireBeforeClass(wed(7, 50), p()) // 台账去重
    expect(posted).toHaveLength(1)
    await fireBeforeClass(wed(7, 51), p()) // 窗口已过
    expect(posted).toHaveLength(1)
  })

  it('无教师课程用无教师文案; fluid-only 时 title 为课程名', async () => {
    await seed()
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10, fluidEnabled: true, bannerEnabled: false })
    // 周二 大学英语 node3 10:00, 提前 10 分 = 09:50
    await fireBeforeClass(new Date(2026, 8, 1, 9, 50), p())
    expect(posted).toHaveLength(1)
    expect(posted[0].title).toBe('大学英语')
    expect(posted[0].body).toContain('大学英语')
    expect(posted[0].body).not.toContain('老师')
  })

  it('假期调休: 周三调成周二 → 按周二课表提醒', async () => {
    const tableId = await seed()
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10 })

    // 无调休: 周三 09:50 不命中 (高数在 08:00, 英语是周二课)
    await fireBeforeClass(new Date(2026, 8, 2, 9, 50), p())
    expect(posted).toHaveLength(0)

    localStorage.setItem(
      `sleepy_holiday_transfers_${tableId}`,
      JSON.stringify([{ sourceDate: '2026-09-02', targetDate: '2026-09-01', segmentId: 's1' }])
    )
    await fireBeforeClass(new Date(2026, 8, 2, 9, 50), p())
    expect(posted).toHaveLength(1)
    expect(posted[0].body).toContain('大学英语')
  })

  it('学期外 (AFTER_END) 不发课前提醒', async () => {
    await seed()
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10 })
    await fireBeforeClass(new Date(2027, 1, 3, 7, 50), p()) // 学期止于 2027-01-18
    expect(posted).toHaveLength(0)
  })

  it('banner 与 fluid 全关 → 课前不发 (Android fallback 语义)', async () => {
    await seed()
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10, bannerEnabled: false, fluidEnabled: false })
    await tickAll(new Date(2026, 8, 2, 7, 50))
    expect(posted).toHaveLength(0)
  })
})

/** 以指定系统时刻跑一次 tick (课前窗口路径经 tick 的 banner||fluid gate) */
async function tickAll(at: Date) {
  vi.setSystemTime(at)
  await tick()
}
