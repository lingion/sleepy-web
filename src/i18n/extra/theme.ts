/**
 * i18n 扩展键 — 主题/自定义主题编辑器分区 (CustomThemeEditorScreen/AppearanceScreen 文案 1:1)。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 */

import type { Lang } from '../index'
import { themeExtra as locale0 } from './locales/en'
import { themeExtra as locale1 } from './locales/zh-CN'
import { themeExtra as locale2 } from './locales/zh-TW'
import { themeExtra as locale3 } from './locales/ja'
import { themeExtra as locale4 } from './locales/es'
import { themeExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const themeExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
