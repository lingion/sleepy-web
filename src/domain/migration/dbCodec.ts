/**
 * database 模块 codec — MigrationDatabaseCodec.kt DTO 字段 1:1。
 * web Dexie 记录 ↔ Android DTO 行映射 (nodeCount↔nodesPerDay, isDefault 0|1↔bool)。
 */

import type { Course, ImportDraft, PeriodTable, Table } from '../../data/types'
import { DEFAULT_TABLE_COLOR } from '../../data/types'

export interface CourseRow {
  id: number
  groupId: string
  tableId: number
  courseName: string
  teacher: string
  room: string
  note: string
  alias: string
  day: number
  startNode: number
  step: number
  startWeek: number
  endWeek: number
  type: number
  color: string
  colorMode: number
  ownTime: boolean
  isIrregularNode: boolean
  isIrregularTime: boolean
  startTime: string
  endTime: string
  credit: number
  level: number
}

export interface TimeTableRow {
  id: number
  name: string
  startDate: string
  maxWeek: number
  nodesPerDay: number
  timeJson: string
  color: string
  isDefault: boolean
  smartConfigJson: string
  createdAt: number
  periodTableId: number | null
  preBindSnapshotJson: string
}

export interface PeriodTableRow {
  id: number
  name: string
  nodesPerDay: number
  timeJson: string
  smartConfigJson: string
  createdAt: number
  updatedAt: number
}

export interface ImportDraftRow {
  id: string
  sourceType: string
  sourceUrl: string
  payloadJson: string
  createdAt: number
  updatedAt: number
}

export interface DatabaseSnapshot {
  periodTables: PeriodTableRow[]
  timeTables: TimeTableRow[]
  courses: CourseRow[]
  importDrafts: ImportDraftRow[]
}

export function courseToRow(c: Course): CourseRow {
  return {
    id: c.id, groupId: c.groupId, tableId: c.tableId, courseName: c.courseName,
    teacher: c.teacher, room: c.room, note: c.note, alias: c.alias, day: c.day,
    startNode: c.startNode, step: c.step, startWeek: c.startWeek, endWeek: c.endWeek,
    type: c.type, color: c.color, colorMode: c.colorMode, ownTime: c.ownTime,
    isIrregularNode: c.isIrregularNode, isIrregularTime: c.isIrregularTime,
    startTime: c.startTime, endTime: c.endTime, credit: c.credit, level: c.level,
  }
}

export function rowToCourse(r: CourseRow): Course {
  return {
    id: r.id, groupId: r.groupId, tableId: r.tableId, courseName: r.courseName,
    teacher: r.teacher ?? '', room: r.room ?? '', note: r.note ?? '', alias: r.alias ?? '',
    day: r.day, startNode: r.startNode, step: r.step, startWeek: r.startWeek, endWeek: r.endWeek,
    type: (r.type ?? 0) as Course['type'], color: r.color, colorMode: (r.colorMode ?? 0) as Course['colorMode'], ownTime: r.ownTime ?? false,
    isIrregularNode: r.isIrregularNode ?? false, isIrregularTime: r.isIrregularTime ?? false,
    startTime: r.startTime ?? '', endTime: r.endTime ?? '', credit: r.credit ?? 0, level: r.level ?? 0,
  }
}

export function tableToRow(t: Table): TimeTableRow {
  return {
    id: t.id, name: t.name, startDate: t.startDate, maxWeek: t.maxWeek,
    nodesPerDay: t.nodeCount, timeJson: t.timeJson, color: t.color ?? DEFAULT_TABLE_COLOR,
    isDefault: t.isDefault === 1, smartConfigJson: t.smartConfigJson ?? '',
    createdAt: t.createdAt, periodTableId: t.periodTableId ?? null,
    preBindSnapshotJson: t.preBindSnapshotJson ?? '',
  }
}

export function rowToTable(r: TimeTableRow): Table {
  return {
    id: r.id, name: r.name, startDate: r.startDate, maxWeek: r.maxWeek ?? 20,
    nodeCount: r.nodesPerDay ?? 12, timeJson: r.timeJson,
    color: r.color ?? DEFAULT_TABLE_COLOR, isDefault: r.isDefault ? 1 : 0,
    smartConfigJson: r.smartConfigJson ?? '', createdAt: r.createdAt,
    periodTableId: r.periodTableId ?? null, preBindSnapshotJson: r.preBindSnapshotJson ?? '',
  }
}

export function periodToRow(p: PeriodTable): PeriodTableRow {
  return {
    id: p.id, name: p.name, nodesPerDay: p.nodesPerDay, timeJson: p.timeJson,
    smartConfigJson: p.smartConfigJson ?? '', createdAt: p.createdAt, updatedAt: p.updatedAt,
  }
}

export function rowToPeriod(r: PeriodTableRow): PeriodTable {
  return {
    id: r.id, name: r.name, nodesPerDay: r.nodesPerDay ?? 12, timeJson: r.timeJson,
    smartConfigJson: r.smartConfigJson ?? '', createdAt: r.createdAt, updatedAt: r.updatedAt,
  }
}

export function draftToRow(d: ImportDraft): ImportDraftRow {
  return {
    id: d.id, sourceType: d.sourceType ?? '', sourceUrl: d.sourceUrl ?? '',
    payloadJson: d.payloadJson, createdAt: d.createdAt, updatedAt: d.updatedAt,
  }
}

export function rowToDraft(r: ImportDraftRow): ImportDraft {
  return {
    id: r.id, sourceType: r.sourceType ?? '', sourceUrl: r.sourceUrl ?? '',
    payloadJson: r.payloadJson, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }
}

/** 快照 → JSON 文本 (encodeDefaults 语义: 全字段显式输出) */
export function encodeDatabase(s: DatabaseSnapshot): string {
  return JSON.stringify(s)
}

export function decodeDatabase(text: string): DatabaseSnapshot {
  const raw = JSON.parse(text) as Partial<DatabaseSnapshot>
  return {
    periodTables: raw.periodTables ?? [],
    timeTables: raw.timeTables ?? [],
    courses: raw.courses ?? [],
    importDrafts: raw.importDrafts ?? [],
  }
}
