/**
 * 节次校验 — TimeTableUtils.kt PeriodValidationResult 1:1 移植
 * 来源: app/src/main/java/com/lingion/sleepy/util/TimeTableUtils.kt (ref sleepy#289)
 */

export interface PeriodRowLike {
  node: number
  start: string
  end: string
}

export type PeriodValidationResult =
  | { kind: 'valid' }
  | { kind: 'empty' }
  | { kind: 'invalidFormat'; node: number; rawStart: string; rawEnd: string }
  | { kind: 'endBeforeStart'; node: number; start: string; end: string }
  | { kind: 'invalidData' }
  | { kind: 'duplicateNode'; node: number }
  | { kind: 'overlap'; prevNode: number; prevEnd: string; nextNode: number; nextStart: string }

/** minuteClock — Kotlin Regex("(?:[01]\\d|2[0-3]):[0-5]\\d").matches() 全串匹配 */
const MINUTE_CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/

/** parsePeriodClock: 合法 HH:mm → 分钟数, 否则 null */
export function parsePeriodClock(raw: string): number | null {
  const value = raw.trim()
  if (!MINUTE_CLOCK.test(value)) return null
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m)
}

/** validatePeriodRows: 身份唯一、分钟钟点合法、按节次序时间不倒挂 */
export function validatePeriodRows(rows: readonly PeriodRowLike[]): PeriodValidationResult {
  if (rows.length === 0) return { kind: 'empty' }
  const seenNodes = new Set<number>()
  const parsed: { row: PeriodRowLike; start: number; end: number }[] = []
  for (const row of rows) {
    if (seenNodes.has(row.node)) return { kind: 'duplicateNode', node: row.node }
    seenNodes.add(row.node)
    const start = parsePeriodClock(row.start)
    const end = parsePeriodClock(row.end)
    if (start === null || end === null) {
      return { kind: 'invalidFormat', node: row.node, rawStart: row.start, rawEnd: row.end }
    }
    if (end <= start) return { kind: 'endBeforeStart', node: row.node, start: row.start, end: row.end }
    parsed.push({ row, start, end })
  }
  const sorted = [...parsed].sort((a, b) => a.row.node - b.row.node)
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i]
    const next = sorted[i + 1]
    if (next.start < prev.end) {
      return {
        kind: 'overlap',
        prevNode: prev.row.node,
        prevEnd: prev.row.end,
        nextNode: next.row.node,
        nextStart: next.row.start,
      }
    }
  }
  return { kind: 'valid' }
}

/** validateTimeJson: 持久化数据校验, 不经编辑器补默认值 */
export function validateTimeJson(timeJson: string): PeriodValidationResult {
  if (!timeJson.trim()) return { kind: 'empty' }
  let array: unknown
  try {
    array = JSON.parse(timeJson)
  } catch {
    return { kind: 'invalidData' }
  }
  if (!Array.isArray(array)) return { kind: 'invalidData' }
  const rows: PeriodRowLike[] = []
  for (let index = 0; index < array.length; index++) {
    const item = array[index]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return { kind: 'invalidData' }
    const obj = item as Record<string, unknown>
    let node: number
    if (!('node' in obj)) {
      node = index + 1
    } else {
      // Kotlin: opt("node")?.toString()?.toIntOrNull() — 仅整数字符串可解析
      const raw = obj.node === null || obj.node === undefined ? null : String(obj.node)
      node = raw !== null && /^-?\d+$/.test(raw) ? Number(raw) : NaN
      if (!Number.isSafeInteger(node)) return { kind: 'invalidData' }
    }
    if (typeof obj.start !== 'string' || typeof obj.end !== 'string') return { kind: 'invalidData' }
    rows.push({ node, start: obj.start, end: obj.end })
  }
  return validatePeriodRows(rows)
}

export function isPeriodTableValid(timeJson: string): boolean {
  return validateTimeJson(timeJson).kind === 'valid'
}

/** findConflictForSlot: 单行实时冲突检测 (其余行空白豁免), 无冲突返回 null */
export function findConflictForSlot(
  rows: readonly PeriodRowLike[],
  targetNode: number
): PeriodValidationResult | null {
  const target = rows.find((r) => r.node === targetNode)
  if (!target) return null
  if (!target.start.trim() && !target.end.trim()) return null
  if (rows.filter((r) => r.node === targetNode).length > 1) {
    return { kind: 'duplicateNode', node: targetNode }
  }
  const start = parsePeriodClock(target.start)
  const end = parsePeriodClock(target.end)
  if (start === null || end === null) {
    return { kind: 'invalidFormat', node: target.node, rawStart: target.start, rawEnd: target.end }
  }
  if (end <= start) {
    return { kind: 'endBeforeStart', node: target.node, start: target.start, end: target.end }
  }
  const others = rows.filter(
    (r) => r.node !== targetNode && r.start.trim() !== '' && r.end.trim() !== ''
  )
  const prev = others
    .filter((r) => r.node < targetNode)
    .reduce<PeriodRowLike | null>((a, r) => (!a || r.node > a.node ? r : a), null)
  if (prev) {
    const pEnd = parsePeriodClock(prev.end)
    if (pEnd !== null && start < pEnd) {
      return {
        kind: 'overlap',
        prevNode: prev.node,
        prevEnd: prev.end,
        nextNode: target.node,
        nextStart: target.start,
      }
    }
  }
  const next = others
    .filter((r) => r.node > targetNode)
    .reduce<PeriodRowLike | null>((a, r) => (!a || r.node < a.node ? r : a), null)
  if (next) {
    const nStart = parsePeriodClock(next.start)
    if (nStart !== null && nStart < end) {
      return {
        kind: 'overlap',
        prevNode: target.node,
        prevEnd: target.end,
        nextNode: next.node,
        nextStart: next.start,
      }
    }
  }
  return null
}

/** i18n 文案: 返回 key + 插值参数, 由调用方 t(key, params) 渲染 */
export function periodValidationMessage(
  result: PeriodValidationResult,
  t: (key: string, opts?: Record<string, string | number>) => string
): string {
  switch (result.kind) {
    case 'valid':
      return ''
    case 'empty':
      return t('period_validation_empty')
    case 'invalidFormat':
      return t('period_validation_invalid_format', { node: result.node })
    case 'endBeforeStart':
      return t('period_validation_end_before_start', { node: result.node, start: result.start, end: result.end })
    case 'invalidData':
      return t('period_validation_invalid_data')
    case 'duplicateNode':
      return t('period_validation_duplicate_node', { node: result.node })
    case 'overlap':
      return t('period_validation_overlap', {
        prevNode: result.prevNode,
        prevEnd: result.prevEnd,
        nextNode: result.nextNode,
        nextStart: result.nextStart,
      })
  }
}
