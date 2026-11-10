import en from './en.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'
import ja from './ja.json'
import es from './es.json'
import enGB from './en-GB.json'
import { buildTranslation } from './translation'
import { translationExtras as enExtra } from './extra/locales/en'
import { translationExtras as zhCNExtra } from './extra/locales/zh-CN'
import { translationExtras as zhTWExtra } from './extra/locales/zh-TW'
import { translationExtras as jaExtra } from './extra/locales/ja'
import { translationExtras as esExtra } from './extra/locales/es'
import { translationExtras as enGBExtra } from './extra/locales/en-GB'
import type { Lang } from './index'

// Synchronous offline API. The application uses prepareI18n instead, so these
// complete resources and their JSON imports are tree-shaken from the entry.
const cache: Partial<Record<Lang, { translation: Record<string, unknown> }>> = {}
function resource(lang: Lang, base: Record<string, unknown>, extras: Record<string, string>) {
  return cache[lang] ??= { translation: buildTranslation(base, extras) }
}
export const resources = {
  get en() { return resource('en', en, enExtra) },
  get 'zh-CN'() { return resource('zh-CN', zhCN, zhCNExtra) },
  get 'zh-TW'() { return resource('zh-TW', zhTW, zhTWExtra) },
  get ja() { return resource('ja', ja, jaExtra) },
  get es() { return resource('es', es, esExtra) },
  get 'en-GB'() { return resource('en-GB', enGB, enGBExtra) },
}
