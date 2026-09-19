/**
 * JwEams5Parser — 金智 EAMS5 (合肥工业大学/安徽大学) 课表 JSON。
 * Kotlin data/jw/JwEams5Parser.kt 1:1 移植。
 *
 * 支持 AHU print-data studentTableVms.activities、AHU data.lessons
 * 以及 HFUT result.lessonList + result.scheduleList 三种形态。
 */

import { type JwCourse, type JwParser } from './jwCourse'
import { jwAdjustedRange } from './jwParity'

type JsonObject = Record<string, unknown>

export class JwEams5Parser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    let root: JsonObject
    try {
      const parsed: unknown = JSON.parse(this.source)
      if (!isObject(parsed)) return []
      root = parsed
    } catch {
      return []
    }

    const firstTable = Array.isArray(root.studentTableVms) && root.studentTableVms.length > 0
      ? asObject(root.studentTableVms[0])
      : null
    const activities = firstTable && Array.isArray(firstTable.activities) ? firstTable.activities : null
    if (activities && activities.length > 0) return this.parseAhuPrintData(activities)

    const data = asObject(root.data)
    const lessons = data && Array.isArray(data.lessons) ? data.lessons : null
    if (lessons && lessons.length > 0) return this.parseAhuLessons(lessons)

    const result = asObject(root.result)
    if (!result || !Array.isArray(result.scheduleList)) return []

    const unitByStart = new Map<number, number>()
    const unitEnds: Array<[number, number]> = []
    if (Array.isArray(root.courseUnitList)) {
      for (const raw of root.courseUnitList) {
        const unit = asObject(raw)
        if (!unit) continue
        const indexNo = intValue(unit.indexNo)
        const startTime = intValue(unit.startTime)
        const endTime = intValue(unit.endTime)
        if (indexNo === null || startTime === null || endTime === null) continue
        unitByStart.set(startTime, indexNo)
        unitEnds.push([endTime, indexNo])
      }
      unitEnds.sort((a, b) => a[0] - b[0])
    }

    const nameMap = new Map<string, string>()
    if (Array.isArray(result.lessonList)) {
      for (const raw of result.lessonList) {
        const lesson = asObject(raw)
        if (!lesson) continue
        const id = stringValue(lesson.id)
        const name = stringValue(lesson.courseName)
        if (id && name) nameMap.set(id, name)
      }
    }

    const out: JwCourse[] = []
    for (const raw of result.scheduleList) {
      const row = asObject(raw)
      if (!row) continue
      const lessonId = intValue(row.lessonId)
      const day = intValue(row.weekday)
      const week = intValue(row.weekIndex)
      if (lessonId === null || day === null || week === null) continue

      const startTime = intValue(row.startTime) ?? 0
      const endTime = intValue(row.endTime) ?? 0
      const periods = intValue(row.periods) ?? 1
      const startUnit = unitByStart.get(startTime)
      const endUnit = startUnit === undefined
        ? undefined
        : lastUnitAtOrBefore(unitEnds, endTime)
      const inferred = startUnit !== undefined && endUnit !== undefined && endUnit >= startUnit
        ? [startUnit, endUnit] as [number, number]
        : this.inferNodes(startTime, endTime, periods)
      if (!inferred) continue

      out.push({
        name: (nameMap.get(String(lessonId)) ?? String(lessonId)).trim(),
        room: objectString(asObject(row.room), 'nameZh').trim(),
        teacher: stringValue(row.personName).trim(),
        day: clamp(day, 1, 7),
        startNode: Math.max(1, inferred[0]),
        endNode: Math.max(inferred[0], inferred[1]),
        startWeek: week,
        endWeek: week,
        type: 0,
      })
    }
    return out
  }

  /** AHU print-data: activities[].weekIndexes 完整展开为多个课块。 */
  private parseAhuPrintData(activities: unknown[]): JwCourse[] {
    const out: JwCourse[] = []
    for (const raw of activities) {
      const activity = asObject(raw)
      if (!activity) continue
      const name = stringValue(activity.courseName)
      if (!name) continue

      const teacher = teacherValue(activity)
      const room = [activity.campus, activity.building, activity.room]
        .map(stringValue)
        .map((x) => x.trim())
        .filter(Boolean)
        .join(' ')
      const day = intValue(activity.weekday)
      const startNode = intValue(activity.startUnit)
      const endNode = intValue(activity.endUnit)
      if (day === null || startNode === null || endNode === null) continue

      for (const [startWeek, endWeek, type] of this.parseWeekRanges(stringValue(activity.weekIndexes))) {
        out.push({
          name: name.trim(), room, teacher,
          day: clamp(day, 1, 7),
          startNode: Math.max(1, startNode),
          endNode: Math.max(startNode, endNode),
          startWeek, endWeek, type,
        })
      }
    }
    return out
  }

  /** AHU metadata shape; kept for compatibility with captured get-data responses. */
  private parseAhuLessons(lessons: unknown[]): JwCourse[] {
    const out: JwCourse[] = []
    for (const raw of lessons) {
      const lesson = asObject(raw)
      if (!lesson) continue
      const lessonId = stringValue(lesson.lessonId) || stringValue(lesson.id)
      if (!lessonId) continue
      const day = intValue(lesson.weekday)
      const week = intValue(lesson.weekIndex)
      if (day === null || week === null) continue
      const inferred = this.inferNodes(
        intValue(lesson.startTime) ?? 0,
        intValue(lesson.endTime) ?? 0,
        intValue(lesson.periods) ?? 1,
      )
      if (!inferred) continue
      out.push({
        name: stringValue(lesson.courseName).trim() || lessonId,
        room: stringValue(lesson.room).trim(),
        teacher: (stringValue(lesson.teacher) || stringValue(lesson.personName)).trim(),
        day: clamp(day, 1, 7),
        startNode: Math.max(1, inferred[0]),
        endNode: Math.max(inferred[0], inferred[1]),
        startWeek: week, endWeek: week, type: 0,
      })
    }
    return out
  }

  /** AHU weekIndexes: comma-separated ranges, parity suffixes, and single weeks. */
  parseWeekRanges(weekIndexes: string): Array<[number, number, number]> {
    if (!weekIndexes.trim()) return [[1, 1, 0]]
    const clean = weekIndexes
      .replaceAll('周', '')
      .replaceAll('（', '(')
      .replaceAll('）', ')')
    const segments = clean.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
    if (segments.length === 0) return [[1, 1, 0]]

    const out: Array<[number, number, number]> = []
    for (const segment of segments) {
      const parity = segment.includes('单') || /\bodd\b/i.test(segment)
        ? 1
        : segment.includes('双') || /\beven\b/i.test(segment) ? 2 : 0
      const bare = segment
        .replaceAll('(单)', '').replaceAll('(双)', '')
        .replaceAll('(单', '').replaceAll('(双', '')
        .replaceAll('单', '').replaceAll('双', '')
        .replace(/odd/ig, '').replace(/even/ig, '').trim()
      if (!bare) continue
      if (bare.includes('-')) {
        const [aRaw, bRaw] = bare.split('-', 2).map((x) => x.trim())
        const a = strictInt(aRaw)
        if (a === null) continue
        const b = strictInt(bRaw) ?? a
        const [start, end] = jwAdjustedRange(a, b, parity)
        out.push([start, end, parity])
      } else {
        const value = strictInt(bare)
        if (value === null) continue
        const [start, end] = jwAdjustedRange(value, value, parity)
        out.push([start, end, parity])
      }
    }
    return out.length > 0 ? out : [[1, 1, 0]]
  }

  /** HHmm → section nodes, with periods fallback for unmappable times. */
  inferNodes(startTime: number, endTime: number, periods: number): [number, number] | null {
    const startSection = sectionIndex(startTime)
    if (startSection === null) {
      if (periods <= 0) return null
      return [1, Math.max(1, periods)]
    }
    const startNode = startSection * 2 + 1
    const endSection = sectionIndex(endTime)
    const endNode = endSection === null
      ? Math.max(startNode, startNode + periods - 1)
      : endSection === startSection
        ? startNode + 1
        : endSection > startSection ? endSection * 2 : startNode
    return [startNode, Math.max(startNode, endNode)]
  }

  confidence(): number {
    if (this.source.includes('studentTableVms') && this.source.includes('activities')) return 100
    if (this.source.includes('data') && this.source.includes('"lessons"')) return 85
    if (this.source.includes('scheduleList') && this.source.includes('lessonList')) return 95
    if (this.source.includes('schedule-table/datum')) return 80
    return 0
  }

  matchedFeatures(): string[] {
    const hits: string[] = []
    if (this.source.includes('studentTableVms')) hits.push('studentTableVms[0].activities (AHU print-data)')
    if (this.source.includes('data') && this.source.includes('"lessons"')) hits.push('data.lessons (AHU get-data metadata)')
    if (this.source.includes('scheduleList')) hits.push('result.scheduleList')
    if (this.source.includes('lessonList')) hits.push('result.lessonList')
    if (this.source.includes('schedule-table/datum')) hits.push('ws/schedule-table/datum')
    return hits
  }
}

function sectionIndex(time: number): number | null {
  const hour = Math.floor(time / 100)
  const minute = time % 100
  const mins = hour * 60 + minute
  const slots: Array<[number, number]> = [
    [8 * 60, 0], [10 * 60 + 10, 1], [14 * 60, 2],
    [16 * 60 + 10, 3], [19 * 60, 4],
  ]
  for (const [slot, section] of slots) if (Math.abs(mins - slot) <= 10) return section
  return null
}

function teacherValue(activity: JsonObject): string {
  for (const key of ['teacherNames', 'teachers', 'teacherList']) {
    const value = activity[key]
    if (Array.isArray(value)) {
      const names = value.map(stringValue).map((x) => x.trim()).filter(Boolean)
      if (names.length > 0) return names.join('/')
    }
  }
  return (stringValue(activity.teacher) || stringValue(activity.personName)).trim()
}

function lastUnitAtOrBefore(units: Array<[number, number]>, endTime: number): number | undefined {
  let result: number | undefined
  for (const [unitEnd, indexNo] of units) if (unitEnd <= endTime) result = indexNo
  return result
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asObject(value: unknown): JsonObject | null {
  return isObject(value) ? value : null
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null || typeof value === 'object') return ''
  return String(value)
}

function objectString(value: JsonObject | null, key: string): string {
  return value ? stringValue(value[key]) : ''
}

function intValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string') return strictInt(value.trim())
  return null
}

function strictInt(value: string): number | null {
  return /^[+-]?\d+$/.test(value) ? parseInt(value, 10) : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
