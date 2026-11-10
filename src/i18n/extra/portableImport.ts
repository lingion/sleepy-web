/** Portable import copy is kept outside the shared Android resource snapshots. */
import type { Lang } from '../index'
import { portableImportExtra as locale0 } from './locales/en'
import { portableImportExtra as locale1 } from './locales/zh-CN'
import { portableImportExtra as locale2 } from './locales/zh-TW'
import { portableImportExtra as locale3 } from './locales/ja'
import { portableImportExtra as locale4 } from './locales/es'
import { portableImportExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const portableImportExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
