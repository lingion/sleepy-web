/**
 * i18n 扩展键 — 提醒分区 (ReminderScreen.kt 移植) 中 Android 没有、Web 才需要的文案。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与其余 extra 文件回落策略一致)。
 * 注: reminder_* 26 个 Android 原文案已存在于 6 份主 JSON, 此处不重复。
 */

import type { Lang } from '../index'

export const reminderExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': {
    reminder_web_notify_unsupported: '当前浏览器不支持系统通知，配置仅保存在本地。',
    reminder_web_notify_denied: '通知权限已被浏览器拒绝，请在站点设置中重新允许。',
  },
  'zh-TW': {
    reminder_web_notify_unsupported: '目前瀏覽器不支援系統通知，設定僅儲存在本機。',
    reminder_web_notify_denied: '通知權限已被瀏覽器拒絕，請在網站設定中重新允許。',
  },
  en: {
    reminder_web_notify_unsupported: 'This browser has no system notification support; settings are saved locally only.',
    reminder_web_notify_denied: 'Notification permission is blocked by the browser. Re-allow it in site settings.',
  },
  'en-GB': {
    reminder_web_notify_unsupported: 'This browser has no system notification support; settings are saved locally only.',
    reminder_web_notify_denied: 'Notification permission is blocked by the browser. Re-allow it in site settings.',
  },
  ja: {
    reminder_web_notify_unsupported: 'This browser has no system notification support; settings are saved locally only.',
    reminder_web_notify_denied: 'Notification permission is blocked by the browser. Re-allow it in site settings.',
  },
  es: {
    reminder_web_notify_unsupported: 'This browser has no system notification support; settings are saved locally only.',
    reminder_web_notify_denied: 'Notification permission is blocked by the browser. Re-allow it in site settings.',
  },
}
