/**
 * i18n 扩展键 — .sleepybackup 全量迁移 (MigrationExecutor.kt 移植) 中文案。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources (reminder.ts 同构模式)。
 * ja/es 暂复用英文。
 */

import type { Lang } from '../index'
import { migrationExtra as locale0 } from './locales/en'
import { migrationExtra as locale1 } from './locales/zh-CN'
import { migrationExtra as locale2 } from './locales/zh-TW'
import { migrationExtra as locale3 } from './locales/ja'
import { migrationExtra as locale4 } from './locales/es'
import { migrationExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const migrationExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
