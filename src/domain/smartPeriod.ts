/**
 * SmartPeriodConfig / BreakOption — Android data/entity/SmartPeriodConfig.kt 1:1 移植
 *
 * 用户输入: startTime / periodMinutes / totalPeriods / breaks / transitionAssignments
 * 推导: 第 i 节开始 = startTime + i×periodMinutes + Σbreaks_before_i
 * transition i = 第 i 节与第 i+1 节之间的课间; null = 0 分钟连续
 */
import type { TimeSlotRow } from './timeTable'

export interface BreakOption {
  minutes: number
  isLong: boolean
  label?: string | null
}

export interface DurationOption {
  minutes: number
  isLong: boolean
  label?: string | null
}

export interface SmartPeriodConfig {
  startTime: string
  periodMinutes: number
  totalPeriods: number
  breaks: BreakOption[]
  /** 每个 transition 选哪个 break 索引; null = 连续. 长度 = N-1 */
  transitionAssignments: (number | null)[]
  durations: DurationOption[]
  /** 每个 period 选哪个 duration 索引; null = 使用 periodMinutes. 长度 = N */
  periodAssignments: (number | null)[]
}

export const DEFAULT_SMART_CONFIG: SmartPeriodConfig = {
  startTime: '08:00',
  periodMinutes: 45,
  totalPeriods: 12,
  breaks: [],
  transitionAssignments: [],
  durations: [],
  periodAssignments: [],
}

/** 取每个 transition 的 break 索引(带范围保护 + 默认填充), 长度 = max(0, N-1) */
export function effectiveAssignments(cfg: SmartPeriodConfig): (number | null)[] {
  const n = Math.max(0, cfg.totalPeriods - 1)
  const base = cfg.transitionAssignments.slice(0, n)
  const mapped = base.map((v) => (v != null && v >= 0 && v < cfg.breaks.length ? v : null))
  while (mapped.length < n) mapped.push(null)
  return mapped
}

/** 取每个 period 的 duration 索引; null/越界表示使用主时长。 */
export function effectivePeriodAssignments(cfg: SmartPeriodConfig): (number | null)[] {
  const n = Math.max(0, cfg.totalPeriods)
  const base = cfg.periodAssignments.slice(0, n)
  const mapped = base.map((v) => (v != null && v >= 0 && v < cfg.durations.length ? v : null))
  while (mapped.length < n) mapped.push(null)
  return mapped
}

/** 推导每个 period 的实际分钟数。 */
export function effectivePeriodMinutes(cfg: SmartPeriodConfig): number[] {
  return effectivePeriodAssignments(cfg).map((idx) =>
    idx != null && idx >= 0 && idx < cfg.durations.length ? cfg.durations[idx].minutes : cfg.periodMinutes,
  )
}

/** 删除 duration 分组后重映射 assignments，与 Android 保持一致。 */
export function remapDurationAssignmentsAfterDeletion(assignments: (number | null)[], deletedIndex: number): (number | null)[] {
  return assignments.map((value) =>
    value === deletedIndex ? null : value != null && value > deletedIndex ? value - 1 : value,
  )
}

/** 推导所有 transition 的实际分钟数; 默认(null/越界) = 0 */
export function effectiveTransitionMinutes(cfg: SmartPeriodConfig): number[] {
  const n = Math.max(0, cfg.totalPeriods - 1)
  const assigns = effectiveAssignments(cfg)
  return Array.from({ length: n }, (_, i) => {
    const idx = assigns[i]
    return idx != null && idx >= 0 && idx < cfg.breaks.length ? cfg.breaks[idx].minutes : 0
  })
}

function parseStart(startTime: string): [number, number] {
  const parts = startTime.split(':')
  return parts.length === 2 ? [parseInt(parts[0], 10), parseInt(parts[1], 10)] : [8, 0]
}

/** 推导节次(不含 transition, 仅节本身) — 与 Android derive() 一致, 不进位到次日 */
export function deriveRows(cfg: SmartPeriodConfig): TimeSlotRow[] {
  const rows: TimeSlotRow[] = []
  const transMins = effectiveTransitionMinutes(cfg)
  const periodMins = effectivePeriodMinutes(cfg)
  let [curH, curM] = parseStart(cfg.startTime)
  for (let i = 0; i < cfg.totalPeriods; i++) {
    const start = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`
    curM += periodMins[i]
    curH += Math.floor(curM / 60)
    curM %= 60
    const end = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`
    rows.push({ node: i + 1, start, end, edgeClass: null })
    if (i < transMins.length) {
      curM += transMins[i]
      curH += Math.floor(curM / 60)
      curM %= 60
    }
  }
  return rows
}

/** BreakOption.displayLabel — 自定义名优先, 否则 "大课间/小课间 X 分钟" */
export function breakDisplayLabel(br: BreakOption): string {
  if (br.label != null && br.label.trim() !== '') return br.label
  return `${br.isLong ? '大课间' : '小课间'} ${br.minutes} 分钟`
}

/** 从现有节次行推断初始配置 — EditTableScreen.kt smartConfig remember 分支 1:1 */
export function inferSmartConfig(rows: TimeSlotRow[]): SmartPeriodConfig {
  const first = rows.find((r) => r.edgeClass === null && r.start !== '')
  return {
    ...DEFAULT_SMART_CONFIG,
    totalPeriods: Math.max(1, rows.length),
    startTime: first?.start ?? '08:00',
  }
}

/** 解码 smartConfigJson; 形状不符/解析失败返回 null(调用方回退 infer) */
export function decodeSmartConfig(json: string): SmartPeriodConfig | null {
  if (!json || json.trim() === '') return null
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    if (typeof raw !== 'object' || raw === null) return null
    const startTime = typeof raw.startTime === 'string' ? raw.startTime : '08:00'
    const periodMinutes = typeof raw.periodMinutes === 'number' && raw.periodMinutes >= 1 ? Math.trunc(raw.periodMinutes) : 45
    const totalPeriods = typeof raw.totalPeriods === 'number' && raw.totalPeriods >= 1 ? Math.trunc(raw.totalPeriods) : 12
    const breaks: BreakOption[] = Array.isArray(raw.breaks)
      ? (raw.breaks as unknown[]).flatMap((b) => {
          if (typeof b !== 'object' || b === null) return []
          const o = b as Record<string, unknown>
          if (typeof o.minutes !== 'number') return []
          return [{ minutes: Math.trunc(o.minutes), isLong: o.isLong === true, label: typeof o.label === 'string' ? o.label : null }]
        })
      : []
    const transitionAssignments: (number | null)[] = Array.isArray(raw.transitionAssignments)
      ? (raw.transitionAssignments as unknown[]).map((v) => (typeof v === 'number' ? Math.trunc(v) : null))
      : []
    const durations: DurationOption[] = Array.isArray(raw.durations)
      ? (raw.durations as unknown[]).flatMap((d) => {
          if (typeof d !== 'object' || d === null) return []
          const o = d as Record<string, unknown>
          if (typeof o.minutes !== 'number') return []
          return [{ minutes: Math.trunc(o.minutes), isLong: o.isLong === true, label: typeof o.label === 'string' ? o.label : null }]
        })
      : []
    const periodAssignments: (number | null)[] = Array.isArray(raw.periodAssignments)
      ? (raw.periodAssignments as unknown[]).map((v) => (typeof v === 'number' ? Math.trunc(v) : null))
      : []
    return { startTime, periodMinutes, totalPeriods, breaks, transitionAssignments, durations, periodAssignments }
  } catch {
    return null
  }
}

export function encodeSmartConfig(cfg: SmartPeriodConfig): string {
  return JSON.stringify(cfg)
}
