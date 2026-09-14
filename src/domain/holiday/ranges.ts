/**
 * HolidayRangeOps — Android util/HolidayRange.kt 1:1 移植 (纯函数, 单测覆盖)。
 * 网络逐日条目 → 连续段聚合 + 用户覆盖段合并 + 灰显判定 (HolidayManager.decideGrey 同构)。
 * 日期一律 ISO "yyyy-MM-dd" 字符串 (字典序=时间序, 与 Android LocalDate 比较同语义)。
 */

export const TYPE_PUBLIC_HOLIDAY = 'public_holiday'
export const TYPE_TRANSFER_WORKDAY = 'transfer_workday'
/** 用户删除段的哨兵类型: 该段整体抹掉 (HolidayRangeOps.REMOVED) */
export const REMOVED = 'removed'

/** 网络逐日条目 (HolidayEntry) */
export interface HolidayEntry {
  date: string
  name: string
  type: string
}

/** 用户可编辑的节假日段(连续日期范围) (HolidayRange) */
export interface HolidayRange {
  id: string
  name: string
  startDate: string
  endDate: string
  type: string
  /** 被本段替换/删除的网络段首日标识 "holiday:<date>"/"workday:<date>"; null=纯新增 */
  sourceKey: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** ISO 日期合法性 (含真实日历校验, LocalDate.parse 同语义) */
export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** ISO 日期 ± n 天 */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

/** 是否周末 (HolidayManager.isWeekend) */
export function isWeekendIso(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return dow === 6 || dow === 0
}

/** 4 字节随机 hex id (SecureRandom 4 bytes 同构) */
export function newId(): string {
  const b = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** 网络段键: "holiday:<start>"/"workday:<start>" (sourceKeyOf) */
export function sourceKeyOf(type: string, date: string): string {
  return `${type === TYPE_TRANSFER_WORKDAY ? 'workday' : 'holiday'}:${date}`
}

/**
 * 网络逐日条目 → 连续段 (aggregateSegments)。
 * 按「name+type 相同 + 日期连续」聚合; 输入乱序没关系(先排序); 返回按 startDate 排序。
 */
export function aggregateSegments(entries: HolidayEntry[]): HolidayRange[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const result: HolidayRange[] = []
  for (const e of sorted) {
    const last = result[result.length - 1]
    if (last && last.name === e.name && last.type === e.type && addDaysIso(last.endDate, 1) === e.date) {
      result[result.length - 1] = { ...last, endDate: e.date }
    } else {
      result.push({ id: newId(), name: e.name, startDate: e.date, endDate: e.date, type: e.type, sourceKey: null })
    }
  }
  return result
}

/** 合并结果: active=生效段, removed=被用户删除的网络段(展示在"已删除"区块) */
export interface MergeResult {
  active: HolidayRange[]
  removed: HolidayRange[]
}

/**
 * 网络条目 + 用户覆盖段 → 合并 (mergeSegments)。按 overrides 顺序应用:
 * sourceKey 命中网络段(sourceKey==null 的段)→ 整段抹除; 同 sourceKey 的先前用户段被后者替换。
 * removed 型只在其 sourceKey 确实对应网络段时进入 removed 列表。
 */
export function mergeSegments(network: HolidayEntry[], overrides: HolidayRange[]): MergeResult {
  const active = aggregateSegments(network)
  const removed: HolidayRange[] = []
  const networkKeys = new Set(active.map((it) => sourceKeyOf(it.type, it.startDate)))

  for (const ov of overrides) {
    const sk = ov.sourceKey
    if (sk !== null) {
      for (let i = active.length - 1; i >= 0; i--) {
        const it = active[i]
        if ((it.sourceKey === null && sourceKeyOf(it.type, it.startDate) === sk) || (it.sourceKey === sk && it.id !== ov.id)) {
          active.splice(i, 1)
        }
      }
    }
    if (ov.type === REMOVED) {
      if (sk !== null && networkKeys.has(sk)) removed.push(ov)
    } else {
      active.push(ov)
    }
  }
  active.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
  return { active, removed }
}

/** 生效段 → (holidays, workdays) ISO 日期集合, 供灰显判定 (toSets) */
export function toSets(active: HolidayRange[]): { holidays: Set<string>; workdays: Set<string> } {
  const holidays = new Set<string>()
  const workdays = new Set<string>()
  for (const seg of active) {
    let d = seg.startDate
    while (d <= seg.endDate) {
      if (seg.type === TYPE_TRANSFER_WORKDAY) workdays.add(d)
      else holidays.add(d)
      d = addDaysIso(d, 1)
    }
  }
  return { holidays, workdays }
}

/** 灰显判定纯函数 (HolidayManager.decideGrey 1:1) */
export function decideGrey(
  date: string,
  holidays: Set<string>,
  workdays: Set<string>,
  greyHoliday: boolean,
  greyWeekend: boolean,
  ignoreWorkday: boolean
): boolean {
  // 法定节假日(独立开关)
  if (greyHoliday && holidays.has(date)) return true
  // 周末; 补班日(transfer_workday)是"周末但要上课"的日子, 开关开时豁免
  if (greyWeekend && isWeekendIso(date)) {
    if (ignoreWorkday && workdays.has(date)) return false
    return true
  }
  return false
}

/** 用户段列表 → JSON 数组 (encodeOverrides) */
export function encodeOverrides(overrides: HolidayRange[]): string {
  return JSON.stringify(
    overrides.map((ov) => ({
      id: ov.id,
      name: ov.name,
      start: ov.startDate,
      end: ov.endDate,
      type: ov.type,
      sourceKey: ov.sourceKey ?? null,
    }))
  )
}

/** JSON → 用户段列表 (decodeOverrides; 坏行跳过, start>end 跳过, 类型不认跳过, 解析失败返回空) */
export function decodeOverrides(json: string): HolidayRange[] {
  const result: HolidayRange[] = []
  let arr: unknown
  try {
    arr = JSON.parse(json)
  } catch {
    return result
  }
  if (!Array.isArray(arr)) return result
  for (const item of arr) {
    if (item === null || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const name = typeof o.name === 'string' ? o.name : ''
    const start = typeof o.start === 'string' && isIsoDate(o.start) ? o.start : null
    const end = typeof o.end === 'string' && isIsoDate(o.end) ? o.end : null
    const type = typeof o.type === 'string' ? o.type : ''
    if (!id) continue
    if (type !== TYPE_PUBLIC_HOLIDAY && type !== TYPE_TRANSFER_WORKDAY && type !== REMOVED) continue
    if (start === null || end === null || end < start) continue
    const sk = typeof o.sourceKey === 'string' && o.sourceKey !== '' ? o.sourceKey : null
    result.push({ id, name, startDate: start, endDate: end, type, sourceKey: sk })
  }
  return result
}
