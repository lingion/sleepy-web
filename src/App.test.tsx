/**
 * 底栏可见性契约测试 — MainActivity.kt:301-397 不变量。
 *
 * Android 每个 overlay 分支 (AddCourse/AllTables/EditTable/Theme/General/Holiday/
 * Export/Reminder/About/License/WidgetManagement/WidgetEdit) 都在底栏组合之前 return,
 * 且 ui/screen/ 下零处 PillNavigationBar 引用 → 栈上只要有一层, 底栏两种形态都不存在。
 *
 * 这里锁的是「可见性随栈深变化的规则本身」(用户 2026-09 反馈: 二级页 Dock 还在),
 * 不是"某个页面有没有 Dock"的快照 — 栈深 1/2/3 与两种底栏形态都必须在同一规则下。
 * 红绿验证: 把 App.tsx 的 !hasOverlay 闸门去掉 → 本文件必须全红。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { App } from './App'
import { initI18n } from './i18n'
import { usePrefsStore } from './state/prefsStore'
import { useBackStack } from './state/backStack'

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
