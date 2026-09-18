/**
 * GeneralSettingsPage 实验室段 + 语言折叠卡 — GeneralSettingsScreen.kt v1.0.56 1:1 同步测试。
 * 锁定: 实验室 3 开关默认全关 + 晚间起始时间行条件显示 + 语言卡收起只显当前语言。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { usePrefsStore } from '../../state/prefsStore'
import { GeneralSettingsPage } from './GeneralSettingsPage'
import { initI18n } from '../../i18n'

beforeAll(() => {
  initI18n('zh-CN')
  // jsdom 无 matchMedia — 桩可控行为 (prefsStore.test.ts 同)
  ;(window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({
    matches: q.includes('dark'),
  })
})

beforeEach(async () => {
  localStorage.clear()
  await usePrefsStore.getState().load()
})

afterEach(() => {
  cleanup()
})

function renderPage() {
  return render(<GeneralSettingsPage onBack={() => {}} onOpenHoliday={() => {}} />)
}

/** ToggleRow 的 Switch 是行内 button(role=switch) — 从 label 文本向上找行内的 switch 按钮 */
function switchOf(label: string): HTMLElement {
  const el = screen.getByText(label)
  // 结构: <div row(flex)> <div(flex:1)> <div>label</div> [subtitle] </div> <button switch/> </div>
  let cur: HTMLElement | null = el.parentElement
  let btn: HTMLElement | null = null
  while (cur && !btn) {
    btn = cur.querySelector(':scope > button[role="switch"]')
    if (!btn) cur = cur.parentElement
  }
  expect(btn).toBeTruthy()
  return btn as HTMLElement
}

describe('实验室段 (v1.0.56 T2/T3, Android 默认全关 1:1)', () => {
  it('段头 + 3 个开关全部存在且默认关', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('实验室')).toBeTruthy())
    expect(screen.getByText('课表自适应行高')).toBeTruthy()
    expect(screen.getByText('双指捏放调整行高')).toBeTruthy()
    expect(screen.getByText('自动收起空白晚间')).toBeTruthy()
    // 默认全关 → 晚间起始时间行不显示
    expect(screen.queryByText('晚间起始时间')).toBeNull()
  })

  it('自动收起空白晚间开 → 显示晚间起始时间行', async () => {
    renderPage()
    await waitFor(() => expect(switchOf('自动收起空白晚间')).toBeTruthy())
    fireEvent.click(switchOf('自动收起空白晚间'))
    await waitFor(() => expect(screen.getByText('晚间起始时间')).toBeTruthy())
  })

  it('开关落盘 prefsStore', async () => {
    renderPage()
    await waitFor(() => expect(switchOf('课表自适应行高')).toBeTruthy())
    fireEvent.click(switchOf('课表自适应行高'))
    fireEvent.click(switchOf('双指捏放调整行高'))
    await waitFor(() => {
      expect(usePrefsStore.getState().prefs.gridAdaptiveHeight).toBe(true)
      expect(usePrefsStore.getState().prefs.gridPinchZoom).toBe(true)
    })
  })
})

describe('语言折叠卡 (v1.0.56 T4, Android 收起只显当前语言 1:1)', () => {
  it('收起态只显当前语言, 展开显 5 项', async () => {
    renderPage()
    // settings_language zh-CN 值 = "语言 / Language" (SectionHeader) — 折叠头内部标题同 key
    await waitFor(() => expect(screen.getAllByText('语言 / Language').length).toBeGreaterThanOrEqual(2))
    // 收起: 其他语言名不可见
    expect(screen.queryByText('English')).toBeNull()
    // 展开: 点折叠头 (第二处 = 卡内标题)
    fireEvent.click(screen.getAllByText('语言 / Language')[1])
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('日本語')).toBeTruthy()
    expect(screen.getByText('Español')).toBeTruthy()
    // 收回
    fireEvent.click(screen.getAllByText('语言 / Language')[1])
    expect(screen.queryByText('English')).toBeNull()
  })
})
