import { isIsoDate } from './ranges'

export interface HolidayTransferEntry {
  sourceDate: string
  targetDate: string
  segmentId: string
}

export function transferFor(date: string, transfers: HolidayTransferEntry[]): HolidayTransferEntry | undefined {
  return [...transfers].reverse().find((entry) => entry.sourceDate === date)
}

/** Android parity: a mapped source date reads courses from the target date's weekday. */
export function effectiveDayOfWeek(date: string, transfers: HolidayTransferEntry[]): number {
  const hit = transferFor(date, transfers)
  if (!hit) return weekdayOf(date)
  return weekdayOf(hit.targetDate)
}

/**
 * 渲染期 daySwap 应用层 (HolidayTransferOps.applyDaySwap, da553ed6 1:1, ref #145):
 * 修复前只搬不删 —— 补班日那列原课未屏蔽, 与调过去的课叠加显示。
 *
 * daySwap 形如 {sourceDow → targetDow}:
 * - sourceDow 的课改写到 targetDow (单趟 copy, 与安卓同语义)
 * - targetDow 上原本属于它的课 (day ∈ values 且 day ∉ keys) 被屏蔽。
 *   day 同时在 keys = 它自己也要调走 → 不屏蔽, 让位给改写链。
 *
 * daySwap 为空 → 原样返回 (零成本快路径, 调用侧无须分支)。
 * 泛型只要求 { day } — Course/测试桩都可直接过。
 */
export function applyDaySwap<T extends { day: number }>(
  courses: T[],
  daySwap: Map<number, number>,
): T[] {
  if (daySwap.size === 0) return courses
  const targetDays = new Set(daySwap.values())
  const sourceDays = new Set(daySwap.keys())
  return courses
    .filter((c) => !(targetDays.has(c.day) && !sourceDays.has(c.day)))
    .map((c) => {
      const mapped = daySwap.get(c.day)
      return mapped == null || mapped === c.day ? c : { ...c, day: mapped }
    })
}

export function withTargetExclusivity(
  existing: HolidayTransferEntry[],
  next: HolidayTransferEntry,
): HolidayTransferEntry[] {
  return [...existing.filter((entry) => entry.targetDate !== next.targetDate && entry.sourceDate !== next.sourceDate), next]
    .sort((a, b) => a.sourceDate.localeCompare(b.sourceDate))
}

export function encodeTransfers(transfers: HolidayTransferEntry[]): string {
  return JSON.stringify(transfers)
}

/** HolidayTransferOps.decodeTransfers: 坏行跳过; 同 sourceDate 只留最后一条; 按 sourceDate 升序 */
export function decodeTransfers(raw: string): HolidayTransferEntry[] {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const bySource = new Map<string, HolidayTransferEntry>()
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const sourceDate = typeof entry.sourceDate === 'string' ? entry.sourceDate : ''
    const targetDate = typeof entry.targetDate === 'string' ? entry.targetDate : ''
    if (!isIsoDate(sourceDate) || !isIsoDate(targetDate)) continue
    const segmentId = typeof entry.segmentId === 'string' ? entry.segmentId : ''
    bySource.set(sourceDate, { sourceDate, targetDate, segmentId })
  }
  return [...bySource.values()].sort((a, b) => a.sourceDate.localeCompare(b.sourceDate))
}

function weekdayOf(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return dayOfWeek === 0 ? 7 : dayOfWeek
}
