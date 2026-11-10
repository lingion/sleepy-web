/** Current-language startup; synchronous resources remain an offline API. */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './zh-CN.startup.json'
import { translationExtras as zhCNExtra } from './extra/locales/zh-CN'
import { buildTranslation } from './translation'
import { resources } from './resources'
export { resources } from './resources'

export const SUPPORTED_LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'es', 'en-GB'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

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

const loaders = {
  en: () => Promise.all([import('./en.json'), import('./extra/locales/en')]),
  'zh-TW': () => Promise.all([import('./zh-TW.json'), import('./extra/locales/zh-TW')]),
  ja: () => Promise.all([import('./ja.json'), import('./extra/locales/ja')]),
  es: () => Promise.all([import('./es.json'), import('./extra/locales/es')]),
  'en-GB': () => Promise.all([import('./en-GB.json'), import('./extra/locales/en-GB')]),
}
const translations = new Map<Lang, Record<string, unknown>>()
const pending = new Map<Lang, Promise<Record<string, unknown>>>()
let languageRequest = 0
let pageTranslationsRequested = false
let chinesePages: Promise<Record<string, unknown>> | undefined
let chinesePagesLoaded = false

async function completeTranslation(lang: Lang): Promise<Record<string, unknown>> {
  const current = await translation(lang)
  if (lang !== 'zh-CN') return current
  chinesePages ??= import('./zh-CN.pages.json').then(({ default: pages }) => buildTranslation(pages, zhCNExtra)).catch(error => { chinesePages = undefined; throw error })
  const complete = { ...current, ...await chinesePages }
  translations.set(lang, complete)
  chinesePagesLoaded = true
  return complete
}

/** Page code and long help/license text finish together, including cold deep links. */
export async function preparePageTranslations(): Promise<void> {
  pageTranslationsRequested = true
  const lang = i18next.resolvedLanguage as Lang | undefined
  if (!i18next.isInitialized || !lang || !SUPPORTED_LANGS.includes(lang)) return
  const current = await completeTranslation(lang)
  if (i18next.resolvedLanguage === lang) i18next.addResourceBundle(lang, 'translation', current)
}

function translation(lang: Lang): Promise<Record<string, unknown>> {
  const ready = translations.get(lang)
  if (ready) return Promise.resolve(ready)
  // The default locale is discovered from the HTML alongside the entry.
  if (lang === 'zh-CN') {
    const value = buildTranslation(zhCN, zhCNExtra)
    translations.set(lang, value)
    return Promise.resolve(value)
  }
  let request = pending.get(lang)
  if (!request) {
    request = loaders[lang]().then(([{ default: base }, { translationExtras }]) => {
      const value = buildTranslation(base, translationExtras)
      translations.set(lang, value)
      return value
    }).catch(error => { pending.delete(lang); throw error })
    pending.set(lang, request)
  }
  return request
}

function applyLanguage(resolved: Lang, english: Record<string, unknown>, current: Record<string, unknown>): void {
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init({
      resources: { en: { translation: english }, [resolved]: { translation: current } },
      lng: resolved,
      fallbackLng: 'en',
      initImmediate: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    })
  } else {
    i18next.addResourceBundle('en', 'translation', english)
    i18next.addResourceBundle(resolved, 'translation', current)
    void i18next.changeLanguage(resolved)
  }
}

/** Await before mounting the first route; no other language is requested. */
export async function prepareI18n(lang: Lang | 'system'): Promise<void> {
  const resolved = lang === 'system' ? resolveSystemLang() : lang
  const request = ++languageRequest
  let current = await translation(resolved)
  if (pageTranslationsRequested) current = await completeTranslation(resolved)
  // Every supported locale has all English keys (guarded by startup.test.ts).
  // Keep the full English fallback once requested, without downloading an
  // otherwise unused language before the first timetable can render.
  const english = translations.get('en') ?? {}
  if (request === languageRequest) applyLanguage(resolved, english, current)
}

/** Synchronous compatibility for offline resource consumers. Unused by startup. */
export function initI18n(lang: Lang | 'system'): void {
  ++languageRequest
  const resolved = lang === 'system' ? resolveSystemLang() : lang
  const english = resources.en.translation, current = resources[resolved].translation
  translations.set('en', english)
  translations.set(resolved, current)
  applyLanguage(resolved, english, current)
}

export function changeLang(lang: Lang | 'system'): void {
  const resolved = lang === 'system' ? resolveSystemLang() : lang
  const current = translations.get(resolved), english = translations.get('en') ?? {}
  if (current && (!pageTranslationsRequested || resolved !== 'zh-CN' || chinesePagesLoaded)) {
    ++languageRequest
    if (i18next.resolvedLanguage !== resolved) applyLanguage(resolved, english, current)
  } else {
    void prepareI18n(resolved).catch(error => console.error('Unable to load language', error))
  }
}

export { i18next }
