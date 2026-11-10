import { parsePeriodClock } from './periodValidation'
import { deriveRows, type SmartPeriodConfig } from './smartPeriod'
import type { TimeSlotRow } from './timeTable'

/** Android TimeSlotEditor.kt resolveAutoPeriodConfig and TimeTableUtils.kt inference. */
export function resolveAutoPeriodConfig(rows: readonly TimeSlotRow[], stored: SmartPeriodConfig | null): SmartPeriodConfig | null {
  const standard = rows.filter(row => row.edgeClass === null).sort((a, b) => a.node - b.node)
  if (!standard.length || standard.some((row, i) => row.node !== i + 1)) return null
  if (stored) {
    const derived = deriveRows(stored)
    if (derived.length === standard.length && derived.every((row, i) => row.node === standard[i].node && row.start === standard[i].start && row.end === standard[i].end)) return stored
  }
  const parsed = standard.map(row => ({ start: parsePeriodClock(row.start), end: parsePeriodClock(row.end) }))
  if (parsed.some((row, i) => row.start === null || row.end === null || row.end <= row.start || (i > 0 && row.start < parsed[i - 1].end!))) return null
  const minutes = parsed.map(row => row.end! - row.start!)
  const counts = new Map<number, number>()
  for (const duration of minutes) counts.set(duration, (counts.get(duration) ?? 0) + 1)
  // Map insertion order resolves a mode tie in favor of its first occurrence.
  const primary = [...counts].reduce((best, next) => next[1] > best[1] ? next : best)[0]
  const previousDurations = new Map(stored?.durations.map(option => [option.minutes, option]))
  const durations = [...counts.keys()].filter(value => value !== primary).map(value => previousDurations.get(value) ?? { minutes: value, isLong: value > primary })
  const durationIndex = new Map(durations.map((option, index) => [option.minutes, index]))
  const gaps = parsed.slice(1).map((row, index) => row.start! - parsed[index].end!)
  const distinctGaps = [...new Set(gaps.filter(value => value > 0))]
  const previousBreaks = new Map(stored?.breaks.map(option => [option.minutes, option]))
  const breaks = distinctGaps.map(value => previousBreaks.get(value) ?? { minutes: value, isLong: value > Math.min(...distinctGaps) })
  const breakIndex = new Map(breaks.map((option, index) => [option.minutes, index]))
  return {
    startTime: standard[0].start.trim(), periodMinutes: primary, totalPeriods: standard.length,
    durations, periodAssignments: minutes.map(value => durationIndex.get(value) ?? null),
    breaks, transitionAssignments: gaps.map(value => breakIndex.get(value) ?? null),
  }
}

/** Automatic output replaces only standard rows; manual edge rows keep their positions. */
export function mergeAutoRows(existing: readonly TimeSlotRow[], derived: readonly TimeSlotRow[]): TimeSlotRow[] {
  let index = 0
  const merged = existing.flatMap(row => {
    if (row.edgeClass !== null) return [row]
    const next = derived[index++]
    return next ? [next] : []
  })
  return [...merged, ...derived.slice(index)]
}
