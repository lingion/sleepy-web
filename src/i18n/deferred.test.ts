import { expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import zhCN from './zh-CN.json'

it('keeps first-screen Chinese keys and restores every help and license value before opening a deferred page', async () => {
  vi.resetModules()
  const module = await import('./index')
  await module.prepareI18n('zh-CN')
  expect(module.i18next.t('tab_schedule')).toBe(zhCN.tab_schedule)
  expect(module.i18next.getResource('zh-CN', 'translation', 'about_license_body')).toBeUndefined()
  await module.preparePageTranslations()
  expect(module.i18next.getResourceBundle('zh-CN', 'translation')).toEqual(module.resources['zh-CN'].translation)
  await module.prepareI18n('ja')
  await module.prepareI18n('zh-CN')
  expect(module.i18next.t('about_license_body')).toBe(zhCN.about_license_body)
})

it('prepares the deferred translations for a cold deep link even before language initialization', async () => {
  vi.resetModules()
  const module = await import('./index')
  await module.preparePageTranslations()
  await module.prepareI18n('zh-CN')
  expect(module.i18next.getResourceBundle('zh-CN', 'translation')).toEqual(module.resources['zh-CN'].translation)
})

it('preserves the original Chinese dictionary exactly across its two delivery groups', async () => {
  const startup = (await import('./zh-CN.startup.json')).default
  const pages = (await import('./zh-CN.pages.json')).default
  expect(Object.keys(startup).filter(key => key in pages)).toEqual([])
  expect({ ...startup, ...pages }).toEqual(zhCN)
})

it('fills Chinese long text when switching back after opening help in another language', async () => {
  vi.resetModules()
  const module = await import('./index')
  // i18next itself is a process singleton, even after resetting our modules.
  if (module.i18next.isInitialized) module.i18next.removeResourceBundle('zh-CN', 'translation')
  await module.prepareI18n('zh-CN')
  await module.prepareI18n('ja')
  await module.preparePageTranslations()
  module.changeLang('zh-CN')
  await waitFor(() => expect(module.i18next.getResource('zh-CN', 'translation', 'about_license_body')).toBe(zhCN.about_license_body))
})
