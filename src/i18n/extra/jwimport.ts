/**
 * i18n 扩展键 — 教务导入分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 注: 主 JSON 已有 jw_import_title (教务导入 - %1$s), 故此处用独立 key 不冲突。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'

export const jwImportExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': { jw_import_view_title: '教务导入' },
  'zh-TW': { jw_import_view_title: '教務匯入' },
  en: { jw_import_view_title: 'Academic Import' },
  'en-GB': { jw_import_view_title: 'Academic Import' },
  ja: { jw_import_view_title: 'Academic Import' },
  es: { jw_import_view_title: 'Academic Import' },
}
