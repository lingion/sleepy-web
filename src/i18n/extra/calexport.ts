/**
 * i18n 扩展键 — ICS 导出范围弹层中 Android 没有、Web 才需要的文案。
 * (Android 的"导入范围"在系统日历写入库场景; web 对位是 .ics 文件逐日导出,
 *  默认保持 Android exportIcs 的循环事件形态 → 需要一个"循环事件"选项标签。)
 * calendar_range_* 4 键为 Android 原文案, 已收录于 6 份主 JSON。
 */

import type { Lang } from '../index'

export const calendarExportExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': {
    ics_export_options_title: 'ICS 导出方式',
    ics_recurring_label: '循环事件（整学期，标准 RRULE）',
    ics_dated_label: '逐日事件（按范围）',
    ics_dated_note: '逐日事件，可导入任意日历应用；范围外课程不导出。',
  },
  'zh-TW': {
    ics_export_options_title: 'ICS 匯出方式',
    ics_recurring_label: '循環事件（整學期，標準 RRULE）',
    ics_dated_label: '逐日事件（按範圍）',
    ics_dated_note: '逐日事件，可匯入任意日曆應用；範圍外課程不匯出。',
  },
  en: {
    ics_export_options_title: 'ICS export format',
    ics_recurring_label: 'Recurring events (full semester, standard RRULE)',
    ics_dated_label: 'Dated events (within range)',
    ics_dated_note: 'Dated events, importable into any calendar app; courses outside the range are skipped.',
  },
  'en-GB': {
    ics_export_options_title: 'ICS export format',
    ics_recurring_label: 'Recurring events (full semester, standard RRULE)',
    ics_dated_label: 'Dated events (within range)',
    ics_dated_note: 'Dated events, importable into any calendar app; courses outside the range are skipped.',
  },
  ja: {
    ics_export_options_title: 'ICS export format',
    ics_recurring_label: 'Recurring events (full semester, standard RRULE)',
    ics_dated_label: 'Dated events (within range)',
    ics_dated_note: 'Dated events, importable into any calendar app; courses outside the range are skipped.',
  },
  es: {
    ics_export_options_title: 'ICS export format',
    ics_recurring_label: 'Recurring events (full semester, standard RRULE)',
    ics_dated_label: 'Dated events (within range)',
    ics_dated_note: 'Dated events, importable into any calendar app; courses outside the range are skipped.',
  },
}
