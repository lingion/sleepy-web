/**
 * i18n 扩展键 — .sleepybackup 全量迁移 (MigrationExecutor.kt 移植) 中文案。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources (reminder.ts 同构模式)。
 * ja/es 暂复用英文。
 */

import type { Lang } from '../index'

export const migrationExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': {
    backup_title: '全量备份 (.sleepybackup)',
    backup_subtitle: '课表 + 设置打包, 与 Android 端互通',
    backup_import_title: '从 .sleepybackup 恢复',
    backup_import_sub: '选择备份文件, 选择覆盖或合并',
    backup_mode_overwrite: '覆盖导入 — 先清空本机数据再写入',
    backup_mode_merge: '合并导入 — 保留本机数据, 追加备份内容',
    backup_import_ok: '恢复完成: 课表 {v1} / 课程 {v2}',
    backup_import_fail: '备份文件无法读取: {v1}',
    backup_cancel: '取消',
    backup_confirm: '开始恢复',
  },
  'zh-TW': {
    backup_title: '全量備份 (.sleepybackup)',
    backup_subtitle: '課表 + 設定打包, 與 Android 端互通',
    backup_import_title: '從 .sleepybackup 還原',
    backup_import_sub: '選擇備份檔案, 選擇覆蓋或合併',
    backup_mode_overwrite: '覆蓋匯入 — 先清空本機資料再寫入',
    backup_mode_merge: '合併匯入 — 保留本機資料, 追加備份內容',
    backup_import_ok: '還原完成: 課表 {v1} / 課程 {v2}',
    backup_import_fail: '備份檔案無法讀取: {v1}',
    backup_cancel: '取消',
    backup_confirm: '開始還原',
  },
  en: {
    backup_title: 'Full backup (.sleepybackup)',
    backup_subtitle: 'Timetables + settings, interoperable with Android',
    backup_import_title: 'Restore from .sleepybackup',
    backup_import_sub: 'Pick a backup file, then choose overwrite or merge',
    backup_mode_overwrite: 'Overwrite — clear local data, then restore',
    backup_mode_merge: 'Merge — keep local data, append backup contents',
    backup_import_ok: 'Restored: {v1} timetable(s) / {v2} course(s)',
    backup_import_fail: 'Backup file unreadable: {v1}',
    backup_cancel: 'Cancel',
    backup_confirm: 'Restore',
  },
  'en-GB': {
    backup_title: 'Full backup (.sleepybackup)',
    backup_subtitle: 'Timetables + settings, interoperable with Android',
    backup_import_title: 'Restore from .sleepybackup',
    backup_import_sub: 'Pick a backup file, then choose overwrite or merge',
    backup_mode_overwrite: 'Overwrite — clear local storage, then restore',
    backup_mode_merge: 'Merge — keep local storage, append backup contents',
    backup_import_ok: 'Restored: {v1} timetable(s) / {v2} course(s)',
    backup_import_fail: 'Backup file unreadable: {v1}',
    backup_cancel: 'Cancel',
    backup_confirm: 'Restore',
  },
  ja: {
    backup_title: 'Full backup (.sleepybackup)',
    backup_subtitle: 'Timetables + settings, interoperable with Android',
    backup_import_title: 'Restore from .sleepybackup',
    backup_import_sub: 'Pick a backup file, then choose overwrite or merge',
    backup_mode_overwrite: 'Overwrite — clear local data, then restore',
    backup_mode_merge: 'Merge — keep local data, append backup contents',
    backup_import_ok: 'Restored: {v1} timetable(s) / {v2} course(s)',
    backup_import_fail: 'Backup file unreadable: {v1}',
    backup_cancel: 'Cancel',
    backup_confirm: 'Restore',
  },
  es: {
    backup_title: 'Copia completa (.sleepybackup)',
    backup_subtitle: 'Horarios + ajustes, compatible con Android',
    backup_import_title: 'Restore from .sleepybackup',
    backup_import_sub: 'Pick a backup file, then choose overwrite or merge',
    backup_mode_overwrite: 'Overwrite — clear local data, then restore',
    backup_mode_merge: 'Merge — keep local data, append backup contents',
    backup_import_ok: 'Restored: {v1} timetable(s) / {v2} course(s)',
    backup_import_fail: 'Backup file unreadable: {v1}',
    backup_cancel: 'Cancel',
    backup_confirm: 'Restore',
  },
}
