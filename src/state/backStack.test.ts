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
let historyState: unknown = null

/** 真机语义: pushState 把 state 挂到当前条目 — pop() 靠它判断该不该 back() */
vi.stubGlobal('history', {
  pushState: (state: unknown, _title: string, url?: string) => {
    pushState(state, _title, url)
    historyState = state
    if (url) hashState = url.startsWith('#') ? url : `#${url.split('#')[1] ?? ''}`
  },
  replaceState: (state: unknown, _title: string, url?: string) => {
    historyState = state
    if (url) hashState = url.startsWith('#') ? url : `#${url.split('#')[1] ?? ''}`
  },
  back,
  get state() {
    return historyState
  },
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

import { useBackStack, installBackHandler, tabFromHash, chainFromHash, restoreChain, HASH_BY_KEY, HASH_BY_TAB } from './backStack'

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

  it('tabFromHash: 二/三级页 hash 前缀归属所在 tab — 三级返回不甩回课表页', () => {
    expect(tabFromHash('#/我的/外观')).toBe('mine')
    expect(tabFromHash('#/我的/外观/自定义主题')).toBe('mine')
    expect(tabFromHash('#/我的/通用设置/节假日')).toBe('mine')
    expect(tabFromHash('#/管理/全部课表')).toBe('manage')
    expect(tabFromHash('#/课表/添加课程')).toBe('schedule')
    expect(tabFromHash(encodeURIComponent('#/我的/外观'))).toBe('mine')
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

describe('useBackStack — 一次返回只退一层 (pop 与 popstate 不得重复弹)', () => {
  beforeEach(() => {
    pushState.mockClear()
    back.mockClear()
    hashState = ''
    historyState = null
    useBackStack.getState().reset()
  })

  it('pop 后浏览器补来的 popstate 不再弹第二层 (通用→假期 返回必须停在通用)', () => {
    const popped: (string | undefined)[] = []
    const off = installBackHandler((key) => popped.push(key))
    useBackStack.getState().push('general')
    useBackStack.getState().push('holiday')
    useBackStack.getState().pop()
    expect(back).toHaveBeenCalledTimes(1)
    // history.back() 是异步的: popstate 在栈已乐观弹出之后才到达
    hashState = HASH_BY_KEY.general
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useBackStack.getState().stack).toEqual(['general'])
    expect(popped).toEqual([undefined])
    off()
  })

  it('真·浏览器返回 (非本应用 pop) 才由 popstate 弹层并广播弹出的 key', () => {
    const popped: (string | undefined)[] = []
    const off = installBackHandler((key) => popped.push(key))
    useBackStack.getState().push('general')
    useBackStack.getState().push('holiday')
    useBackStack.setState({ stack: ['general', 'holiday'] })
    hashState = HASH_BY_KEY.general
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useBackStack.getState().stack).toEqual(['general'])
    expect(popped).toEqual(['holiday'])
    off()
  })

  it('连续两次 pop 各自只退一层 (两次 popstate 各消费一次记账)', () => {
    useBackStack.getState().push('general')
    useBackStack.getState().push('holiday')
    useBackStack.getState().pop()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useBackStack.getState().stack).toEqual(['general'])
    useBackStack.getState().pop()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(useBackStack.getState().stack).toEqual([])
  })
})

describe('useBackStack — 课表页临时弹层独立 hash (点课程不得跳到 #/管理/编辑课表)', () => {
  it('弹层 key 各有自己的课表层地址', () => {
    expect(HASH_BY_KEY.courseDetail).toBe('#/课表/课程详情')
    expect(HASH_BY_KEY.weekSwitcher).toBe('#/课表/切换课表')
    expect(HASH_BY_KEY.weekJump).toBe('#/课表/周次跳转')
    expect(HASH_BY_KEY.shareSheet).toBe('#/课表/分享')
  })

  it('push(courseDetail): 地址落在课表层下, 不借用 editTable 的地址', () => {
    useBackStack.getState().reset()
    useBackStack.getState().push('courseDetail')
    expect(hashState).toBe('#/课表/课程详情')
    expect(useBackStack.getState().peek()).toBe('courseDetail')
  })
})

describe('useBackStack — 刷新/直达恢复链 (chainFromHash + restoreChain)', () => {
  beforeEach(() => {
    pushState.mockClear()
    back.mockClear()
    hashState = ''
    historyState = null
  })

  it('chainFromHash: 三级页 → 完整链 (最长优先)', () => {
    expect(chainFromHash('#/我的/通用设置/节假日')).toEqual(['general', 'holiday'])
    expect(chainFromHash('#/我的/许可证')).toEqual(['about', 'license'])
    expect(chainFromHash(encodeURIComponent('#/我的/外观/自定义主题'))).toEqual(['appearance', 'customTheme'])
  })

  it('chainFromHash: 二级页 → 单层链;tab 根/未知 → 空', () => {
    expect(chainFromHash('#/我的/关于')).toEqual(['about'])
    expect(chainFromHash('#/我的/提醒')).toEqual(['reminder'])
    expect(chainFromHash('#/我的')).toEqual([])
    expect(chainFromHash('#/今日')).toEqual([])
    expect(chainFromHash('')).toEqual([])
  })

  it('restoreChain: 历史逐层重建 — replaceState tab 根 + 每层 pushState, 栈=链', () => {
    useBackStack.getState().reset()
    restoreChain(['about', 'license'], '#/我的/许可证')
    expect(useBackStack.getState().stack).toEqual(['about', 'license'])
    // replaceState 打头 (tab 根), 其后每层一次 pushState
    expect(hashState).toBe('#/我的/许可证')
    const pushed = pushState.mock.calls.map((c) => c[2])
    expect(pushed).toEqual([HASH_BY_KEY.about, HASH_BY_KEY.license])
    expect(pushState.mock.calls[0][0]).toEqual({ sleepyBack: true, key: 'about' })
  })

  it('minePageFromHash: 链顶 → 初始 page;非子页 hash → main', async () => {
    const { minePageFromHash } = await import('../views/MineView')
    expect(minePageFromHash('#/我的/许可证')).toBe('license')
    expect(minePageFromHash('#/我的/通用设置/节假日')).toBe('holiday')
    expect(minePageFromHash('#/我的/关于')).toBe('about')
    expect(minePageFromHash('#/我的')).toBe('main')
    expect(minePageFromHash('#/课表/课程详情')).toBe('main')
  })
})
