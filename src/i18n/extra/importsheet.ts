/**
 * i18n 扩展键 — 导入课表分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'

export const importSheetExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': { import_sheet_title: '导入课表' },
  'zh-TW': { import_sheet_title: '匯入課表' },
  en: { import_sheet_title: 'Import Timetable' },
  'en-GB': { import_sheet_title: 'Import Timetable' },
  ja: { import_sheet_title: 'Import Timetable' },
  es: { import_sheet_title: 'Import Timetable' },
}
