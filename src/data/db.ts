/**
 * Dexie 数据库 — Room v8 schema 1:1 对应
 * 四表: period_tables / timetables / courses / prefs
 * (store 名不能用 `tables` — Dexie 基类 tables: Table[] 为 schema 列表)
 * 所有 16 个写方法统一 captureForUndo 包裹 (与 ScheduleRepository.kt 行为 1:1)。
 *
 * v2 迁移 (issue#40 v7→v8): 新增 period_tables 表; 原 timetables 表新增 periodTableId 字段
 * (可选, 旧版本 null/undefined 视为未绑定, hydratedWith(null)=原样回退兼容列)。
 */

import Dexie, { type Table as DexieTable } from 'dexie'
import type { Course, PeriodTable, Table as TimetableEntity, Prefs } from './types'
import { DEFAULT_PREFS } from './types'

/** 偏好存取行 — 单行 key/value, key='prefs' */
interface PrefsRow {
  key: string
  value: string
}

export class SleepyDatabase extends Dexie {
  periodTables!: DexieTable<PeriodTable, number>
  timetables!: DexieTable<TimetableEntity, number>
  courses!: DexieTable<Course, number>
  prefs!: DexieTable<PrefsRow, string>

  constructor() {
    super('sleepy')
    // Room schema: courses 索引 tableId/day/(startWeek,endWeek); FK tableId CASCADE
    this.version(1).stores({
      timetables: 'id, isDefault',
      courses: 'id, tableId, day, [startWeek+endWeek], groupId',
      prefs: 'key',
    })
    // issue#40 v7→v8: 加 period_tables 表 + timetables 加 periodTableId 索引
    this.version(2).stores({
      periodTables: 'id, name, createdAt',
      timetables: 'id, isDefault, periodTableId',
      courses: 'id, tableId, day, [startWeek+endWeek], groupId',
      prefs: 'key',
    })
  }
}

export const db = new SleepyDatabase()

// ---- ID 自增 (Dexie 无 autoGenerate 时手动管理) ------------------------

/** 下一个可用课表 id — 与 Room 自增 Long 语义一致 */
export async function nextTableId(): Promise<number> {
  const all = await db.timetables.toArray()
  return all.length === 0 ? 1 : Math.max(...all.map((t) => t.id)) + 1
}

export async function nextCourseId(): Promise<number> {
  const all = await db.courses.toArray()
  return all.length === 0 ? 1 : Math.max(...all.map((c) => c.id)) + 1
}

/** 下一个可用作息表 id */
export async function nextPeriodTableId(): Promise<number> {
  const all = await db.periodTables.toArray()
  return all.length === 0 ? 1 : Math.max(...all.map((p) => p.id)) + 1
}

// ---- 偏好 -------------------------------------------------------------

export async function loadPrefs(): Promise<Prefs> {
  const row = await db.prefs.get('prefs')
  if (!row) return { ...DEFAULT_PREFS }
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(row.value) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await db.prefs.put({ key: 'prefs', value: JSON.stringify(prefs) })
}
