import type { Course, Table } from '../../data/types'
import { parseNodes } from '../timeTable'
export interface AgendaSource { table: Table; course: Course; startTime: string | null }
export interface AgendaItem { sources: AgendaSource[]; endTime: string | null }
export interface DailyAgenda { date: string; items: AgendaItem[]; sourceTables: Table[]; tableCount: number }
const validTime = (value: string | undefined): string | null => value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null

/** Android DailyAgenda.kt: only identical, complete occurrences across different tables merge. */
export function buildDailyAgenda(date: string, tables: { table: Table; courses: Course[] }[], sourceTables = tables.map(row => row.table)): DailyAgenda {
  const entries = tables.flatMap(({ table, courses }) => {
    const nodes = parseNodes(table.timeJson)
    return courses.map(course => ({ table, course, startTime: validTime(course.ownTime && course.startTime.trim() ? course.startTime : nodes.find(node => node.node === course.startNode)?.start) }))
  }).sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
  const items: AgendaItem[] = []
  const identities = new Map<string, number[]>()
  for (const entry of entries) {
    const { course, table, startTime } = entry
    const endTime = validTime(course.ownTime ? course.endTime : parseNodes(table.timeJson).find(node => node.node === course.startNode + course.step - 1)?.end)
    const identity = startTime && endTime && endTime > startTime && course.courseName.trim() && course.room.trim()
      ? JSON.stringify([date, startTime, endTime, course.courseName, course.room, course.teacher]) : null
    const index = identity ? identities.get(identity)?.find(index => items[index].sources.every(source => source.table.id !== table.id)) : undefined
    if (index === undefined) {
      if (identity) identities.set(identity, [...(identities.get(identity) ?? []), items.length])
      items.push({ sources: [entry], endTime })
    } else items[index].sources.push(entry)
  }
  return { date, items, sourceTables: [...new Map(sourceTables.map(table => [table.id, table])).values()], tableCount: new Set(items.flatMap(item => item.sources.map(source => source.table.id))).size }
}
export function notificationSourceLabels(tables: Table[], unknown: string): Record<number, string> {
  const distinct = [...new Map(tables.map(table => [table.id, table])).values()]
  if (distinct.length <= 1) return {}
  let labels = Object.fromEntries(distinct.map(table => {
    const name = table.name.trim() || unknown, points = [...name]
    return [table.id, points.length <= 16 ? name : points.slice(0, 8).join('') + '…' + points.slice(-7).join('')]
  }))
  while (new Set(Object.values(labels)).size < distinct.length) {
    const counts = Object.values(labels).reduce<Record<string, number>>((map, label) => ({ ...map, [label]: (map[label] ?? 0) + 1 }), {})
    labels = Object.fromEntries(Object.entries(labels).map(([id, label]) => [id, counts[label] > 1 ? `${label} #${id}` : label]))
  }
  return labels
}
export function agendaNotificationLine(item: AgendaItem, unknownTime: string, unknownRoom: string, labels: Record<number, string>): string {
  const first = item.sources[0], source = item.sources.map(row => labels[row.table.id]).filter(Boolean).join('／')
  return `${first.startTime ?? unknownTime} · ${first.course.courseName} · ${first.course.room.trim() || unknownRoom}${source ? `〔${source}〕` : ''}`
}
export const agendaHash = (date: string) => `#/今日/课程汇总/${date}`
export function agendaDateFromHash(hash: string): string | null {
  let decoded: string
  try { decoded = decodeURIComponent(hash) } catch { return null }
  const value = /^#\/今日\/课程汇总\/(\d{4}-\d{2}-\d{2})$/.exec(decoded)?.[1]
  if (!value) return null
  const date = new Date(value + 'T12:00:00')
  return !Number.isNaN(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value ? value : null
}
