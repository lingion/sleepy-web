/**
 * i18n 扩展键 — 节假日规则编辑器分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'

export const holidayExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': { holiday_rule_editor_title: '节假日规则' },
  'zh-TW': { holiday_rule_editor_title: '假日規則' },
  en: { holiday_rule_editor_title: 'Holiday Rules' },
  'en-GB': { holiday_rule_editor_title: 'Holiday Rules' },
  ja: { holiday_rule_editor_title: 'Holiday Rules' },
  es: { holiday_rule_editor_title: 'Holiday Rules' },
}
