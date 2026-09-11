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

export const SUPPORTED_LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'es', 'en-GB'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
  ja: { translation: ja },
  es: { translation: es },
  'en-GB': { translation: enGB },
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
