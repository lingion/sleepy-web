import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * 返回栈 (MainActivity.kt AppRoot overlayStack 1:1) — 单测。
 * push 进页 / pop 退一层 / popToRoot 清整摞 / popstate 监听接线。
 * 栈顶 = 当前显示页 (MainActivity.kt:217-232)。
 */

// jsdom 环境没有真实 history 栈语义差异 — 用 vitest stub 全局 history 验证接线
const pushState = vi.fn()
const back = vi.fn()

vi.stubGlobal('history', { pushState, back, state: null })
vi.stubGlobal(
  'location',
  { pathname: '/', search: '', hash: '' } as unknown as Location
)

import { useBackStack } from './backStack'

describe('useBackStack — MainActivity overlayStack 同构', () => {
  beforeEach(() => {
    pushState.mockClear()
    back.mockClear()
  })

  it('push: 进栈 + history.pushState 接线 (浏览器返回可出栈)', () => {
    const store = useBackStack
    store.getState().reset()
    store.getState().push('general')
    expect(store.getState().stack).toEqual(['general'])
    expect(pushState).toHaveBeenCalledTimes(1)
  })

  it('pop: 只弹一层 (通用→假期 返回 只回通用 — v7.10.8 修复语义)', () => {
    const s = useBackStack.getState()
    s.reset()
    s.push('general')
    s.push('holiday')
    useBackStack.setState({ stack: ['general', 'holiday'] })
    s.pop()
    expect(useBackStack.getState().stack).toEqual(['general'])
  })

  it('pop 空栈: no-op (不误触浏览器 back)', () => {
    const s = useBackStack.getState()
    s.reset()
    s.pop()
    expect(useBackStack.getState().stack).toEqual([])
    expect(back).not.toHaveBeenCalled()
  })

  it('popToRoot: 清整摞 (pendingNewTable 丢弃分支同构)', () => {
    const s = useBackStack.getState()
    s.reset()
    s.push('general')
    s.push('holiday')
    s.popToRoot()
    expect(useBackStack.getState().stack).toEqual([])
  })

  it('peek: 栈顶为当前页', () => {
    const s = useBackStack.getState()
    s.reset()
    s.push('general')
    s.push('holiday')
    expect(s.peek()).toBe('holiday')
  })
})
