import { beforeAll, afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { initI18n } from '../../i18n'
import { WidgetGalleryPage } from './WidgetGalleryPage'
import variants from '../../data/widgetVariants.json'
beforeAll(() => initI18n('zh-CN'))
afterEach(cleanup)
it('offers all fourteen Android variants in five accordion families and explains native installation', () => {
  const { container } = render(<WidgetGalleryPage onBack={() => {}} />)
  expect(variants).toHaveLength(14)
  const families = container.querySelectorAll('button[aria-expanded]')
  expect(families).toHaveLength(5)
  const visited: string[] = []
  for (const family of families) {
    fireEvent.click(family)
    visited.push(...[...container.querySelectorAll('[data-widget-variant]')].map(node => node.getAttribute('data-widget-variant')!))
    expect(container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
  }
  expect(new Set(visited)).toEqual(new Set(variants.map(variant => variant.id)))
  fireEvent.click(container.querySelector('[data-widget-variant]')!)
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.getByText('请使用安卓版将 Sleepy 小组件添加到桌面。网页版可以预览组件并保存共用外观设置。')).toBeTruthy()
})
