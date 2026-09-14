import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * 返回栈 (MainActivity.kt AppRoot overlayStack 1:1) — 单测。
 * push 进页 / pop 退一层 / popToRoot 清整摞 / popstate 监听接线。
 * 栈顶 = 当前显示页 (MainActivity.kt:217-232)。
 */

// jsdom 环境没有真实 history 栈语义差异 — 用 vitest stub 全局 history 验证接线
const pushState = vi.fn()
const back = vi.fn()
let hashState = ''

vi.stubGlobal('history', {
  pushState: (state: unknown, _title: string, url?: string) => {
    pushState(state, _title, url)
    if (url) hashState = url.startsWith('#') ? url : `#${url.split('#')[1] ?? ''}`
  },
  back,
  state: null,
})
vi.stubGlobal(
  'location',
  {
    pathname: '/',
    search: '',
    get hash() {
      return hashState
    },
  } as unknown as Location
)

import { useBackStack, tabFromHash, HASH_BY_KEY, HASH_BY_TAB } from './backStack'

describe('useBackStack — 每页 hash 地址 (tab + 全部二级页)', () => {
  beforeEach(() => {
    pushState.mockClear()
    back.mockClear()
    hashState = ''
  })

  it('push: 写本层 hash — push(general) → location.hash = #/我的/通用设置', () => {
    const store = useBackStack
    store.getState().reset()
    store.getState().push('general')
    expect(hashState).toBe('#/我的/通用设置')
    const lastUrl = pushState.mock.calls[pushState.mock.calls.length - 1][2] as string
    expect(lastUrl).toBe(HASH_BY_KEY.general)
  })

  it('pushTab: 切 tab 写 tab hash — pushTab(today) → #/今日 (不进返回栈)', () => {
    useBackStack.getState().reset()
    useBackStack.getState().pushTab('today')
    expect(hashState).toBe(HASH_BY_TAB.today)
    expect(useBackStack.getState().stack).toEqual([])
  })

  it('tabFromHash: 解码还原 — 编码 hash/#/今日/#/我的/#未匹配', () => {
    expect(tabFromHash(encodeURIComponent('#/今日'))).toBe('today')
    expect(tabFromHash('#/今日')).toBe('today')
    expect(tabFromHash('#/我的')).toBe('mine')
    expect(tabFromHash('#/管理')).toBe('manage')
    expect(tabFromHash('#/未知页')).toBe('schedule')
  })

  it('顺序: 连续 push 两层 → hash 随层递增切换 (general → holiday)', () => {
    useBackStack.getState().reset()
    useBackStack.getState().push('general')
    expect(hashState).toBe('#/我的/通用设置')
    useBackStack.getState().push('holiday')
    expect(hashState).toBe('#/我的/通用设置/节假日')
  })
})

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
