/**
 * 节假日数据 store — HolidayManager web 同构。
 * 网络逐日条目 (unpkg holiday-calendar CN) + 用户范围化覆盖 (KEY_HOLIDAY_OVERRIDES)。
 * 取数顺序: 内存缓存 → localStorage 磁盘缓存(拉成功一次永久) → 网络; 失败静默
 * (仅周末灰显, 与 Android 离线兜底同语义)。覆盖段落 localStorage (AppPrefs 同构)。
 */

import { create } from 'zustand'
import {
  decodeOverrides,
  encodeOverrides,
  mergeSegments,
  toSets,
  type HolidayEntry,
  type HolidayRange,
} from '../domain/holiday/ranges'
import { decodeTransfers, encodeTransfers, withTargetExclusivity, type HolidayTransferEntry } from '../domain/holiday/transfers'

const OVERRIDES_KEY = 'sleepy_holiday_overrides'
const TRANSFERS_KEY = 'sleepy_holiday_transfers'
const DISK_PREFIX = 'sleepy_holiday_cn_'
const BASE_URL = 'https://unpkg.com/holiday-calendar/data/CN/'

/** 某年网络条目拉取状态 (HolidayUiState 同构) */
export type HolidayYearStatus = 'loading' | 'loaded' | 'failed'

interface HolidayState {
  /** 各年网络条目 (loaded 后填充) */
  entries: Record<number, HolidayEntry[]>
  /** 各年拉取状态 */
  status: Record<number, HolidayYearStatus>
  /** 用户范围化覆盖段 (KEY_HOLIDAY_OVERRIDES) — 全局 (Android AppPrefs 同构) */
  overrides: HolidayRange[]
  /** 调休映射写入计数 — 映射按表存 localStorage (AppPrefs 同构), 消费方订阅此值重读 (viewModel.refreshTransfer 同位) */
  transferRevision: number
  /** AppPrefs.updateHolidayTransfer: targetDate=null 清除该放假日; 否则互斥写 (同 target/同 source 旧条目被替换) */
  updateTransfer: (tableId: number, sourceDate: string, targetDate: string | null, segmentId: string) => void
  /** 拉取某年 (force=绕过缓存, 已缓存默认跳过) */
  load: (year: number, force?: boolean) => Promise<void>
  /** 保存(新增或替换同 id)一段覆盖 */
  saveRange: (range: HolidayRange) => void
  /** 删除一段: 用户段直接移除; 网络段写 REMOVED 覆盖挂接 */
  deleteRange: (range: HolidayRange) => void
  /** 恢复默认: 移除该 id 覆盖(含 REMOVED 型), 网络段随之回来 */
  restoreRange: (range: HolidayRange) => void
}

function loadOverrides(): HolidayRange[] {
  try {
    return decodeOverrides(localStorage.getItem(OVERRIDES_KEY) ?? '[]')
  } catch {
    return []
  }
}

function persistOverrides(ranges: HolidayRange[]): void {
  try {
    localStorage.setItem(OVERRIDES_KEY, encodeOverrides(ranges))
  } catch {
    /* 配额/隐私模式失败忽略 */
  }
}

/** AppPrefs.transferKey(tableId) = "holiday_transfer_$tableId" 的 web 键 (prefsCodec 互转) */
function transferKey(tableId: number): string {
  return `${TRANSFERS_KEY}_${tableId}`
}

/** 旧版单表模式曾把映射写进无后缀键; 当时只有一张表, 由首个读取的表接管 (表键已有则以表键为准) */
function adoptLegacyTransfers(tableId: number): void {
  try {
    const legacy = localStorage.getItem(TRANSFERS_KEY)
    if (legacy === null) return
    localStorage.removeItem(TRANSFERS_KEY)
    if (localStorage.getItem(transferKey(tableId)) === null && decodeTransfers(legacy).length > 0) {
      localStorage.setItem(transferKey(tableId), legacy)
    }
  } catch {
    /* 忽略 */
  }
}

/** AppPrefs.getHolidayTransfers: 某课表的调休映射; 无表/未设置 = 空(全部按自然星期取课) */
export function getHolidayTransfers(tableId: number | null): HolidayTransferEntry[] {
  if (tableId === null) return []
  adoptLegacyTransfers(tableId)
  try {
    return decodeTransfers(localStorage.getItem(transferKey(tableId)) ?? '[]')
  } catch {
    return []
  }
}

function setHolidayTransfers(tableId: number, transfers: HolidayTransferEntry[]): void {
  try {
    localStorage.setItem(transferKey(tableId), encodeTransfers(transfers))
  } catch {
    /* 配额/隐私模式失败忽略 */
  }
}

/** AppPrefs.clearHolidayTransfers: 删表时清掉该表映射 */
export function clearHolidayTransfers(tableId: number): void {
  try {
    localStorage.removeItem(transferKey(tableId))
  } catch {
    /* 忽略 */
  }
}

function diskKey(year: number): string {
  return `${DISK_PREFIX}${year}`
}

function readDisk(year: number): HolidayEntry[] | null {
  try {
    const raw = localStorage.getItem(diskKey(year))
    if (raw === null) return null
    return parseEntries(raw)
  } catch {
    return null
  }
}

function writeDisk(year: number, entries: HolidayEntry[]): void {
  try {
    localStorage.setItem(diskKey(year), JSON.stringify({ dates: entries }))
  } catch {
    /* 忽略 */
  }
}

/** 解析 API JSON → 条目 (parseEntries; 坏数据当空数组) */
export function parseEntries(text: string): HolidayEntry[] {
  const out: HolidayEntry[] = []
  try {
    const obj = JSON.parse(text) as { dates?: { date: string; name?: string; type?: string }[] }
    for (const d of obj.dates ?? []) {
      if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
      out.push({ date: d.date, name: d.name ?? '', type: d.type ?? '' })
    }
  } catch {
    /* 坏数据当空 */
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** 模块级内存缓存 — 进程内共享, null=已确认失败 (yearFetchFailed 同构) */
const memCache = new Map<number, HolidayEntry[] | null>()

export const useHolidayStore = create<HolidayState>((set, get) => ({
  entries: {},
  status: {},
  overrides: loadOverrides(),
  transferRevision: 0,
  updateTransfer: (tableId, sourceDate, targetDate, segmentId) => {
    const existing = getHolidayTransfers(tableId)
    const next = targetDate === null
      ? existing.filter((entry) => entry.sourceDate !== sourceDate)
      : withTargetExclusivity(existing, { sourceDate, targetDate, segmentId })
    setHolidayTransfers(tableId, next)
    set((s) => ({ transferRevision: s.transferRevision + 1 }))
  },

  load: async (year, force = false) => {
    if (!force) {
      const cur = get().status[year]
      if (cur === 'loaded' || cur === 'loading') return
      const mem = memCache.get(year)
      if (mem) {
        set((s) => ({ entries: { ...s.entries, [year]: mem }, status: { ...s.status, [year]: 'loaded' } }))
        return
      }
      const disk = readDisk(year)
      if (disk) {
        memCache.set(year, disk)
        set((s) => ({ entries: { ...s.entries, [year]: disk }, status: { ...s.status, [year]: 'loaded' } }))
        return
      }
    } else {
      memCache.delete(year)
    }
    set((s) => ({ status: { ...s.status, [year]: 'loading' } }))
    try {
      const r = await fetch(`${BASE_URL}${year}.json`)
      if (!r.ok) throw new Error(String(r.status))
      const text = await r.text()
      const entries = parseEntries(text)
      memCache.set(year, entries)
      writeDisk(year, entries)
      set((s) => ({ entries: { ...s.entries, [year]: entries }, status: { ...s.status, [year]: 'loaded' } }))
    } catch {
      memCache.set(year, null)
      set((s) => ({ status: { ...s.status, [year]: 'failed' } }))
    }
  },

  saveRange: (range) => {
    const next = get().overrides.filter((r) => r.id !== range.id)
    next.push(range)
    persistOverrides(next)
    set({ overrides: next })
  },

  deleteRange: (range) => {
    const known = get().overrides.some((r) => r.id === range.id)
    const next = get().overrides.filter((r) => r.id !== range.id)
    if (!known) {
      next.push({
        id: cryptoId(),
        name: range.name,
        startDate: range.startDate,
        endDate: range.endDate,
        type: 'removed',
        sourceKey: sourceKeyOf(range.type, range.startDate),
      })
    }
    persistOverrides(next)
    set({ overrides: next })
  },

  restoreRange: (range) => {
    const next = get().overrides.filter((r) => r.id !== range.id)
    persistOverrides(next)
    set({ overrides: next })
  },
}))

/** 网络段键 (HolidaySettingsScreen.networkKeyOf) */
export function sourceKeyOf(type: string, date: string): string {
  return `${type === 'transfer_workday' ? 'workday' : 'holiday'}:${date}`
}

function cryptoId(): string {
  const b = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** 合并网络条目 + 覆盖 → 生效/已删除段 (供灰显与设置页共用) */
export function mergeHolidayYear(entries: HolidayEntry[], overrides: HolidayRange[]) {
  return mergeSegments(entries, overrides)
}

/** 生效段 → 灰显判定用日期集合 */
export function holidaySetsForYear(entries: HolidayEntry[], overrides: HolidayRange[]) {
  return toSets(mergeSegments(entries, overrides).active)
}
