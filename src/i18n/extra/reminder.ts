/**
 * i18n 扩展键 — 提醒分区 (ReminderScreen.kt 移植) 中 Android 没有、Web 才需要的文案。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与其余 extra 文件回落策略一致)。
 * 注: reminder_* 26 个 Android 原文案已存在于 6 份主 JSON, 此处不重复。
 * notif_tomorrow_* 3 键补录于主 JSON 各 locale (Android values-xx 原案)。
 */

import type { Lang } from '../index'
import { reminderExtra as locale0 } from './locales/en'
import { reminderExtra as locale1 } from './locales/zh-CN'
import { reminderExtra as locale2 } from './locales/zh-TW'
import { reminderExtra as locale3 } from './locales/ja'
import { reminderExtra as locale4 } from './locales/es'
import { reminderExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const reminderExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
