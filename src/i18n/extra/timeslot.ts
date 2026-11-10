/**
 * i18n 扩展键 — 节次时间编辑器分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'
import { timeslotExtra as locale0 } from './locales/en'
import { timeslotExtra as locale1 } from './locales/zh-CN'
import { timeslotExtra as locale2 } from './locales/zh-TW'
import { timeslotExtra as locale3 } from './locales/ja'
import { timeslotExtra as locale4 } from './locales/es'
import { timeslotExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const timeslotExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
