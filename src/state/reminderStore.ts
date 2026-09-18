/**
 * 提醒设置 store — AppPrefs.kt「提醒」8 keys 的 Web 同构 (ReminderScreen.kt 581 行消费)。
 * Zustand 内存镜像 + localStorage 写穿 (holidayStore 同构模式), 键名沿用 Android + sleepy_ 前缀。
 * 分区独立成 slice 而非并入 prefsStore: Prefs 形状在 src/data/types.ts (跨分区公共类型),
 *   提醒键与 Dexie prefs 行无关, 与 holidayStore 覆盖段同样走 localStorage (AppPrefs 同构)。
 * 纯函数 (值域钳制 / 输入过滤 / 分区可见性派生) 全部导出, 供单测直接断言。
 */

import { create } from 'zustand'

/** 胶囊主显示内容 — AppPrefs.setBeforeClassFluidPrimary require 白名单 */
export type FluidPrimary = 'name' | 'time' | 'room'
export const FLUID_PRIMARY_OPTIONS: readonly FluidPrimary[] = ['name', 'time', 'room']

/** 提前分钟数量程 — LaunchedEffect coerceIn(1, 999) */
export const MINUTES_MIN = 1
export const MINUTES_MAX = 999
/** 分钟输入 debounce — LaunchedEffect(minutesInput) { delay(500) } */
export const MINUTES_DEBOUNCE_MS = 500

export interface ReminderPrefs {
  /** KEY_REMINDER — master 总开关, 默认 false */
  masterEnabled: boolean
  /** KEY_DAILY_ENABLED — 每日提醒卡头总开关, 默认 true (仅 master 开时生效) */
  dailyEnabled: boolean
  /** KEY_TODAY_REMINDER_ENABLED — 今日摘要子开关 (PR48), 默认 true */
  todayEnabled: boolean
  /** KEY_DAILY_TIME — "HH:mm", 默认 "07:00" */
  dailyTime: string
  /** KEY_TOMORROW_REMINDER_ENABLED — 明日预告 (PR48), 默认 false */
  tomorrowEnabled: boolean
  /** KEY_TOMORROW_REMINDER_TIME — "HH:mm", 默认 "22:00" (前一天晚上推送) */
  tomorrowTime: string
  /** KEY_BEFORE_CLASS_ENABLED — 课前提醒, 默认 false */
  beforeClassEnabled: boolean
  /** KEY_BEFORE_CLASS_MINUTES — 提前分钟数, 默认 10 */
  beforeClassMinutes: number
  /** KEY_BEFORE_CLASS_BANNER — 横幅提醒, 默认 true */
  bannerEnabled: boolean
  /** KEY_BEFORE_CLASS_FLUID — 流体云/超级岛, 默认 false */
  fluidEnabled: boolean
  /** KEY_BEFORE_CLASS_FLUID_PRIMARY — name/time/room, 默认 "room" */
  fluidPrimary: FluidPrimary
}

/** Android getter 兜底值逐项 1:1 */
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  masterEnabled: false,
  dailyEnabled: true,
  todayEnabled: true,
  dailyTime: '07:00',
  tomorrowEnabled: false,
  tomorrowTime: '22:00',
  beforeClassEnabled: false,
  beforeClassMinutes: 10,
  bannerEnabled: true,
  fluidEnabled: false,
  fluidPrimary: 'room',
}

/** localStorage 键 — 名称与 AppPrefs.kt 常量同名, 前缀 sleepy_ (sleepy_holiday_overrides 同风格) */
const KEYS = {
  masterEnabled: 'sleepy_reminder_master',
  dailyEnabled: 'sleepy_daily_reminder',
  todayEnabled: 'sleepy_today_reminder',
  dailyTime: 'sleepy_daily_reminder_time',
  tomorrowEnabled: 'sleepy_tomorrow_reminder',
  tomorrowTime: 'sleepy_tomorrow_reminder_time',
  beforeClassEnabled: 'sleepy_before_class_enabled',
  beforeClassMinutes: 'sleepy_before_class_minutes',
  bannerEnabled: 'sleepy_before_class_banner',
  fluidEnabled: 'sleepy_before_class_fluid',
  fluidPrimary: 'sleepy_before_class_fluid_primary',
} as const

interface ReminderState {
  prefs: ReminderPrefs
  /** 局部更新 — 先钳制值域再写穿 (prefsStore.update → clampPrefs 同构) */
  update: (patch: Partial<ReminderPrefs>) => void
  /** 回到 Android 兜底值 (测试/复位用) */
  reset: () => void
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  prefs: loadReminderPrefs(),

  update: (patch) => {
    const next = clampReminderPrefs({ ...get().prefs, ...patch })
    set({ prefs: next })
    persistReminderPrefs(next)
  },

  reset: () => {
    set({ prefs: { ...DEFAULT_REMINDER_PREFS } })
    persistReminderPrefs(DEFAULT_REMINDER_PREFS)
  },
}))

/** 读 localStorage → 钳制后的完整配置 (缺键/坏值逐字段回落 Android 兜底) */
export function loadReminderPrefs(): ReminderPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_REMINDER_PREFS }
  const raw: Record<string, string | null> = {}
  for (const key of Object.values(KEYS)) {
    try {
      raw[key] = localStorage.getItem(key)
    } catch {
      raw[key] = null
    }
  }
  return clampReminderPrefs({
    masterEnabled: parseBool(raw[KEYS.masterEnabled]),
    dailyEnabled: parseBool(raw[KEYS.dailyEnabled]),
    todayEnabled: parseBool(raw[KEYS.todayEnabled]),
    dailyTime: raw[KEYS.dailyTime] ?? undefined,
    tomorrowEnabled: parseBool(raw[KEYS.tomorrowEnabled]),
    tomorrowTime: raw[KEYS.tomorrowTime] ?? undefined,
    beforeClassEnabled: parseBool(raw[KEYS.beforeClassEnabled]),
    beforeClassMinutes: raw[KEYS.beforeClassMinutes] === null ? undefined : Number(raw[KEYS.beforeClassMinutes]),
    bannerEnabled: parseBool(raw[KEYS.bannerEnabled]),
    fluidEnabled: parseBool(raw[KEYS.fluidEnabled]),
    fluidPrimary: (raw[KEYS.fluidPrimary] as FluidPrimary | null) ?? undefined,
  })
}

/** 写穿 localStorage — 配额/隐私模式失败静默 (holidayStore 同) */
export function persistReminderPrefs(p: ReminderPrefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEYS.masterEnabled, String(p.masterEnabled))
    localStorage.setItem(KEYS.dailyEnabled, String(p.dailyEnabled))
    localStorage.setItem(KEYS.todayEnabled, String(p.todayEnabled))
    localStorage.setItem(KEYS.dailyTime, p.dailyTime)
    localStorage.setItem(KEYS.tomorrowEnabled, String(p.tomorrowEnabled))
    localStorage.setItem(KEYS.tomorrowTime, p.tomorrowTime)
    localStorage.setItem(KEYS.beforeClassEnabled, String(p.beforeClassEnabled))
    localStorage.setItem(KEYS.beforeClassMinutes, String(p.beforeClassMinutes))
    localStorage.setItem(KEYS.bannerEnabled, String(p.bannerEnabled))
    localStorage.setItem(KEYS.fluidEnabled, String(p.fluidEnabled))
    localStorage.setItem(KEYS.fluidPrimary, p.fluidPrimary)
  } catch {
    /* 忽略 */
  }
}

/** 值域校验 — 缺字段/坏字段回落 DEFAULT_REMINDER_PREFS 对应项 */
export function clampReminderPrefs(patch: Partial<ReminderPrefs>): ReminderPrefs {
  const d = DEFAULT_REMINDER_PREFS
  return {
    masterEnabled: typeof patch.masterEnabled === 'boolean' ? patch.masterEnabled : d.masterEnabled,
    dailyEnabled: typeof patch.dailyEnabled === 'boolean' ? patch.dailyEnabled : d.dailyEnabled,
    todayEnabled: typeof patch.todayEnabled === 'boolean' ? patch.todayEnabled : d.todayEnabled,
    dailyTime: isHHmm(patch.dailyTime) ? (patch.dailyTime as string) : d.dailyTime,
    tomorrowEnabled: typeof patch.tomorrowEnabled === 'boolean' ? patch.tomorrowEnabled : d.tomorrowEnabled,
    tomorrowTime: isHHmm(patch.tomorrowTime) ? (patch.tomorrowTime as string) : d.tomorrowTime,
    beforeClassEnabled: typeof patch.beforeClassEnabled === 'boolean' ? patch.beforeClassEnabled : d.beforeClassEnabled,
    beforeClassMinutes: clampMinutes(patch.beforeClassMinutes),
    bannerEnabled: typeof patch.bannerEnabled === 'boolean' ? patch.bannerEnabled : d.bannerEnabled,
    fluidEnabled: typeof patch.fluidEnabled === 'boolean' ? patch.fluidEnabled : d.fluidEnabled,
    fluidPrimary: isFluidPrimary(patch.fluidPrimary) ? patch.fluidPrimary : d.fluidPrimary,
  }
}

/** "HH:mm" 严格式 — Android getDailyReminderTime 形态 (TimePicker 落库 "%02d:%02d") */
export function isHHmm(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) return false
  const [h, m] = v.split(':').map(Number)
  return h <= 23 && m <= 59
}

function isFluidPrimary(v: unknown): v is FluidPrimary {
  return (FLUID_PRIMARY_OPTIONS as readonly string[]).includes(v as string)
}

/** 分钟钳制 — coerceIn(1, 999), 非数回落默认 10 */
function clampMinutes(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_PREFS.beforeClassMinutes
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.trunc(n)))
}

function parseBool(v: string | null): boolean | undefined {
  return v === null ? undefined : v === 'true'
}

/**
 * 分钟输入过滤 — TextField onValueChange 1:1:
 * 只留数字; 空串允许 (清空待重填); 解析值 > 999 时整次按键作废 (保留原值, 不是钳到 999)。
 */
export function filterMinutesInput(prev: string, raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  const v = Number(digits)
  return v <= MINUTES_MAX ? digits : prev
}

/**
 * debounce 到点后落库值 — LaunchedEffect 同: 空串早退 (null = 不写), 否则 coerceIn(1, 999)。
 */
export function commitMinutesInput(text: string): number | null {
  if (text.trim() === '') return null
  const v = Number(text.replace(/\D/g, ''))
  if (!Number.isFinite(v)) return null
  return clampMinutes(v)
}

/** 分区可见性 — Android `if (masterEnabled)` / `if (dailyEnabled)` / `if (beforeClassEnabled)` / `if (fluidEnabled)` 嵌套链 */
export interface ReminderVisibility {
  /** 每日提醒卡 (master) */
  dailyCard: boolean
  /** 时间选择行 + 每日预览 (master && daily) */
  dailyTimeRow: boolean
  dailyPreview: boolean
  /** 今日摘要行 + 时间 + 预览 (master && daily — Android 在 if (dailyEnabled) 块内) */
  todayRow: boolean
  /** 明日预告行 + 时间 + 预览 (master && daily — Android 在 if (dailyEnabled) 块内) */
  tomorrowRow: boolean
  /** 课前提醒卡 (master) */
  beforeClassCard: boolean
  /** 提前分钟 + 课前预览 + 横幅 + 流体云 (master && beforeClass) */
  beforeClassMinutes: boolean
  beforeClassPreview: boolean
  bannerRow: boolean
  fluidRow: boolean
  /** 胶囊主显示内容 (master && beforeClass && fluid) */
  fluidFields: boolean
}

export function reminderVisibility(p: ReminderPrefs): ReminderVisibility {
  const beforeSub = p.masterEnabled && p.beforeClassEnabled
  return {
    dailyCard: p.masterEnabled,
    dailyTimeRow: p.masterEnabled && p.dailyEnabled,
    dailyPreview: p.masterEnabled && p.dailyEnabled,
    todayRow: p.masterEnabled && p.dailyEnabled,
    tomorrowRow: p.masterEnabled && p.dailyEnabled,
    beforeClassCard: p.masterEnabled,
    beforeClassMinutes: beforeSub,
    beforeClassPreview: beforeSub,
    bannerRow: beforeSub,
    fluidRow: beforeSub,
    fluidFields: beforeSub && p.fluidEnabled,
  }
}

/** 当前应展示的预览文案 key (Android 两处 preview 均为静态示例串) */
export function visiblePreviewKeys(p: ReminderPrefs): string[] {
  const v = reminderVisibility(p)
  const out: string[] = []
  if (v.dailyPreview) out.push('reminder_daily_preview')
  if (v.beforeClassPreview) out.push('reminder_before_class_preview')
  return out
}

/** 胶囊主显示内容 → 文案 key (fluidPrimaryLabel 1:1, 未知值兜底 room) */
export function fluidPrimaryLabelKey(primary: string): string {
  if (primary === 'name') return 'reminder_fluid_field_name'
  if (primary === 'time') return 'reminder_fluid_field_time'
  return 'reminder_fluid_field_room'
}
