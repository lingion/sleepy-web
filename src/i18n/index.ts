/**
 * i18n — 与 Android res/values-* 6 语言同构
 * en (基准) / zh-CN / zh-TW / ja / es / en-GB
 * 缺 key 回落链: 当前语言 → en → key 本身 (Android fallback 同)
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import ja from './ja.json'
import es from './es.json'
import enGB from './en-GB.json'
// 按功能拆分的扩展键文件 — 各分区独立维护, 深合并进 resources, 避免多 agent 抢改同一份 JSON。
import { themeExtra } from './extra/theme'
import { holidayExtra } from './extra/holiday'
import { timeslotExtra } from './extra/timeslot'
import { jwImportExtra } from './extra/jwimport'
import { importSheetExtra } from './extra/importsheet'

export const SUPPORTED_LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'es', 'en-GB'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

/**
 * Android strings.xml 占位 (%1$s / %1$d) → i18next ({{name}})。
 * 按位置命名: %1 → v1, %2 → v2; 调用方传 { v1: ... }。
 * 数组值 (@*_format 等复数形态) 原样保留首元素外的形态, 仅转换字符串元素。
 */
function convertAndroidPlaceholders(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k] = v
        .replace(/%(\d+)\$s/g, (_, n: string) => `{{v${n}}}`)
        .replace(/%(\d+)\$d/g, (_, n: string) => `{{v${n}}}`)
        .replace(/%(\d+)\$f/g, (_, n: string) => `{{v${n}}}`)
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === 'string'
          ? item
              .replace(/%(\d+)\$s/g, (_, n: string) => `{{v${n}}}`)
              .replace(/%(\d+)\$d/g, (_, n: string) => `{{v${n}}}`)
          : item
      )
    } else {
      out[k] = v
    }
  }
  return out
}

/** 各语言主 JSON (Android res/values-* 同构基准) */
const BASE_JSON: Record<Lang, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  'zh-CN': zhCN as Record<string, unknown>,
  'zh-TW': zhTW as Record<string, unknown>,
  ja: ja as Record<string, unknown>,
  es: es as Record<string, unknown>,
  'en-GB': enGB as Record<string, unknown>,
}

/** 按功能拆分的扩展键文件 — 依序深合并到主 JSON 之上 (后写覆盖同 key)。 */
const EXTRA_KEY_FILES: Array<Record<Lang, Record<string, string>>> = [
  themeExtra,
  holidayExtra,
  timeslotExtra,
  jwImportExtra,
  importSheetExtra,
]

/** 主 JSON 占位转换 + 逐层合并扩展键 → 该语言最终 translation 表。 */
function buildTranslation(lang: Lang): Record<string, unknown> {
  return EXTRA_KEY_FILES.reduce<Record<string, unknown>>(
    (acc, file) => ({ ...acc, ...file[lang] }),
    convertAndroidPlaceholders(BASE_JSON[lang])
  )
}

export const resources = {
  en: { translation: buildTranslation('en') },
  'zh-CN': { translation: buildTranslation('zh-CN') },
  'zh-TW': { translation: buildTranslation('zh-TW') },
  ja: { translation: buildTranslation('ja') },
  es: { translation: buildTranslation('es') },
  'en-GB': { translation: buildTranslation('en-GB') },
}

/** 系统语言 → 支持语言映射 (Android LocaleList 映射同) */
export function resolveSystemLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'
  if ((SUPPORTED_LANGS as readonly string[]).includes(nav)) return nav as Lang
  if (nav.startsWith('zh')) {
    return nav.includes('TW') || nav.includes('HK') || nav.includes('Hant') ? 'zh-TW' : 'zh-CN'
  }
  if (nav.startsWith('ja')) return 'ja'
  if (nav.startsWith('es')) return 'es'
  if (nav.startsWith('en')) return nav.includes('GB') ? 'en-GB' : 'en'
  return 'zh-CN'
}

let initialized = false

export function initI18n(lang: Lang | 'system'): void {
  const resolved = lang === 'system' ? resolveSystemLang() : lang
  if (!initialized) {
    void i18next.use(initReactI18next).init({
      resources,
      lng: resolved,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
    initialized = true
  } else {
    void i18next.changeLanguage(resolved)
  }
}

export function changeLang(lang: Lang | 'system'): void {
  initI18n(lang)
}
