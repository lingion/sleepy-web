/**
 * i18n 扩展键 — Android 桌面小组件入口在 web 的平台差异提示 (web 独有文案)。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources。
 */

import type { Lang } from '../index'

const en = 'The web app has no Android home-screen widgets; your timetable updates live on this page.'

export const widgetExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': { web_widget_unavailable: 'Web 不提供 Android 桌面小组件；课表数据会在本页面实时更新。' },
  'zh-TW': { web_widget_unavailable: 'Web 不提供 Android 桌面小工具；課表資料會在本頁面即時更新。' },
  en: { web_widget_unavailable: en },
  'en-GB': { web_widget_unavailable: en },
  ja: { web_widget_unavailable: 'Web 版には Android のホーム画面ウィジェットはありません。時間割はこのページでリアルタイムに更新されます。' },
  es: { web_widget_unavailable: 'La versión web no tiene widgets de pantalla de inicio de Android; tu horario se actualiza en esta página en tiempo real.' },
}
