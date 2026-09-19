/**
 * JwClassicEamsParser — 经典金智/树维 EAMS 内嵌 JS 课表。
 * Kotlin data/jw/JwClassicEamsParser.kt 1:1 移植。
 */

import { type JwCourse, type JwParser } from './jwCourse'

interface Task {
  teacher: string
  name: string
  room: string
  weeks: number[]
  blockStart: number
  nameExpr: string | null
}

export class JwClassicEamsParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const unitCount = this.unitCountFromPage()
    if (unitCount === null) return []
    const out: JwCourse[] = []

    for (const [task, pairs] of this.blocks(unitCount)) {
      if (!task.teacher || task.teacher === '-1' || task.room === '停课') continue
      const name = this.resolveCourseName(task)
      if (!name) continue
      const merged = this.mergeConsecutiveNodes(pairs)
      for (const week of task.weeks) {
        out.push({
          name, room: task.room, teacher: task.teacher,
          day: merged.day, startNode: merged.startNode, endNode: merged.endNode,
          startWeek: week, endWeek: week, type: 0,
        })
      }
    }
    return out
  }

  private unitCountFromPage(): number | null {
    const m = /\bvar\s+unitCount\s*=\s*(\d+)\s*;/.exec(this.source)
    return m ? strictInt(m[1]) : null
  }

  private blocks(unitCount: number): Array<[Task, Array<[number, number]>]> {
    const result: Array<[Task, Array<[number, number]>]> = []
    const matches = Array.from(this.source.matchAll(/new\s+TaskActivity\(/g))

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      const blockStart = match.index ?? 0
      const argStart = blockStart + match[0].length
      const [args] = splitArgs(this.source, argStart)
      if (args.length < 7) continue

      const teacherArg = args[1].trim()
      const teacher = teacherArg.startsWith('"') || teacherArg.startsWith("'")
        ? unquote(teacherArg)
        : teacherArg.includes('join(') ? this.resolveTeachersFromActTeachers(blockStart) : unquote(teacherArg)
      const nameArg = args[3].trim()
      const room = unquote(args[5]).trim()
      const weeks = bitmapToWeeks(unquote(args[6]))
      if (weeks.length === 0) continue

      const task: Task = {
        teacher: teacher.trim(),
        name: nameArg.startsWith('"') || nameArg.startsWith("'") ? unquote(nameArg) : '',
        room,
        weeks,
        blockStart,
        nameExpr: nameArg.startsWith('"') || nameArg.startsWith("'") ? null : nameArg,
      }

      const blockEnd = i + 1 < matches.length
        ? (matches[i + 1].index ?? this.source.length)
        : this.source.length
      const tail = this.source.slice(argStart, blockEnd)
      const pairs: Array<[number, number]> = []
      const indexRe = /index\s*=\s*(?:(\d+)\s*\*\s*(?:unitCount|\d+)\s*\+\s*(\d+)|(\d+))\s*;/g
      for (const indexMatch of tail.matchAll(indexRe)) {
        const d = indexMatch[1]
        const p = indexMatch[2]
        if (d && p) pairs.push([Number(d), Number(p)])
        else {
          const linear = Number(indexMatch[3])
          pairs.push([Math.floor(linear / unitCount), linear % unitCount])
        }
      }
      if (pairs.length > 0) result.push([task, pairs])
    }
    return result
  }

  private resolveTeachersFromActTeachers(blockStart: number): string {
    const start = Math.max(0, blockStart - 2500)
    const segment = this.source.slice(start, blockStart)
    const arrays = Array.from(segment.matchAll(/var\s+actTeachers\s*=\s*\[([^\]]*)\]\s*;/g))
    const body = arrays.at(-1)?.[1] ?? ''
    return Array.from(body.matchAll(/name\s*:\s*"([^"]*)"/g))
      .map((m) => m[1]).filter(Boolean).join('/')
  }

  private resolveCourseName(task: Task): string {
    if (task.name) return task.name
    const expr = task.nameExpr
    if (!expr || !expr.includes('courseNameLessonNo')) return ''
    return /var\s+courseNameLessonNo\s*=\s*"([^"]*)"\s*;/.exec(this.source)?.[1] ?? ''
  }

  private mergeConsecutiveNodes(pairs: Array<[number, number]>): { day: number, startNode: number, endNode: number } {
    const sorted = [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const day = sorted[0][0] + 1
    const nodes = Array.from(new Set(sorted.map(([, p]) => p + 1))).sort((a, b) => a - b)
    let endNode = nodes[0]
    for (const node of nodes.slice(1)) {
      if (node !== endNode + 1) break
      endNode = node
    }
    return { day, startNode: nodes[0], endNode }
  }

  confidence(): number {
    const hasTask = this.source.includes('new TaskActivity(')
    const hasTable = this.source.includes('manualArrangeCourseTable')
    const hasUnits = /\bvar\s+unitCount\s*=\s*\d+\s*;/.test(this.source)
    if (hasTable && hasTask && hasUnits) return 95
    if (hasTable && hasTask) return 90
    if (hasTask) return hasUnits ? 70 : 55
    return 0
  }

  matchedFeatures(): string[] {
    const out: string[] = []
    if (this.source.includes('manualArrangeCourseTable')) out.push('table#manualArrangeCourseTable')
    if (this.source.includes('new TaskActivity(')) out.push('new TaskActivity(...)')
    if (/\bvar\s+unitCount\s*=\s*\d+\s*;/.test(this.source)) out.push('var unitCount = N')
    if (this.source.includes('marshalTable')) out.push('table0.marshalTable')
    if (this.source.includes('courseTableForStd')) out.push('courseTableForStd')
    return out
  }
}

function splitArgs(source: string, start: number): [string[], number] {
  const args: string[] = []
  let current = ''
  let inQuote = false
  let depth = 0
  let closed = -1
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '"' && !isEscaped(source, i)) {
      inQuote = !inQuote
      current += ch
    } else if (ch === '(' && !inQuote) {
      depth++
      current += ch
    } else if (ch === ')' && !inQuote) {
      if (depth === 0) {
        closed = i
        break
      }
      depth--
      current += ch
    } else if (ch === ',' && !inQuote && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() || args.length > 0) args.push(current.trim())
  return [args, closed]
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0
  for (let i = index - 1; i >= 0 && source[i] === '\\'; i--) backslashes++
  return backslashes % 2 === 1
}

function bitmapToWeeks(bitmap: string): number[] {
  const weeks: number[] = []
  for (let i = 1; i < bitmap.length; i++) if (bitmap[i] === '1') weeks.push(i)
  return weeks
}

function unquote(arg: string): string {
  const trimmed = arg.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function strictInt(value: string): number | null {
  return /^[+-]?\d+$/.test(value) ? parseInt(value, 10) : null
}
