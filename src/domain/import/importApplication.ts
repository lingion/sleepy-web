import { db } from '../../data/db'
import { getCourses, insertCourses, insertCoursesKeepingGroups, insertPeriodTable, insertTable, updateTable } from '../../data/repository'
import type { Course, Table } from '../../data/types'
import { useUndoStore } from '../../data/undoStore'
import { parseTimeSlotRows } from '../timeTable'
import { normalizeStartDateToMonday } from '../../views/importExportUtils'
import { suggestUniqueName } from '../../views/mine/periodTableNames'
import { coursesConflict, firstMissingCourseNode, importCourseGroupKey, timeJsonForAppend } from './courseImportPolicy'
import type { ParseResult, ParsedCourse } from './scheduleParser'
import { validFixedDate, type ParsedPeriodTable } from './sleepyNativeParser'
import { nameUUIDFromBytes } from './uuid'

export interface ImportApplication {
  result: ParseResult
  targetTableId?: number
  name?: string
  startDate?: string
  timeJson?: string
  smartConfigJson?: string
  bindPeriodTableId?: number | null
  backupOriginal?: boolean
  appendConflicts?: boolean
}

export function toImportedCourse(pc: ParsedCourse, tableId: number): Course {
  const existing = pc as ParsedCourse & Partial<Course>
  const ownTime = pc.ownTime || !!existing.isIrregularTime
  return {
    ...pc, id: 0, tableId, type: pc.type as Course['type'],
    ownTime, colorMode: existing.colorMode ?? 0, isIrregularNode: existing.isIrregularNode ?? false, isIrregularTime: ownTime,
    credit: existing.credit ?? 0, level: existing.level ?? 0,
  }
}

/** Transaction includes IDs, binding, course writes, default selection and one undo snapshot. */
export async function applyPortableImport(input: ImportApplication): Promise<number> {
  return atomicImport(async () => {
      const tables = await db.timetables.orderBy('id').toArray()
      const periods = await db.periodTables.toArray()
      const names = [...tables.map(t => t.name), ...periods.map(p => p.name)]
      const { result } = input
      const targetId = input.targetTableId ?? 0
      if (targetId) {
        const target = await db.timetables.get(targetId)
        if (!target) throw Error('目标课表已不存在，请重新选择。')
        const bound = target.periodTableId != null ? await db.periodTables.get(target.periodTableId) : undefined
        if (target.periodTableId != null && !bound) throw Error('绑定的作息表已不存在。')
        const timeJson = timeJsonForAppend(bound?.timeJson ?? target.timeJson, result.timeJson, result.nodesPerDay, !!bound)
        const existing = await getCourses(targetId)
        const accepted = result.courses.filter(c => input.appendConflicts || !existing.some(old => coursesConflict(c, old, timeJson)))
        if (!accepted.length) throw Error('没有可以追加的课程，请调整选课或冲突选项。')
        requireCourseNodes(accepted, timeJson)
        if (input.backupOriginal !== false) {
          const effective = bound ? {...target,timeJson:bound.timeJson,nodeCount:bound.nodesPerDay,smartConfigJson:bound.smartConfigJson} : target
          const metadata = {reminderOverride:null}
          const backup = await insertTable({ ...effective, ...metadata, id: 0,
            periodTableId:null, preBindSnapshotJson:'', reminderEnabled:0,
            name: suggestUniqueName(`${target.name}备份`, names, [], '课表备份'), isDefault: 0, createdAt: Date.now() })
          await insertCoursesKeepingGroups(existing.map(c => ({ ...c, id: 0, tableId: backup })))
        }
        const groups = new Map<string,string>()
        const rows = accepted.map(c => {
          const key = importCourseGroupKey(c)
          if (!groups.has(key)) groups.set(key, globalThis.crypto?.randomUUID?.() ?? nameUUIDFromBytes(`${Date.now()}:${Math.random()}:${key}`))
          return {...toImportedCourse(c,targetId),groupId:groups.get(key)!}
        })
        await insertCoursesKeepingGroups(rows)
        const maxWeek = Math.max(target.maxWeek,...accepted.map(c => c.endWeek))
        if ((!bound && timeJson !== target.timeJson) || maxWeek !== target.maxWeek) {
          const nodeCount = bound ? target.nodeCount : Math.max(target.nodeCount, ...parseTimeSlotRows(timeJson).map(r => r.node))
          await updateTable({ ...target, timeJson:bound ? target.timeJson : timeJson, nodeCount, maxWeek })
        }
        return targetId
      }
      const startDate = input.startDate ?? result.startDate
      if (!validFixedDate(startDate)) throw Error('开始日期无效，请使用 yyyy-MM-dd。')
      const bound = input.bindPeriodTableId != null ? periods.find(p => p.id === input.bindPeriodTableId) : undefined
      if (input.bindPeriodTableId != null && !bound) throw Error('所选作息表已不存在，请重新选择。')
      const timeJson = bound?.timeJson ?? input.timeJson ?? result.timeJson
      requireCourseNodes(result.courses, timeJson)
      const rows = parseTimeSlotRows(timeJson)
      if (rows.some(r => !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end) || r.start >= r.end)) throw Error('节次时间无效，请检查开始和结束时间。')
      const nodeCount = Math.max(1, ...rows.map(r => r.node))
      const name = suggestUniqueName(input.name ?? result.tableName, names, [], '导入的课表')
      const smartConfigJson = bound?.smartConfigJson ?? input.smartConfigJson ?? ''
      const periodTableId = bound?.id ?? await insertPeriodTable({
        name: suggestUniqueName(result.periodTable?.name || name, [...names, name], [], '作息表'),
        nodesPerDay: nodeCount, timeJson, smartConfigJson, createdAt: Date.now(), updatedAt: Date.now(),
      })
      const metadata = { importSourceJson: result.importSourceJson ?? '' }
      const id = await insertTable({
        ...metadata, name, startDate: normalizeStartDateToMonday(startDate), timeJson, smartConfigJson,
        isDefault: 0, periodTableId, nodeCount,
        maxWeek: Math.max(result.maxWeek || 20, ...result.courses.map(c => c.endWeek)), createdAt: Date.now(),
      })
      await saveCourses(result.courses, id, result.groupIdsAuthoritative)
      return id
  })
}

export async function applyPeriodTableImport(period: ParsedPeriodTable, name: string): Promise<number> {
  return atomicImport(async () => {
    const names = [...(await db.timetables.toArray()).map(t => t.name),...(await db.periodTables.toArray()).map(p => p.name)]
    return insertPeriodTable({name:suggestUniqueName(name,names,[],'作息表'),timeJson:period.timeJson,nodesPerDay:period.nodesPerDay,
      smartConfigJson:'',createdAt:Date.now(),updatedAt:Date.now()})
  })
}

async function atomicImport<T>(action: () => Promise<T>): Promise<T> {
  const undo = useUndoStore.getState()
  const previous = { undoStack: undo.undoStack, redoStack: undo.redoStack }
  undo.beginBatch()
  try {
    return await db.transaction('rw', db.tables, action)
  } catch (error) {
    useUndoStore.setState(previous)
    throw error
  } finally {
    await useUndoStore.getState().endBatch()
  }
}

function requireCourseNodes(courses: ParsedCourse[], timeJson: string) {
  const missing = firstMissingCourseNode(courses, timeJson)
  if (missing != null) throw Error(`第 ${missing} 节时间不能为空。`)
}

async function saveCourses(courses: ParsedCourse[], tableId: number, authoritative: boolean) {
  const rows = courses.map(c => toImportedCourse(c, tableId))
  if (authoritative) await insertCoursesKeepingGroups(rows)
  else {
    const roster = new Map<string, string>()
    for (const row of await db.courses.orderBy('id').toArray()) {
      const key = row.courseName.trim().replace(/\s+/g, ' ').toLowerCase()
      if (row.groupId && !roster.has(key)) roster.set(key, row.groupId)
    }
    await insertCourses(rows.map(c => ({ ...c, groupId: roster.get(c.courseName.trim().replace(/\s+/g, ' ').toLowerCase()) || c.groupId })))
  }
}

/** Export consumers hydrate the selected shared schedule before serializing. */
export async function effectiveImportTable(table: Table): Promise<Table> {
  const bound = table.periodTableId != null ? await db.periodTables.get(table.periodTableId) : undefined
  return bound ? { ...table, timeJson: bound.timeJson, nodeCount: bound.nodesPerDay, smartConfigJson: bound.smartConfigJson } : table
}
