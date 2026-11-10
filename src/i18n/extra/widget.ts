/**
 * i18n 扩展键 — Android 桌面小组件入口在 web 的平台差异提示 (web 独有文案)。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources。
 */

import type { Lang } from '../index'
import { widgetExtra as locale0 } from './locales/en'
import { widgetExtra as locale1 } from './locales/zh-CN'
import { widgetExtra as locale2 } from './locales/zh-TW'
import { widgetExtra as locale3 } from './locales/ja'
import { widgetExtra as locale4 } from './locales/es'
import { widgetExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const widgetExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
