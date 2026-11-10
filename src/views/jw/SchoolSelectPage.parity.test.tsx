import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { initI18n } from '../../i18n'
import { SchoolSelectPage } from './SchoolSelectPage'
import { SCHOOLS, groupByLetter, statusBadge } from './schools'

beforeAll(() => initI18n('zh-CN'))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('保留 4140 所学校，推荐卡、自定义链接、首字母分组同属滚动列表', () => {
  const { container } = render(<SchoolSelectPage onPickSchool={vi.fn()} onPickUrl={vi.fn()} />)
  expect(SCHOOLS).toHaveLength(4140)
  expect(screen.getByText(/目录 4140 · 已支持 \d+ · 待验证 \d+/)).toBeTruthy()
  const scrolling = container.querySelector('.jw-school-scroll')!
  expect(scrolling).toBeTruthy()
  const recommendations = within(scrolling as HTMLElement).getByText('可能的学校')
  const customUrl = within(scrolling as HTMLElement).getByRole('button', { name: /自定义教务链接/ })
  const firstLetter = scrolling.querySelector('[data-letter]')!
  expect(recommendations.compareDocumentPosition(customUrl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(customUrl.compareDocumentPosition(firstLetter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(customUrl)
  expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  expect(customUrl.hasAttribute('data-glass-plain')).toBe(true)
  expect(scrolling.parentElement?.querySelector('nav')).toBe(screen.getByRole('navigation'))
  expect(scrolling.contains(screen.getByRole('navigation'))).toBe(false)
})

it('完整拼音搜索命中学校，搜索时收起推荐与索引，保留自定义链接', () => {
  const pick = vi.fn()
  render(<SchoolSelectPage onPickSchool={pick} onPickUrl={vi.fn()} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'haerbingongcheng' } })
  expect(screen.queryByText('可能的学校')).toBeNull()
  expect(screen.queryByRole('navigation')).toBeNull()
  expect(screen.getByRole('button', { name: /自定义教务链接/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('option', { name: '哈尔滨工程大学' }))
  expect(pick.mock.calls[0][0].name).toBe('哈尔滨工程大学')
})

it('未验证状态不铺徽章，研究生待适配徽章同时保留两个含义', () => {
  for (const status of ['supported', 'unverified', 'grad_unverified']) {
    expect(statusBadge({ ...SCHOOLS[0], status })).toBeNull()
  }
  const school = SCHOOLS.find(s => s.status === 'grad_pending')!
  render(<SchoolSelectPage onPickSchool={vi.fn()} onPickUrl={vi.fn()} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: school.name } })
  expect(within(screen.getByRole('option', { name: school.name })).getByText('待适配 · 研究生')).toBeTruthy()
})

it('字母点击可跨完整目录跳转并高亮，支持索引拖动', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const { container } = render(<SchoolSelectPage onPickSchool={vi.fn()} onPickUrl={vi.fn()} />)
  const letters = groupByLetter(SCHOOLS).map(s => s.letter)
  const nav = screen.getByRole('navigation')
  expect(within(nav).getAllByRole('button').every(button => button.hasAttribute('data-glass-plain'))).toBe(true)
  const finalLetter = letters.at(-1)!
  fireEvent.click(within(nav).getByRole('button', { name: finalLetter }))
  expect(container.querySelector(`[data-letter="${finalLetter}"]`)).toBeTruthy()
  expect(within(nav).getByRole('button', { name: finalLetter }).getAttribute('aria-current')).toBe('location')
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 500 } as DOMRect)
  fireEvent.pointerDown(nav, { button: 0, clientY: 101, pointerId: 1 })
  expect(container.querySelector(`[data-letter="${letters[0]}"]`)).toBeTruthy()
  fireEvent.pointerMove(nav, { buttons: 1, clientY: 599, pointerId: 1 })
  expect(container.querySelector(`[data-letter="${finalLetter}"]`)).toBeTruthy()
  fireEvent.pointerUp(nav, { pointerId: 1 })
})

it('推荐卡高度改变后，字母跳转仍计入全部前缀高度', () => {
  let prefixHeight = 150
  const observers: ResizeObserverCallback[] = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { observers.push(callback) }
    observe() {}
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { height: this.classList.contains('jw-school-prefix') ? prefixHeight : 0 } as DOMRect
  })
  const { container } = render(<SchoolSelectPage onPickSchool={vi.fn()} onPickUrl={vi.fn()} />)
  const scroll = container.querySelector('.jw-school-scroll') as HTMLElement
  const first = within(screen.getByRole('navigation')).getByRole('button', { name: groupByLetter(SCHOOLS)[0].letter })
  fireEvent.click(first)
  expect(scroll.scrollTop).toBe(154)
  prefixHeight = 310
  // A real ResizeObserver reports a location card expanding in the same scroll body.
  act(() => { for (const callback of observers) callback([], {} as ResizeObserver) })
  fireEvent.click(first)
  expect(scroll.scrollTop).toBe(314)
})
