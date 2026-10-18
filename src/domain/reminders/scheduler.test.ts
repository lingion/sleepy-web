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

/** 当前 store prefs 快照 (fireBeforeClass 入参) */
const p = (): ReminderPrefs => useReminderStore.getState().prefs

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

// ==================== 每表独立提醒开关 (ref #143, Android ef644665) ====================

describe('每表独立提醒 (reminderEnabled, ref #143)', () => {
  /** 副表: 周三(3) 大学物理 node2 08:55 (与主表高数 08:00 同日重叠) */
  async function seedSecondTable(name: string, reminderEnabled: 0 | 1): Promise<number> {
    const id = await insertTable({
      name, startDate: '2026-09-01', maxWeek: 20, nodeCount: 12, reminderEnabled,
      timeJson: JSON.stringify([
        { node: 1, start: '08:00', end: '08:45' },
        { node: 2, start: '08:55', end: '09:40' },
      ]),
      smartConfigJson: '', isDefault: 0, createdAt: 2000,
    })
    await insertCourse({
      groupId: 'gx', tableId: id, courseName: '大学物理', teacher: '王五', room: 'B202',
      note: '', alias: '', day: 3, startNode: 2, step: 2, startWeek: 1, endWeek: 16,
      type: 0, color: '#FF000000', colorMode: 0, ownTime: false,
      isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '',
      credit: 0, level: 0,
    })
    return id
  }

  it('后台表(未选中)开启提醒 → 其课也进今日摘要', async () => {
    await seed()
    await seedSecondTable('副表', 1)
    setPrefs({ masterEnabled: true, todayEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0)) // 周三: 主表高数 + 副表物理

    await tick()
    // 两表同日有课 → 各发一条, 均带课表名前缀 (activeTables>1)
    expect(posted).toHaveLength(2)
    expect(posted[0].title).toContain('主表')
    expect(posted[1].title).toContain('副表')
    const bodies = posted.map((p) => p.body).join(' ')
    expect(bodies).toContain('高等数学')
    expect(bodies).toContain('大学物理')
  })

  it('表关闭提醒 → 整表跳过; 仅一张开启时不加前缀 (单表语义不变)', async () => {
    await seed()
    await seedSecondTable('副表', 0)
    setPrefs({ masterEnabled: true, todayEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0))

    await tick()
    expect(posted).toHaveLength(1)
    expect(posted[0].title).not.toContain('·')
    expect(posted[0].title).not.toContain('主表')
    expect(posted[0].body).toContain('高等数学')
    expect(posted[0].body).not.toContain('大学物理')
  })

  it('旧行缺 reminderEnabled 列 → 默认开启 (升级零行为变化, Android NOT NULL DEFAULT 1)', async () => {
    await seed()
    await db.timetables.update(1, { reminderEnabled: undefined } as never)
    setPrefs({ masterEnabled: true, todayEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0))
    await tick()
    expect(posted).toHaveLength(1)
    expect(posted[0].body).toContain('高等数学')
  })

  it('全部表关闭 → 摘要整体静默 (enabledTables 空)', async () => {
    await seed()
    await db.timetables.update(1, { reminderEnabled: 0 })
    setPrefs({ masterEnabled: true, todayEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0))
    await tick()
    expect(posted).toHaveLength(0)
  })

  it('多表开启但仅一表有课 → 单条仍加前缀 (activeTables>1 判前缀, 非 posts)', async () => {
    // 安卓语义: 前缀看 activeTables (过策略的开启表), 不看 posts。
    // 两表都开启, 但目标日只有主表有课 (副表学期外) → active=2 → 加前缀。
    await seed()
    const secondId = await seedSecondTable('副表', 1)
    await db.timetables.update(secondId, { startDate: '2027-02-01' }) // 目标日学期外
    setPrefs({ masterEnabled: true, todayEnabled: true, dailyTime: '07:00' })
    vi.setSystemTime(new Date(2026, 8, 2, 7, 0))

    await tick()
    expect(posted).toHaveLength(1)
    expect(posted[0].title).toContain('主表 ·')
  })

  it('课前提醒跨表扫描: 后台表(非默认表)的课也命中', async () => {
    await seed() // 主表周三 高数 node1 08:00 (notifyAt 07:50)
    await seedSecondTable('副表', 1) // 副表周三 物理 node2 08:55 (notifyAt 08:45)
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10 })
    // 08:45: 高数窗口 [07:50,07:51) 已过; 物理窗口 [08:45,08:46) 命中 → 后台表必须被扫到
    await fireBeforeClass(new Date(2026, 8, 2, 8, 45), p())
    expect(posted).toHaveLength(1)
    expect(posted[0].body).toContain('大学物理')
    expect(posted[0].title).toBe(i18next.t('notif_before_class_title')) // 课前不加表名前缀 (Android receiver 同)
  })

  it('课前提醒同分钟多表命中 → 取最早开始的一节', async () => {
    await seed()
    const id = await seedSecondTable('副表', 1)
    // 副表再加一节 08:00 (node1) 与主表高数同刻 → 两节都在 [07:50,07:51) 命中
    await insertCourse({
      groupId: 'gy', tableId: id, courseName: '早课物理', teacher: '', room: '',
      note: '', alias: '', day: 3, startNode: 1, step: 2, startWeek: 1, endWeek: 16,
      type: 0, color: '#FF000000', colorMode: 0, ownTime: false,
      isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '',
      credit: 0, level: 0,
    })
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 10 })
    await fireBeforeClass(new Date(2026, 8, 2, 7, 50), p())
    expect(posted).toHaveLength(1)
    // 同为 08:00 开始: 按表 id 序稳定取主表高数 (先扫先得, startAt 相同)
    expect(posted[0].body).toContain('高等数学')
  })

  it('课前提醒: 关闭提醒的后台表不弹', async () => {
    await seed()
    await seedSecondTable('副表', 0) // 副表周三物理 08:55, 关掉提醒
    setPrefs({ masterEnabled: true, beforeClassEnabled: true, beforeClassMinutes: 5 })
    // 08:50 = 物理窗口 (08:50-08:55); 高数窗口(07:50-08:00)已过 → 只有副表命中 → 应 0 发
    await fireBeforeClass(new Date(2026, 8, 2, 8, 50), p())
    expect(posted).toHaveLength(0)
  })
})

/** 以指定系统时刻跑一次 tick (课前窗口路径经 tick 的 banner||fluid gate) */
async function tickAll(at: Date) {
  vi.setSystemTime(at)
  await tick()
}
