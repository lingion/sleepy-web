import { buildTimeJsonFromRows, effectiveCourseTime, mergeMostComplete, parseTimeSlotRows } from '../timeTable'
import type { ParsedCourse } from './sleepyNativeParser'

type ScheduleCourse = Pick<ParsedCourse, 'day' | 'startWeek' | 'endWeek' | 'type' | 'startNode' | 'step' | 'ownTime' | 'startTime' | 'endTime'> & {
  isIrregularTime?: boolean
  fixedDate?: string | null
}

/** Android CourseImportPolicy: parity-aware weeks, then real clock intervals. */
export function coursesConflict(a: ScheduleCourse, b: ScheduleCourse, timeJson = ''): boolean {
  if (a.fixedDate && b.fixedDate && a.fixedDate !== b.fixedDate) return false
  if (a.day !== b.day) return false
  const occurs = (c: ScheduleCourse, week: number) => c.type === 1 ? week % 2 === 1 : c.type === 2 ? week % 2 === 0 : true
  let sharedWeek = false
  for (let week = Math.max(a.startWeek, b.startWeek); week <= Math.min(a.endWeek, b.endWeek); week++) {
    if (occurs(a, week) && occurs(b, week)) { sharedWeek = true; break }
  }
  if (!sharedWeek) return false
  const interval = (c: ScheduleCourse) => effectiveCourseTime(c.ownTime || !!c.isIrregularTime, c.startTime, c.endTime, c.startNode, c.step, timeJson)
  const first = interval(a), second = interval(b)
  if (first && second && first[0] < first[1] && second[0] < second[1]) {
    return first[0] < second[1] && second[0] < first[1]
  }
  return a.startNode <= b.startNode + b.step - 1 && b.startNode <= a.startNode + a.step - 1
}

/** Existing nodes, including edge slots, win; a bound shared schedule is read-only. */
export function timeJsonForAppend(current: string, incoming: string, requiredNodes: number, bound: boolean): string {
  if (bound) return current
  const original = current.trim() ? parseTimeSlotRows(current) : []
  const received = incoming.trim() ? parseTimeSlotRows(incoming) : []
  const filled = parseTimeSlotRows(mergeMostComplete(incoming, current, requiredNodes))
  const rows = [...new Map([...filled, ...received, ...original].map(row => [row.node, row])).values()].sort((a, b) => a.node - b.node)
  if (JSON.stringify(rows) === JSON.stringify([...original].sort((a, b) => a.node - b.node))) return current
  return buildTimeJsonFromRows(rows)
}

export function firstMissingCourseNode(courses: ScheduleCourse[], timeJson: string): number | null {
  const nodes = new Set(parseTimeSlotRows(timeJson).filter(row => row.start && row.end).map(row => row.node))
  for (const c of courses) {
    if (c.ownTime || c.isIrregularTime) continue
    for (let node = c.startNode; node < c.startNode + c.step; node++) if (!nodes.has(node)) return node
  }
  return null
}

export function importCourseGroupKey(c: Pick<ParsedCourse, 'groupId' | 'courseName'>): string {
  return c.groupId.trim() || c.courseName.trim().replace(/\s+/g, ' ').toLowerCase()
}
