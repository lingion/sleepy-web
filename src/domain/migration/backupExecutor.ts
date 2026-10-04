/**
 * 全量备份编排层 — MigrationExecutor.kt 的 web 对位。
 * 把 ZIP 协议 (zipCodec) 与 database/prefs codec 接起来:
 *  - 导出: 收集选中模块 → 组装 manifest+modules → writeZip → Uint8Array
 *  - 导入: 先完整读包校验 (坏包在写任何本机数据前被拒) → 逐模块落库
 * web 仅落地 DATABASE + PREFERENCES; WIDGETS/PERSISTED_STATE/CREDENTIALS 无对应物 → unknown。
 */

import {
  FILE_EXTENSION,
  type MigrationModule,
  assemblePackage,
  moduleEntryName,
  resolveModuleDeps,
} from './backupFormat'
import { writeZip, readZipEntries } from './zipCodec'
import {
  type DatabaseSnapshot,
  courseToRow, rowToCourse,
  tableToRow, rowToTable,
  periodToRow, rowToPeriod,
  draftToRow, rowToDraft,
  encodeDatabase, decodeDatabase,
} from './dbCodec'
import {
  collectPrefsFiles,
  applyPrefsFiles,
  encodePrefs,
  decodePrefs,
  type PrefsSnapshot,
} from './prefsCodec'
import { db } from '../../data/db'

/** web 可导出的模块 (widgets/persisted_state/credentials 无对应, 不进包) */
export const EXPORTABLE_MODULES: MigrationModule[] = ['database', 'preferences']

export type ImportMode = 'OVERWRITE' | 'MERGE'

export interface ExportResult {
  bytes: Uint8Array
  modules: MigrationModule[]
}

export interface ImportReport {
  mode: ImportMode
  appliedModules: MigrationModule[]
  unknownModules: string[]
  counts: {
    periodTables: number
    timeTables: number
    courses: number
    importDrafts: number
    prefFiles: number
    prefKeys: number
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function backupFileName(): string {
  return `sleepy-backup-${stamp()}.${FILE_EXTENSION}`
}

async function readDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const periodTables = (await db.periodTables.toArray()).map(periodToRow)
  const timeTables = (await db.timetables.toArray()).map(tableToRow)
  const courses = (await db.courses.toArray()).map(courseToRow)
  const importDrafts = (await db.importDrafts.toArray()).map(draftToRow)
  return { periodTables, timeTables, courses, importDrafts }
}

export async function exportBackup(
  selected: MigrationModule[],
  createdAt: number = Date.now(),
): Promise<ExportResult> {
  const modules = resolveModuleDeps(
    selected.filter((m) => EXPORTABLE_MODULES.includes(m)),
  )
  const payloads: Array<[string, string]> = []
  const applied: MigrationModule[] = []
  for (const m of modules.sort((a, b) => moduleRank(a) - moduleRank(b))) {
    if (m === 'database') {
      payloads.push([moduleEntryName(m), encodeDatabase(await readDatabaseSnapshot())])
      applied.push(m)
    } else if (m === 'preferences') {
      const snap: PrefsSnapshot = await collectPrefsFiles()
      if (Object.keys(snap.files).length > 0) {
        payloads.push([moduleEntryName(m), encodePrefs(snap)])
        applied.push(m)
      }
      // 空 prefs 文件不进包 (与 Android "空文件不进包" 同语义)
    }
  }
  const manifest = JSON.stringify({
    format: 'sleepy-migration',
    version: 1,
    createdAt,
    modules: applied,
  })
  const bytes = writeZip([['manifest.json', manifest], ...payloads])
  return { bytes, modules: applied }
}

// ---- 导入 -----------------------------------------------------------------

export async function importBackup(bytes: Uint8Array, mode: ImportMode): Promise<ImportReport> {
  // 先完整校验: 坏包在写任何本机数据前失败
  const content = assemblePackage(readZipEntries(bytes))
  const counts = { periodTables: 0, timeTables: 0, courses: 0, importDrafts: 0, prefFiles: 0, prefKeys: 0 }
  const applied: MigrationModule[] = []

  for (const [module, payload] of Object.entries(content.modules)
    .sort((a, b) => moduleRank(a[0] as MigrationModule) - moduleRank(b[0] as MigrationModule))) {
    if (module === 'database') {
      const snapshot = decodeDatabase(payload)
      if (mode === 'OVERWRITE') await applyDatabaseOverwrite(snapshot)
      else await applyDatabaseMerge(snapshot)
      counts.periodTables = snapshot.periodTables.length
      counts.timeTables = snapshot.timeTables.length
      counts.courses = snapshot.courses.length
      counts.importDrafts = snapshot.importDrafts.length
      applied.push(module)
    } else if (module === 'preferences') {
      const snapshot = decodePrefs(payload)
      await applyPrefsFiles(snapshot, mode === 'OVERWRITE')
      counts.prefFiles += Object.keys(snapshot.files).length
      counts.prefKeys += Object.values(snapshot.files).reduce((s, f) => s + Object.keys(f.entries).length, 0)
      applied.push(module)
    }
    // widgets/persisted_state/credentials 在 web 无目标 → 归 unknown
  }
  return { mode, appliedModules: applied, unknownModules: content.unknownModules, counts }
}

function moduleRank(m: MigrationModule): number {
  return (['database', 'preferences', 'widgets', 'persisted_state', 'credentials'] as const).indexOf(m)
}

async function applyDatabaseOverwrite(snapshot: DatabaseSnapshot): Promise<void> {
  await db.transaction('rw', db.periodTables, db.timetables, db.courses, db.importDrafts, async () => {
    await db.importDrafts.clear()
    await db.courses.clear()
    await db.timetables.clear()
    await db.periodTables.clear()
    for (const r of snapshot.periodTables) await db.periodTables.put(rowToPeriod(r))
    for (const r of snapshot.timeTables) await db.timetables.put(rowToTable(r))
    for (const r of snapshot.courses) await db.courses.put(rowToCourse(r))
    for (const r of snapshot.importDrafts) await db.importDrafts.put(rowToDraft(r))
  })
}

/**
 * 合并(Android applyMerge 1:1): 保留本机, 班内行一律新自增 ID 落库并重映射 FK
 * (即使与本机同 ID 也不去重 — 班内行视为"另一设备的数据");
 * 草稿主键是业务字符串 ID, 同 ID 视为同一草稿 → upsert。
 */
async function applyDatabaseMerge(snapshot: DatabaseSnapshot): Promise<void> {
  await db.transaction('rw', db.periodTables, db.timetables, db.courses, db.importDrafts, async () => {
    const periodMap = new Map<number, number>()
    for (const r of snapshot.periodTables) {
      const newId = nextIdFrom(await db.periodTables.toArray())
      await db.periodTables.add({ ...rowToPeriod(r), id: newId })
      periodMap.set(r.id, newId)
    }
    const tableMap = new Map<number, number>()
    for (const r of snapshot.timeTables) {
      const newId = nextIdFrom(await db.timetables.toArray())
      await db.timetables.add({
        ...rowToTable(r),
        id: newId,
        periodTableId: r.periodTableId != null ? periodMap.get(r.periodTableId) ?? null : null,
      })
      tableMap.set(r.id, newId)
    }
    for (const r of snapshot.courses) {
      const remappedTable = tableMap.get(r.tableId)
      if (remappedTable == null) continue
      const newId = nextIdFrom(await db.courses.toArray())
      await db.courses.add({ ...rowToCourse(r), id: newId, tableId: remappedTable })
    }
    for (const r of snapshot.importDrafts) {
      await db.importDrafts.put(rowToDraft(r)) // 业务字符串 ID upsert
    }
  })
}

function nextIdFrom(rows: Array<{ id: number }>): number {
  return rows.length === 0 ? 1 : Math.max(...rows.map((x) => x.id)) + 1
}
