import { describe, expect, it } from 'vitest'
import { i18next, prepareI18n, resources, SUPPORTED_LANGS, preparePageTranslations } from './index'

describe('startup translations', () => {
  it('starts Chinese without preparing an unused English resource bundle', async () => {
    await prepareI18n('zh-CN')
    expect(i18next.resolvedLanguage).toBe('zh-CN')
    expect(i18next.getResource('zh-CN', 'translation', 'about_license_body')).toBeUndefined()
    expect(i18next.t('tab_schedule')).toBe(resources['zh-CN'].translation.tab_schedule)
    expect(Object.keys(i18next.getResourceBundle('en', 'translation'))).toEqual([])
  })

  it.each(SUPPORTED_LANGS)('%s contains every English fallback key before rendering', lang => {
    const english = Object.keys(resources.en.translation)
    const current = resources[lang].translation
    expect(english.filter(key => !(key in current))).toEqual([])
  })
  it.each(SUPPORTED_LANGS)('loads %s with identical resources and English fallback', async lang => {
    await prepareI18n(lang)
    await preparePageTranslations()
    expect(i18next.resolvedLanguage).toBe(lang)
    expect(i18next.t('tab_schedule')).toBe(resources[lang].translation.tab_schedule)
    expect(i18next.t('import_selection_empty')).toBe(resources[lang].translation.import_selection_empty)
    expect(i18next.getResourceBundle('en', 'translation')).toEqual(resources.en.translation)
  })

  it('keeps the latest language when overlapping requests finish', async () => {
    const first = prepareI18n('es')
    const last = prepareI18n('ja')
    await Promise.all([first, last])
    expect(i18next.resolvedLanguage).toBe('ja')
  })
})
