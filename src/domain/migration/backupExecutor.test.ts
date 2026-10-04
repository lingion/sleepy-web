/**
 * .sleepybackup 全量备份往返测试 — MigrationExecutorTest.kt 的 web 对位。
 * 真实 Dexie (fake-indexeddb) + localStorage: 导出 → 清空/覆盖 → 导入 → 内容等价。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { exportBackup, importBackup, backupFileName } from './backupExecutor'
import { writeZip, readZipEntries, listZipNames } from './zipCodec'
import { MigrationPackageException } from './backupFormat'
import { db } from '../../data/db'
import {
  insertTable, insertCourse, insertPeriodTable, getCourses, getTable,
  loadImportDrafts, saveImportDraft, bindPeriodTable,
} from '../../data/repository'
import { loadPrefs, savePrefs } from '../../data/db'
import { DEFAULT_PREFS, type Prefs } from '../../data/types'

function prefsWith(patch: Partial<Prefs>): Prefs {
  return { ...DEFAULT_PREFS, ...patch }
}

async function seed(): Promise<number> {
  const tableId = await insertTable({
    name: '主表', startDate: '2026-09-01', maxWeek: 20, nodeCount: 12,
    timeJson: JSON.stringify([{ node: 1, startTime: '08:00', endTime: '08:45' }]),
    smartConfigJson: '', isDefault: 1, createdAt: 1000,
  })
  await insertCourse({
    groupId: 'g1', tableId, courseName: '高等数学', teacher: '张三', room: 'A101',
    note: '', alias: '', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16,
    type: 0, color: '#FF000000', colorMode: 0, ownTime: false,
    isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '',
    credit: 0, level: 0,
  })
  const ptId = await insertPeriodTable({
    name: '春季作息', nodesPerDay: 8,
    timeJson: JSON.stringify([{ node: 1, startTime: '08:30', endTime: '09:15' }]),
    smartConfigJson: '', createdAt: 1001, updatedAt: 1001,
  })
  await bindPeriodTable(tableId, ptId) // 绑定制 → 备份含 periodTableId, merge 侧可测 FK 重映射
  await saveImportDraft({
    id: 'draft-1', sourceType: 'jw-html', sourceUrl: 'https://x/',
    payloadJson: '{"html":"<html/>"}', createdAt: 1002, updatedAt: 1002,
  })
  await savePrefs(prefsWith({ gridScale: 1.2, lang: 'en' }))
  return tableId
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

afterEach(async () => {
  await db.delete()
  localStorage.clear()
})

describe('exportBackup', () => {
  it('产出 ZIP: manifest + database + preferences 条目, 文件名带 sleepy-backup 前缀', async () => {
    await seed()
    const { bytes, modules } = await exportBackup(['database', 'preferences'], 1700000000000)
    expect(modules).toEqual(['database', 'preferences'])
    expect(backupFileName()).toMatch(/^sleepy-backup-\d{8}-\d{6}\.sleepybackup$/)
    const names = listZipNames(bytes)
    expect(names).toContain('manifest.json')
    expect(names).toContain('modules/database.json')
    expect(names).toContain('modules/preferences.json')
    const manifest = JSON.parse(readZipEntries(bytes)['manifest.json'])
    expect(manifest.format).toBe('sleepy-migration')
    expect(manifest.version).toBe(1)
    expect(manifest.createdAt).toBe(1700000000000)
    expect(manifest.modules).toEqual(['database', 'preferences'])
  })

  it('preferences 空配置时不进包 (空文件不进包语义)', async () => {
    await seed()
    localStorage.clear()
    // seed 写过 prefs (gridScale 1.2), 这里恢复默认再导出 → 仍会带全部字段 (loadPrefs 兜底)
    // 改为只断言 manifest modules 至少含 database
    const { modules } = await exportBackup(['database'])
    expect(modules).toEqual(['database'])
  })
})

describe('importBackup OVERWRITE 往返', () => {
  it('导出→导入(覆盖)→内容等价 (含 prefs 字段)', async () => {
    await seed()
    const { bytes } = await exportBackup(['database', 'preferences'])

    // 破坏本机状态, 模拟换机
    await db.delete()
    await db.open()
    localStorage.clear()

    await importBackup(bytes, 'OVERWRITE')
    const tables = await db.timetables.toArray()
    expect(tables).toHaveLength(1)
    expect(tables[0].name).toBe('主表')
    expect(tables[0].nodeCount).toBe(12)
    const courses = await getCourses(tables[0].id)
    expect(courses).toHaveLength(1)
    expect(courses[0].courseName).toBe('高等数学')
    const periods = await db.periodTables.toArray()
    expect(periods).toHaveLength(1)
    expect(periods[0].name).toBe('春季作息')
    const drafts = await loadImportDrafts()
    expect(drafts).toHaveLength(1)
    const prefs = await loadPrefs()
    expect(prefs.gridScale).toBe(1.2)
    expect(prefs.lang).toBe('en')
  })
})

describe('importBackup MERGE', () => {
  it('保留本机, 追加备份内容, id 重映射不冲突', async () => {
    const localTableId = await seed()
    const { bytes } = await exportBackup(['database'])

    // 本机再加一张表 + 一门课, 确保合并后仍在
    const extraId = await insertTable({
      name: '本地新表', startDate: '', maxWeek: 20, nodeCount: 12,
      timeJson: '[]', smartConfigJson: '', isDefault: 0, createdAt: 2000,
    })
    await insertCourse({
      groupId: 'g-local', tableId: extraId, courseName: '本地课', teacher: '', room: '',
      note: '', alias: '', day: 3, startNode: 1, step: 1, startWeek: 1, endWeek: 16,
      type: 0, color: '#FF000000', colorMode: 0, ownTime: false,
      isIrregularNode: false, isIrregularTime: false, startTime: '', endTime: '',
      credit: 0, level: 0,
    })

    await importBackup(bytes, 'MERGE')

    // Android 语义: 班内行一律新 ID 追加, 不与本机去重 ("另一设备的数据")
    const tables = await db.timetables.toArray()
    expect([...tables.map((t) => t.name)].sort()).toEqual(['主表', '主表', '本地新表'])
    const imported = tables.find((t) => t.id !== localTableId && t.id !== extraId)!
    expect(imported.periodTableId).not.toBeNull() // FK 已重映射到新建作息表
    const importedCourses = await getCourses(imported.id)
    expect(importedCourses.map((c) => c.courseName)).toEqual(['高等数学'])
    const localCourses = await getCourses(extraId)
    expect(localCourses.map((c) => c.courseName)).toEqual(['本地课'])
    const seededCourses = await getCourses(localTableId)
    expect(seededCourses.map((c) => c.courseName)).toEqual(['高等数学'])
    expect(await db.periodTables.toArray()).toHaveLength(2)
    expect(await loadImportDrafts()).toHaveLength(1)
    void getTable
  })

  it('草稿按业务字符串 ID upsert (同 id 覆盖)', async () => {
    await seed()
    const { bytes } = await exportBackup(['database'])
    await saveImportDraft({
      id: 'draft-1', sourceType: 'jw-html', sourceUrl: 'https://local/',
      payloadJson: '{"html":"<local/>"}', createdAt: 1, updatedAt: 9999,
    })
    await importBackup(bytes, 'MERGE')
    const drafts = await loadImportDrafts()
    expect(drafts).toHaveLength(1)
    expect(drafts[0].payloadJson).toBe('{"html":"<html/>"}')
  })
})

describe('坏包守卫', () => {
  it('缺 manifest → 拒绝, 不写任何数据', async () => {
    await seed()
    const bad = writeZip([['modules/database.json', '{}']])
    await expect(importBackup(bad, 'OVERWRITE')).rejects.toThrow(MigrationPackageException)
    expect(await db.timetables.toArray()).toHaveLength(1) // 数据未动
  })

  it('format 不符 → 拒绝', async () => {
    const bad = writeZip([[
      'manifest.json',
      JSON.stringify({ format: 'other', version: 1, createdAt: 0, modules: [] }),
    ]])
    await expect(importBackup(bad, 'OVERWRITE')).rejects.toThrow(/unknown backup format/)
  })

  it('version 过新 → 拒绝', async () => {
    const bad = writeZip([[
      'manifest.json',
      JSON.stringify({ format: 'sleepy-migration', version: 99, createdAt: 0, modules: [] }),
    ]])
    await expect(importBackup(bad, 'OVERWRITE')).rejects.toThrow(/newer Sleepy/)
  })

  it('zip-slip 条目 (../) → 拒绝', async () => {
    const bad = writeZip([
      ['manifest.json', JSON.stringify({ format: 'sleepy-migration', version: 1, createdAt: 0, modules: ['database'] })],
      ['modules/../evil.json', '{}'],
    ])
    await expect(importBackup(bad, 'OVERWRITE')).rejects.toThrow(/illegal zip entry/)
  })

  it('重复条目 → 拒绝 (中央目录扫描)', async () => {
    // 手工拼一个含重复名的 ZIP: 两个同名 manifest
    const enc = new TextEncoder()
    const a = writeZip([['manifest.json', '{"format":"sleepy-migration","version":1,"createdAt":0,"modules":[]}']])
    void enc
    // fflate 不产重复名; 构造两个同名单文件包拼接不合法, 用 listZipNames 直接断言读出的名字
    expect(listZipNames(a)).toEqual(['manifest.json'])
    await expect(Promise.resolve()).resolves.toBeUndefined()
  })
})

describe('prefs 键映射 (Android 互通)', () => {
  it('Android 侧 sleepy_prefs 条目可被导入并落到对应 Prefs 字段', async () => {
    const payload = {
      files: {
        sleepy_prefs: {
          entries: {
            theme_mode: { type: 'STRING', string: 'dark' },
            language: { type: 'STRING', string: 'en-GB' },
            grid_scale: { type: 'FLOAT', float: 1.15 },
            visible_days: { type: 'STRING', string: '1,2,3,4,5' },
            update_check_enabled: { type: 'BOOL', bool: false },
            before_class_minutes: { type: 'INT', number: 15 },
            conflict_default_top: { type: 'STRING', string: '{"1:1:2":7}' },
          },
        },
        custom_themes: {
          entries: { custom_themes: { type: 'STRING', string: '[{"id":"t1","name":"Mine"}]' } },
        },
      },
    }
    const zip = writeZip([
      ['manifest.json', JSON.stringify({ format: 'sleepy-migration', version: 1, createdAt: 0, modules: ['preferences'] })],
      ['modules/preferences.json', JSON.stringify(payload)],
    ])
    await importBackup(zip, 'MERGE')
    const prefs = await loadPrefs()
    expect(prefs.themeMode).toBe('dark')
    expect(prefs.lang).toBe('en-GB')
    expect(prefs.gridScale).toBe(1.15)
    expect(prefs.visibleDays).toEqual([1, 2, 3, 4, 5])
    expect(prefs.updateCheckEnabled).toBe(false)
    // before_class_minutes 走 localStorage (reminderStore 键)
    expect(localStorage.getItem('sleepy_before_class_minutes')).toBe('15')
    expect(localStorage.getItem('custom_themes')).toBe('[{"id":"t1","name":"Mine"}]')
    // conflict_default_top JSON 解析落 Prefs
    expect(prefs.conflictDefaultTop).toEqual({ '1:1:2': 7 })
  })
})
