/**
 * preferences 模块 codec — MigrationPrefsCodec.kt 1:1。
 * web 的偏好分散在 Dexie prefs 行 + 若干 localStorage 键; 这里聚合成 Android
 * PrefsSnapshot (files: {name → entries: {key → PrefValue}}) 的物理形态, 使 web 与 Android
 * 读写同一 .sleepybackup。
 *
 * 键名规则:
 *  - Dexie Prefs 字段名基本与 Android AppPrefs 常量同名, 少数用 Android 侧键名
 *    (theme_mode/theme_key/language/high_refresh_rate/…) — 映射表见 PrefsFieldMap。
 *  - 提醒/节假日/主题走 localStorage, 键名加 sleepy_ 前缀 (与 Android 常量同名去前缀)。
 *  - "缺键=默认" 语义: 仅导出**实际存在**的键; 自定义主题/节假日为空则整文件不进包。
 */

import { loadPrefs, savePrefs } from '../../data/db'
import type { Prefs } from '../../data/types'

export type PrefType = 'BOOL' | 'INT' | 'LONG' | 'FLOAT' | 'STRING' | 'STRING_SET'

/** 与 Android PrefValue 对齐 — 各类型字段可选, 仅携带有效值 */
export interface PrefValue {
  type: PrefType
  bool?: boolean
  /** INT/LONG/FLOAT 统一走 number (JS 精度内) */
  number?: number
  float?: number
  string?: string
  stringSet?: string[]
}

export interface PrefsFileSnapshot {
  entries: Record<string, PrefValue>
}

export interface PrefsSnapshot {
  files: Record<string, PrefsFileSnapshot>
}

/** PREFERENCES 模块覆盖的 SharedPreferences 文件 (MigrationPrefsFileMap) */
export const PREFERENCE_FILES = ['sleepy_prefs', 'custom_themes'] as const

// ---- Dexie Prefs 字段 → Android 键名 + 类型 ---------------------------------
// 多数字段名与 AppPrefs.kt 常量 1:1; 例外用 Android 侧键名。类型: 数字 FLOAT, 布尔 BOOL, 字符串 STRING。
type FieldType = 'BOOL' | 'INT' | 'FLOAT' | 'STRING'
interface PrefsFieldMap {
  field: keyof Prefs
  key: string
  type: FieldType
  /** 仅当该值非默认/非空才进包 (JSON 串类) */
  nonTrivial?: (v: unknown) => boolean
}

const PrefsFieldMap: PrefsFieldMap[] = [
  { field: 'themeMode', key: 'theme_mode', type: 'STRING' },
  { field: 'theme', key: 'theme_key', type: 'STRING' },
  { field: 'lang', key: 'language', type: 'STRING' },
  { field: 'displayMode', key: 'display_mode', type: 'STRING' },
  { field: 'gridSubInfo', key: 'grid_sub_info', type: 'STRING' },
  { field: 'conflictStyle', key: 'conflict_style', type: 'STRING' },
  { field: 'conflictStackInset', key: 'conflict_stack_inset', type: 'FLOAT' },
  { field: 'conflictRailInset', key: 'conflict_rail_inset', type: 'FLOAT' },
  { field: 'conflictFoldSize', key: 'conflict_fold_size', type: 'FLOAT' },
  { field: 'startView', key: 'start_view', type: 'STRING' },
  { field: 'showViewSwitcher', key: 'show_view_switcher', type: 'BOOL' },
  { field: 'showDate', key: 'show_date', type: 'BOOL' },
  { field: 'visibleDays', key: 'visible_days', type: 'STRING' }, // "1,2,3,4,5,6,7"
  { field: 'gridScale', key: 'grid_scale', type: 'FLOAT' },
  { field: 'weekScale', key: 'week_scale', type: 'FLOAT' },
  { field: 'gridCornerRatio', key: 'grid_corner_ratio', type: 'FLOAT' },
  { field: 'weekTwoColumn', key: 'week_two_column', type: 'BOOL' },
  { field: 'weekTwoColumnMode', key: 'week_two_column_mode', type: 'STRING' },
  { field: 'weekHideEmptyDays', key: 'week_hide_empty_days', type: 'BOOL' },
  { field: 'weekUseAlias', key: 'week_use_alias', type: 'BOOL' },
  { field: 'gridUseAlias', key: 'grid_use_alias', type: 'BOOL' },
  { field: 'widgetUseAlias', key: 'widget_use_alias', type: 'BOOL' },
  { field: 'conflictDefaultTop', key: 'conflict_default_top', type: 'STRING', nonTrivial: (v) => Object.keys((v as object) ?? {}).length > 0 },
  { field: 'navDock', key: 'nav_dock', type: 'BOOL' },
  { field: 'highRefresh', key: 'high_refresh_rate', type: 'BOOL' },
  { field: 'vertPunct', key: 'vert_punct_replace', type: 'BOOL' },
  { field: 'widgetColorless', key: 'widget_colorless', type: 'BOOL' },
  { field: 'courseColorless', key: 'course_colorless', type: 'BOOL' },
  { field: 'widgetSeparator', key: 'widget_separator', type: 'BOOL' },
  { field: 'holidayGreyHoliday', key: 'holiday_grey_holiday', type: 'BOOL' },
  { field: 'holidayGreyWeekend', key: 'holiday_grey_weekend', type: 'BOOL' },
  { field: 'holidayStyle', key: 'holiday_style', type: 'STRING' },
  { field: 'holidayIgnoreWorkday', key: 'holiday_ignore_workday', type: 'BOOL' },
  { field: 'gridAdaptiveHeight', key: 'grid_adaptive_height', type: 'BOOL' },
  { field: 'gridPinchZoom', key: 'grid_pinch_zoom', type: 'BOOL' },
  { field: 'gridRowScale', key: 'grid_row_scale', type: 'FLOAT' },
  { field: 'nearestBusyDay', key: 'nearest_busy_day', type: 'BOOL' },
  { field: 'gridAutoHideEmptyEvening', key: 'grid_auto_hide_empty_evening', type: 'BOOL' },
  { field: 'gridEveningStart', key: 'grid_evening_start', type: 'STRING' },
  { field: 'periodHeaderLayout', key: 'period_header_layout', type: 'STRING' },
  { field: 'periodHeaderStyle', key: 'period_header_style', type: 'STRING' },
  { field: 'periodHeaderHanging', key: 'period_header_hanging', type: 'FLOAT' },
  { field: 'periodHeaderShowX', key: 'period_header_show_x', type: 'BOOL' },
  { field: 'gridShowSeparators', key: 'grid_show_separators', type: 'BOOL' },
  { field: 'gridLongBreakSpacing', key: 'grid_long_break_spacing', type: 'BOOL' },
  { field: 'calendarImportRange', key: 'calendar_import_range', type: 'STRING' },
  { field: 'calendarApplyTransfers', key: 'calendar_import_apply_transfers', type: 'BOOL' },
  { field: 'calendarReminderMinutes', key: 'calendar_import_reminder_minutes', type: 'INT' },
  { field: 'calendarFirstAlarmEnabled', key: 'calendar_import_first_alarm', type: 'BOOL' },
  { field: 'calendarFirstAlarmMinutes', key: 'calendar_import_first_alarm_minutes', type: 'INT' },
  { field: 'updateCheckEnabled', key: 'update_check_enabled', type: 'BOOL' },
  { field: 'updateNoticeDismissedVersion', key: 'update_notice_dismissed_version', type: 'STRING' },
]

// 反向: Android 键名 → Prefs 字段 (导入侧)
const KEY_TO_FIELD = new Map(PrefsFieldMap.map((m) => [m.key, m]))

/** localStorage 键 (含 sleepy_ 前缀) → Android 键名 + 类型。仅导出实际存在的键。 */
const LOCAL_KEYS: Array<{ local: string; key: string; type: PrefType; isJson?: boolean }> = [
  // 提醒 (reminderStore)
  { local: 'sleepy_reminder_master', key: 'reminder_master', type: 'BOOL' },
  { local: 'sleepy_daily_reminder', key: 'daily_reminder', type: 'BOOL' },
  { local: 'sleepy_today_reminder', key: 'today_reminder', type: 'BOOL' },
  { local: 'sleepy_daily_reminder_time', key: 'daily_reminder_time', type: 'STRING' },
  { local: 'sleepy_tomorrow_reminder', key: 'tomorrow_reminder', type: 'BOOL' },
  { local: 'sleepy_tomorrow_reminder_time', key: 'tomorrow_reminder_time', type: 'STRING' },
  { local: 'sleepy_before_class_enabled', key: 'before_class_enabled', type: 'BOOL' },
  { local: 'sleepy_before_class_minutes', key: 'before_class_minutes', type: 'INT' },
  { local: 'sleepy_before_class_banner', key: 'before_class_banner', type: 'BOOL' },
  { local: 'sleepy_before_class_fluid', key: 'before_class_fluid', type: 'BOOL' },
  { local: 'sleepy_before_class_fluid_primary', key: 'before_class_fluid_primary', type: 'STRING' },
  // 节假日覆盖 (holidayStore, JSON 数组, 非空才进包)
  { local: 'sleepy_holiday_overrides', key: 'holiday_overrides', type: 'STRING', isJson: true },
]

function lsGet(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function parseBool(s: string): boolean {
  return s === 'true' || s === '1'
}

function coerceValue(type: FieldType, raw: unknown): PrefValue {
  if (type === 'BOOL') {
    // visibleDays: number[] → "1,2,3" 字符串 (Android 侧 visible_days 是 String 非 Set)
    if (Array.isArray(raw)) return { type: 'STRING', string: (raw as number[]).join(',') }
    return { type: 'BOOL', bool: raw === true || raw === 1 }
  }
  if (type === 'INT') {
    return { type: 'INT', number: Number(raw) }
  }
  if (type === 'FLOAT') {
    const n = Number(raw)
    if (Number.isFinite(n)) return { type: 'FLOAT', float: n }
    return { type: 'STRING', string: String(raw) }
  }
  // STRING — 对象 (conflictDefaultTop) 走 JSON
  if (typeof raw === 'object') return { type: 'STRING', string: JSON.stringify(raw) }
  return { type: 'STRING', string: String(raw) }
}

function coerceRaw(type: PrefType, raw: string, isJson: boolean): PrefValue {
  switch (type) {
    case 'BOOL':
      return { type: 'BOOL', bool: parseBool(raw) }
    case 'INT':
    case 'LONG':
      return { type: 'INT', number: Number(raw) }
    case 'FLOAT':
      return { type: 'FLOAT', float: Number(raw) }
    default:
      return isJson ? { type: 'STRING', string: raw } : { type: 'STRING', string: raw }
  }
}

// ---- 收集 (异步, Dexie + localStorage) ------------------------------------

export async function collectPrefsFiles(): Promise<PrefsSnapshot> {
  const files: Record<string, PrefsFileSnapshot> = {}
  const main = await encodePrefsFilesAsync()
  if (Object.keys(main.entries).length > 0) files['sleepy_prefs'] = main
  // 自定义主题 — 整串一个 STRING 键 (CustomThemeStore 同构)
  const themes = lsGet('custom_themes')
  if (themes !== null && themes !== '') {
    files['custom_themes'] = { entries: { custom_themes: { type: 'STRING', string: themes } } }
  }
  return { files }
}

/** collect 的 Dexie 侧 (异步, 供编码与往返一致性测试)。 */
async function encodePrefsFilesAsync(): Promise<PrefsFileSnapshot> {
  const entries: Record<string, PrefValue> = {}
  const prefs = await loadPrefs()
  for (const m of PrefsFieldMap) {
    const raw = (prefs as unknown as Record<string, unknown>)[m.field]
    if (raw === undefined || raw === null) continue
    if (m.nonTrivial && !m.nonTrivial(raw)) continue
    entries[m.key] = coerceValue(m.type, raw)
  }
  for (const lk of LOCAL_KEYS) {
    const raw = lsGet(lk.local)
    if (raw === null) continue
    if (lk.isJson && (raw === '[]' || raw === '')) continue
    entries[lk.key] = coerceRaw(lk.type, raw, lk.isJson === true)
  }
  for (const tid of activeTableIds()) {
    const raw = lsGet(`sleepy_holiday_transfers_${tid}`)
    if (raw === null || raw === '[]' || raw === '') continue
    entries[`holiday_transfer_${tid}`] = { type: 'STRING', string: raw }
  }
  return { entries }
}

// 供同步路径 (编码单测/无副作用) 使用 — 直接读 Prefs 不经 Dexie。
function activeTableIds(): number[] {
  // 调休映射键存在即视为该表有映射 (遍历已知表不可行于纯 codec, 故由调用方注入)
  // 默认无 — 通过 window 上的注入点扩展; 当前 web 无 holidayTransfer 独立 localStorage 每表键,
  // 真实数据走 holidayStore 内存; 此处保守仅导出存在键的情况。
  const ids: number[] = []
  if (typeof localStorage === 'undefined') return ids
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('sleepy_holiday_transfers_')) {
      const tid = Number(k.slice('sleepy_holiday_transfers_'.length))
      if (Number.isFinite(tid)) ids.push(tid)
    }
  }
  return ids
}

// ---- 序列化 (与 Android encode/decode 对齐: 显式默认输出) ------------------

export function encodePrefs(snapshot: PrefsSnapshot): string {
  return JSON.stringify(snapshot)
}

export function decodePrefs(text: string): PrefsSnapshot {
  const raw = JSON.parse(text) as { files?: Record<string, { entries?: Record<string, PrefValue> }> }
  const files: Record<string, PrefsFileSnapshot> = {}
  for (const [name, f] of Object.entries(raw.files ?? {})) {
    files[name] = { entries: f.entries ?? {} }
  }
  return { files }
}

// ---- 写回 (导入侧) ---------------------------------------------------------

/**
 * 把 PREFERENCES 快照按键写回 web。
 * @param overwrite true=先清提醒/节假日/主题 localStorage 键再写 (对应 Android 整文件 clear);
 *                 false=仅覆盖同名键 (MERGE)。Dexie Prefs 行两侧均按字段合并。
 */
export async function applyPrefsFiles(snapshot: PrefsSnapshot, overwrite: boolean): Promise<void> {
  const main = snapshot.files['sleepy_prefs']
  if (main) {
    const next = await loadPrefs()
    const nextRec = next as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(main.entries)) {
      applyEntry(nextRec, key, value)
    }
    await savePrefs(nextRec as unknown as Prefs)
    // 提醒/节假日/主题键: 先按 overwrite 清旧, 再逐键写
    if (overwrite) {
      for (const lk of LOCAL_KEYS) {
        if (lsGet(lk.local) !== null) localStorage.removeItem(lk.local)
      }
      clearHolidayTransferKeys()
      if (lsGet('custom_themes') !== null) localStorage.removeItem('custom_themes')
    }
    writeLocalEntries(main.entries, false)
  }
  const themes = snapshot.files['custom_themes']
  if (themes) {
    for (const [, value] of Object.entries(themes.entries)) {
      if (value.type === 'STRING') localStorage.setItem('custom_themes', value.string ?? '')
    }
  }
}

/** 把 Prefs 键写回 Dexie 行 (主键=field, 其余走 localStorage 写穿)。 */
function applyEntry(next: Record<string, unknown>, key: string, value: PrefValue): void {
  const m = KEY_TO_FIELD.get(key)
  if (m) {
    next[m.field] = unCoerceValue(m, value)
    return
  }
  // 非 Dexie Prefs 键 — 交给 localStorage 写穿层
  if (localStorageKeyFor(key) !== null) return
}

function unCoerceValue(m: PrefsFieldMap, v: PrefValue): unknown {
  switch (v.type) {
    case 'BOOL': return v.bool ?? false
    case 'INT':
    case 'LONG': return v.number ?? 0
    case 'FLOAT': return v.float ?? v.number ?? 0
    case 'STRING': {
      if (m.key === 'visible_days') {
        const s = (v.string ?? '').split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x))
        return s
      }
      if (m.field === 'conflictDefaultTop') {
        try { return JSON.parse(v.string ?? '{}') } catch { return {} }
      }
      return v.string ?? ''
    }
    default: return v.string ?? ''
  }
}

function writeLocalEntries(entries: Record<string, PrefValue>, _overwrite: boolean): void {
  for (const [key, value] of Object.entries(entries)) {
    const local = localStorageKeyFor(key)
    if (local === null) continue
    localStorage.setItem(local, stringifyForLocal(key, value))
  }
}

function clearHolidayTransferKeys(): void {
  if (typeof localStorage === 'undefined') return
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('sleepy_holiday_transfers_')) localStorage.removeItem(k)
  }
}

function stringifyForLocal(_key: string, v: PrefValue): string {
  switch (v.type) {
    case 'BOOL': return String(v.bool ?? false)
    case 'INT':
    case 'LONG': return String(v.number ?? 0)
    case 'FLOAT': return String(v.float ?? v.number ?? 0)
    case 'STRING_SET': return (v.stringSet ?? []).join(',')
    default: return v.string ?? ''
  }
}

/** Android 键名 → web localStorage 键名 (含 sleepy_ 前缀); 非本地键返回 null。 */
function localStorageKeyFor(key: string): string | null {
  const hit = LOCAL_KEYS.find((lk) => lk.key === key)
  if (hit) return hit.local
  if (key === 'custom_themes') return 'custom_themes'
  if (key.startsWith('holiday_transfer_')) {
    return `sleepy_holiday_transfers_${key.slice('holiday_transfer_'.length)}`
  }
  return null
}
