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

export function decodeTransfers(raw: string): HolidayTransferEntry[] {
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return []
      const entry = item as Record<string, unknown>
      if (typeof entry.sourceDate !== 'string' || typeof entry.targetDate !== 'string' || typeof entry.segmentId !== 'string') return []
      if (!isIsoDate(entry.sourceDate) || !isIsoDate(entry.targetDate)) return []
      return [{ sourceDate: entry.sourceDate, targetDate: entry.targetDate, segmentId: entry.segmentId }]
    })
  } catch {
    return []
  }
}

function weekdayOf(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return dayOfWeek === 0 ? 7 : dayOfWeek
}
