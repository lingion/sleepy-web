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
