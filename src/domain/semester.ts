/**
 * 学期/周次纯函数 — DateUtils.kt currentWeek/semesterStatus + TodayView mondayOfStart 同源提取。
 * TodayView 与提醒引擎共用单一实现, 视图侧 re-export 保持既有 import 路径不变。
 */

export type SemesterStatus = 'BEFORE_START' | 'IN_RANGE' | 'AFTER_END'

/** 学期起始日回退到所在周的周一 — TodayView.mondayOfStart 1:1 */
export function mondayOfStart(startDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!m) return null
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const dow = start.getDay() === 0 ? 7 : start.getDay()
  start.setDate(start.getDate() - (dow - 1))
  return start
}

/** 学期三态 — Android DateUtils.semesterStatus 同; 坏日期一律 IN_RANGE (宽容放行) */
export function semesterStatus(startDate: string, maxWeek: number, today: Date): SemesterStatus {
  if (!startDate) return 'IN_RANGE'
  const start = mondayOfStart(startDate)
  if (!start) return 'IN_RANGE'
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
  if (diffDays < 0) return 'BEFORE_START'
  if (diffDays >= maxWeek * 7) return 'AFTER_END'
  return 'IN_RANGE'
}

/** 今天是第几周 (1-based, 下限 1) — Android DateUtils.currentWeek 同 */
export function currentWeek(startDate: string, day: Date): number {
  const start = mondayOfStart(startDate)
  if (!start) return 1
  const diffDays = Math.floor((day.getTime() - start.getTime()) / 86400000)
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}
