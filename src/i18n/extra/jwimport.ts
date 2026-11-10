/**
 * i18n 扩展键 — 教务导入分区。
 * 按功能拆分, 由 src/i18n/index.ts 深合并进 resources, 避免多 agent 抢改同一份 JSON。
 * 注: 主 JSON 已有 jw_import_title (教务导入 - %1$s), 故此处用独立 key 不冲突。
 * 结构: 每语言一个扁平 key 表; ja/es 暂复用英文 (与主 JSON 回落策略一致)。
 *
 * 本文件补齐两类键:
 *   1) Android values/strings.xml 里只有中文默认值、主 JSON 缺失的 jw_diag_* 诊断族
 *      (DiagMapper 消费); 占位符按 index.ts 约定直接写 {{v1}} / {{v2}}。
 *   2) web 端独有键 —— 浏览器无法像 Android WebView 那样在页内登录并携带会话 Cookie,
 *      教务抓取多出一条「粘贴课表网页源码」通道, 需要对应文案。
 */

import type { Lang } from '../index'
import { jwImportExtra as locale0 } from './locales/en'
import { jwImportExtra as locale1 } from './locales/zh-CN'
import { jwImportExtra as locale2 } from './locales/zh-TW'
import { jwImportExtra as locale3 } from './locales/ja'
import { jwImportExtra as locale4 } from './locales/es'
import { jwImportExtra as locale5 } from './locales/en-GB'

// Each language is stored independently so startup can load only its resources.
export const jwImportExtra: Record<Lang, Record<string, string>> = {
  'en': locale0,
  'zh-CN': locale1,
  'zh-TW': locale2,
  'ja': locale3,
  'es': locale4,
  'en-GB': locale5,
}
