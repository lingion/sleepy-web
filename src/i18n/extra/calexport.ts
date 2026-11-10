/**
 * i18n 扩展键 — ICS 导出范围弹层中 Android 没有、Web 才需要的文案。
 * (Android 的"导入范围"在系统日历写入库场景; web 对位是 .ics 文件逐日导出,
 *  默认保持 Android exportIcs 的循环事件形态 → 需要一个"循环事件"选项标签。)
 * calendar_range_* 4 键为 Android 原文案, 已收录于 6 份主 JSON。
 */

import type { Lang } from '../index'
import { calendarExportExtra as locale0 } from './locales/en'
import { calendarExportExtra as locale1 } from './locales/zh-CN'
import { calendarExportExtra as locale2 } from './locales/zh-TW'
import { calendarExportExtra as locale3 } from './locales/ja'
import { calendarExportExtra as locale4 } from './locales/es'
import { calendarExportExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const calendarExportExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
