/**
 * i18n 扩展键 — 主题/自定义主题编辑器分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'

export const themeExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': { custom_theme_editor_title: '自定义主题' },
  'zh-TW': { custom_theme_editor_title: '自訂主題' },
  en: { custom_theme_editor_title: 'Custom Theme' },
  'en-GB': { custom_theme_editor_title: 'Custom Theme' },
  ja: { custom_theme_editor_title: 'Custom Theme' },
  es: { custom_theme_editor_title: 'Custom Theme' },
}
