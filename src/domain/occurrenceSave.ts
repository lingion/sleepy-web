import { inWeek, type Course, type Table } from '../data/types'
import type { HolidayTransferEntry } from './holiday/transfers'
import { coursesForDate, dateOfWeekIso, occurrenceAtDate, weekday, weekOfDate, withoutOccurrence } from './courseOccurrence'
import { draftConflictDetails, formatDetail } from './courseDraft'

export type OccurrenceQuestion = (title: string, message: string, choices?: string[], destructive?: boolean) => Promise<number | null>

/** Android asks only about affected dates; all other recurring weeks retain their compact rows. */
export async function resolveDraftDestinations(drafts: Course[], table: Table, transfers: HolidayTransferEntry[], ask: OccurrenceQuestion): Promise<Course[] | null> {
  const result: Course[] = []
  const dates = [...new Set(transfers.flatMap((entry) => [entry.sourceDate,entry.targetDate]))].sort()
  for (const draft of drafts) {
    if ((draft as Course & { fixedDate?: string | null }).fixedDate) { result.push(draft); continue }
    let remaining = [draft]
    for (const date of dates) {
      const week = weekOfDate(table.startDate,date)
      if (week < 1 || week > table.maxWeek || weekday(date)!==draft.day || !inWeek(draft,week)) continue
      const incoming = [...transfers].reverse().find((entry) => entry.targetDate===date)
      const outgoing = [...transfers].reverse().find((entry) => entry.sourceDate===date)
      let resolved: Course
      if (incoming) {
        const choice = await ask('选择调课日期',`${draft.courseName}\n${date} 按 ${incoming.sourceDate} 的课表上课。请选择本次课程归属。`,['跟随调休','直接安排在原课表'])
        if (choice===null) return null
        if (choice===0) resolved=occurrenceAtDate(draft,incoming.sourceDate,table)
        else {
          if (await ask('原课表会被调休覆盖',`${draft.courseName}\n${date} 的原课表被调休隐藏，直接安排的课程也会随原课表隐藏。`,['仍然安排'],true)===null) return null
          resolved=occurrenceAtDate(draft,date,table)
        }
      } else {
        if (await ask('这一天已调休',`${draft.courseName}\n${date} 的课程将显示在 ${outgoing!.targetDate}。`,['继续'])===null) return null
        resolved=occurrenceAtDate(draft,date,table)
      }
      remaining=remaining.flatMap((row) => inWeek(row,week) ? withoutOccurrence(row,date,table.startDate) : [row])
      result.push(resolved)
    }
    result.push(...remaining)
  }
  return result
}

/** Conflict preview shares the display-date projection used by the grid, Today and reminders. */
export function occurrenceConflictDetails(drafts: Course[], stored: Course[], table: Table, transfers: HolidayTransferEntry[], dayNames: string[], template: string): string[] {
  const dates=new Set(Array.from({length:table.maxWeek*7},(_,i)=>dateOfWeekIso(table.startDate,Math.floor(i/7)+1,i%7+1)))
  transfers.forEach((entry)=>dates.add(entry.targetDate))
  const details: string[]=[]
  for (const date of dates) {
    const project=(rows:Course[])=>coursesForDate(date,table.startDate,table.maxWeek,rows,transfers).map((row)=>({...row,day:weekday(date),startWeek:weekOfDate(table.startDate,date),endWeek:weekOfDate(table.startDate,date),type:0} as Course))
    const incoming=project(drafts), existing=project(stored)
    const conflicts=[...draftConflictDetails(incoming,existing,dayNames,table.timeJson),...incoming.flatMap((row,i)=>draftConflictDetails([row],incoming.slice(i+1),dayNames,table.timeJson))]
    details.push(...conflicts.map((detail)=>`${date} · ${formatDetail(detail,template)}`))
  }
  return [...new Set(details)]
}
