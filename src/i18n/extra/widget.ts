/**
 * i18n 扩展键 — Android 桌面小组件入口在 web 的平台差异提示 (web 独有文案)。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources。
 */

import type { Lang } from '../index'

const en = 'The web app has no Android home-screen widgets; your timetable updates live on this page.'

export const widgetExtra: Record<Lang, Record<string, string>> = {
  'zh-CN': {
    web_widget_unavailable: 'Web 不提供 Android 桌面小组件；课表数据会在本页面实时更新。',
    web_widget_settings_unavailable: 'Web 不提供 Android 桌面小组件；课程配色和分隔线设置仅为迁移保留，最近有课日设置仍会影响「今日」页。',
    web_high_refresh_unavailable: '浏览器刷新率由设备和系统控制，此设置仅保留为可迁移的偏好。',
  },
  'zh-TW': {
    web_widget_unavailable: 'Web 不提供 Android 桌面小工具；課表資料會在本頁面即時更新。',
    web_widget_settings_unavailable: 'Web 不提供 Android 桌面小工具；課程配色和分隔線設定僅為遷移保留，最近有課日設定仍會影響「今日」頁。',
    web_high_refresh_unavailable: '瀏覽器更新率由裝置和系統控制，此設定僅保留為可遷移的偏好。',
  },
  en: {
    web_widget_unavailable: en,
    web_widget_settings_unavailable: 'Web has no Android home-screen widgets; widget color and separator options are kept for migration only, while the nearest-busy-day option also affects the Today page.',
    web_high_refresh_unavailable: 'Browser refresh rate is controlled by the device and operating system; this preference is kept for migration only.',
  },
  'en-GB': {
    web_widget_unavailable: en,
    web_widget_settings_unavailable: 'Web has no Android home-screen widgets; widget color and separator options are kept for migration only, while the nearest-busy-day option also affects the Today page.',
    web_high_refresh_unavailable: 'Browser refresh rate is controlled by the device and operating system; this preference is kept for migration only.',
  },
  ja: {
    web_widget_unavailable: 'Web 版には Android のホーム画面ウィジェットはありません。時間割はこのページでリアルタイムに更新されます。',
    web_widget_settings_unavailable: 'Web 版に Android ウィジェットはありません。ウィジェットの色と区切り線は移行用に保存されますが、「今日」ページにも使われる最近の授業日の設定は有効です。',
    web_high_refresh_unavailable: 'ブラウザーのリフレッシュレートは端末とシステムが制御します。この設定は移行用にのみ保存されます。',
  },
  es: {
    web_widget_unavailable: 'La versión web no tiene widgets de pantalla de inicio de Android; tu horario se actualiza en esta página en tiempo real.',
    web_widget_settings_unavailable: 'La versión web no tiene widgets de Android; estas preferencias solo se conservan para la migración y no afectan a esta página.',
    web_high_refresh_unavailable: 'La frecuencia de actualización del navegador depende del dispositivo y del sistema; esta preferencia solo se conserva para la migración.',
  },
}
