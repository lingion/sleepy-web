/**
 * 平板横屏 Master-Detail 契约 — SleepyNavHost.kt:484-657:
 * ①宽屏横屏 → Rail + 双栏, 底栏消失; ②tab=Schedule 右栏派生 Today;
 * ③全屏覆盖层打开 → 回落单栏 (Android overlay 是 NavHost 全屏目的地盖住双栏);
 * ④课表页弹层族 (fixed 浮层) 不拆栏。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { App } from './App'
import { initI18n } from './i18n'
import { usePrefsStore } from './state/prefsStore'
import { useBackStack } from './state/backStack'
import { setViewport } from './testUtils/viewport'

const rail = () => document.querySelector('aside[aria-label="导航栏"]')
const bottomBars = () => document.querySelectorAll('nav')

beforeAll(() => {
  initI18n('zh-CN')
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
  setViewport(1280, 800) // 平板横屏
  useBackStack.getState().reset()
  window.location.hash = ''
  usePrefsStore.setState({ prefs: { ...usePrefsStore.getState().prefs, navDock: false }, loaded: true })
})

afterEach(() => {
  cleanup()
  useBackStack.getState().reset()
})

describe('平板横屏 Master-Detail', () => {
  it('宽屏横屏 = Rail 出现且底栏消失', () => {
    render(<App />)
    expect(rail()).not.toBeNull()
    expect(bottomBars()).toHaveLength(0)
  })

  it('默认 tab=Schedule → 右栏派生 Today (胶囊在 今日 槽)', () => {
    const { container } = render(<App />)
    const labels = Array.from(rail()!.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['课表·今日', '课表管理', '我的'])
    void container
  })

  it('点 Rail 我的 → 胶囊移到 我的 槽', () => {
    const { container } = render(<App />)
    const mine = Array.from(container.querySelectorAll<HTMLButtonElement>('aside button')).find(
      (b) => b.getAttribute('aria-label') === '我的',
    )!
    act(() => mine.click())
    const labels = Array.from(rail()!.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['今日', '课表管理', '课表·我的'])
  })

  it('全屏覆盖层 (通用设置) 打开 → 回落单栏, Rail 消失', () => {
    render(<App />)
    act(() => useBackStack.getState().push('general'))
    expect(rail()).toBeNull()
  })

  it('课表页弹层 (课程详情) 打开 → 双栏保持', () => {
    render(<App />)
    act(() => useBackStack.getState().push('courseDetail'))
    expect(rail()).not.toBeNull()
  })

  it('竖屏视口 → 手机形态 (底栏回来, 无 Rail)', () => {
    setViewport(800, 1280) // 平板竖屏: 宽≥600 但 宽<高 → 不拆栏 (2026-10-27 报修语义)
    render(<App />)
    expect(rail()).toBeNull()
    expect(bottomBars()).toHaveLength(1)
  })
})
