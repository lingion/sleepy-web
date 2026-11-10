/** Local dialogs retain the root navigation; full destinations leave the root shell.
 * Android v1.0.64 SleepyNavHost owns the Dock outside ScheduleScreen's dialogs.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { App } from './App'
import { initI18n } from './i18n'
import { usePrefsStore } from './state/prefsStore'
import { useBackStack } from './state/backStack'
import { setViewport } from './testUtils/viewport'

/** 底栏两种形态都是 <nav>; 页面内没有其他 nav, 所以 nav 数 = 底栏数 */
function bottomBars(): HTMLElement[] {
  return Array.from(document.querySelectorAll('nav'))
}

beforeAll(() => {
  initI18n('zh-CN')
  // jsdom 无 ResizeObserver (App 测 Dock 高 / ScheduleView 测页宽都依赖它)
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试替身
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

beforeEach(() => {
  setViewport(390, 844) // jsdom 默认 1024×768 会落平板横屏双栏分支, 契约测试须锁手机形态
  useBackStack.getState().reset()
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
  useBackStack.getState().reset()
})

function renderApp(navDock: boolean) {
  usePrefsStore.setState({ prefs: { ...usePrefsStore.getState().prefs, navDock }, loaded: true })
  return render(<App />)
}

describe.each([
  ['悬浮 Dock (navDock=true)', true],
  ['贴底通栏 (navDock=false)', false],
])('底栏闸门 — %s', (_name, navDock) => {
  it('主页面 (栈空) = 底栏出现且只有一个', () => {
    renderApp(navDock)
    expect(bottomBars()).toHaveLength(1)
  })

  it.each(['weekJump', 'weekSwitcher', 'courseDetail', 'shareSheet'] as const)('%s 是主页面内弹层，保留底栏和滚动余量', (key) => {
    renderApp(navDock)
    act(() => useBackStack.getState().push(key))
    expect(bottomBars()).toHaveLength(1)
    act(() => useBackStack.getState().pop())
    expect(bottomBars()).toHaveLength(1)
  })

  it('二级页 (栈深 1: 我的→通用设置) = 底栏消失', () => {
    renderApp(navDock)
    act(() => useBackStack.getState().push('general'))
    expect(bottomBars()).toHaveLength(0)
  })

  it('三级页 (栈深 2: 通用设置→节假日) = 底栏仍然消失', () => {
    renderApp(navDock)
    act(() => {
      useBackStack.getState().push('general')
      useBackStack.getState().push('holiday')
    })
    expect(bottomBars()).toHaveLength(0)
  })

  it('从二级页返回 (弹一层后栈空) = 底栏回来', () => {
    renderApp(navDock)
    act(() => useBackStack.getState().push('general'))
    expect(bottomBars()).toHaveLength(0)
    act(() => useBackStack.getState().pop())
    expect(bottomBars()).toHaveLength(1)
  })

  it('三级页返回一层 (栈深 2→1, 仍在三级页里) = 底栏不出现', () => {
    renderApp(navDock)
    act(() => {
      useBackStack.getState().push('general')
      useBackStack.getState().push('holiday')
    })
    act(() => useBackStack.getState().pop())
    expect(bottomBars()).toHaveLength(0)
  })

  it('不变量: 栈深 1..4 恒无底栏, 与是哪一页无关', () => {
    renderApp(navDock)
    const keys = ['general', 'holiday', 'reminder', 'about'] as const
    for (const key of keys) {
      act(() => useBackStack.getState().push(key))
      expect(bottomBars()).toHaveLength(0)
    }
    while (useBackStack.getState().stack.length > 0) {
      act(() => useBackStack.getState().pop())
    }
    expect(bottomBars()).toHaveLength(1)
  })
})
