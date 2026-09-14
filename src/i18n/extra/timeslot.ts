/**
 * i18n 扩展键 — 节次时间编辑器分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'

export const timeslotExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': { timeslot_editor_title: '节次时间' },
  'zh-TW': { timeslot_editor_title: '節次時間' },
  en: { timeslot_editor_title: 'Class Time Slots' },
  'en-GB': { timeslot_editor_title: 'Class Time Slots' },
  ja: { timeslot_editor_title: 'Class Time Slots' },
  es: { timeslot_editor_title: 'Class Time Slots' },
}
