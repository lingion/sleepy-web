/**
 * GeneralSettingsPage 实验室段 + 语言折叠卡 — GeneralSettingsScreen.kt v1.0.56 1:1 同步测试。
 * 锁定: 实验室 3 开关默认全关 + 晚间起始时间行条件显示 + 语言卡收起只显当前语言
 * + 显示星期 @day_names/非空守卫 + 分栏标准单选 + 折叠展开态跨二级页保留。
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

describe('语言折叠卡 (Android 2026-09-21: 折叠头只显当前语言值 1:1)', () => {
  it('收起态只显当前语言, 展开显 5 项, 再点收回', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('简体中文')).toBeTruthy())
    // 组标题已示「语言」, 卡内不再重复标题
    expect(screen.getAllByText('语言 / Language')).toHaveLength(1)
    expect(screen.queryByText('English')).toBeNull()
    fireEvent.click(screen.getAllByText('简体中文')[0])
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('日本語')).toBeTruthy()
    expect(screen.getByText('Español')).toBeTruthy()
    fireEvent.click(screen.getAllByText('简体中文')[0])
    await waitFor(() => expect(screen.queryByText('English')).toBeNull())
  })

  it('选语言 = recreate: 写 prefs.lang 且卡片立即收起', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('简体中文')).toBeTruthy())
    fireEvent.click(screen.getAllByText('简体中文')[0])
    fireEvent.click(screen.getByText('日本語'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.lang).toBe('ja'))
    expect(screen.queryByText('English')).toBeNull()
    await usePrefsStore.getState().update({ lang: 'zh-CN' })
  })
  it('shows widget-only behavior and marks widget/high-refresh browser limitations', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('小组件设置'))
    expect(screen.getByText(/Web 不提供 Android 桌面小组件/)).toBeTruthy()
    expect(screen.getByText(/课程配色和分隔线设置仅为迁移保留/)).toBeTruthy()
    expect(screen.getByText(/最近有课日设置仍会影响/)).toBeTruthy()
    fireEvent.click(screen.getByText('高刷新率'))
    expect(screen.getByText(/浏览器刷新率由设备和系统控制/)).toBeTruthy()
  })

  it('显示星期: 行名取 @day_names, 不允许全部取消', async () => {
    await usePrefsStore.getState().update({ visibleDays: [1] })
    renderPage()
    fireEvent.click(await screen.findByText('显示星期'))
    expect(screen.getByText('周一')).toBeTruthy()
    expect(screen.getByText('周日')).toBeTruthy()
    fireEvent.click(screen.getByText('周一'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([1]))
    fireEvent.click(screen.getByText('周日'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([1, 7]))
    fireEvent.click(screen.getByText('周一'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([7]))
    fireEvent.click(screen.getByText('周日'))
    await waitFor(() => expect(usePrefsStore.getState().prefs.visibleDays).toEqual([7]))
  })

  it('两栏开 → 分栏标准两行单选 (DisplayModeOption)', async () => {
    await usePrefsStore.getState().update({ weekTwoColumn: true, weekTwoColumnMode: 'days' })
    renderPage()
    fireEvent.click(await screen.findByText('主页显示设置'))
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radios[1])
    await waitFor(() => expect(usePrefsStore.getState().prefs.weekTwoColumnMode).toBe('balance'))
  })

  it('折叠展开态: 进节假日页保留, 返回上级即丢弃', async () => {
    sessionStorage.clear()
    const first = render(<GeneralSettingsPage onBack={() => {}} onOpenHoliday={() => {}} />)
    fireEvent.click(await screen.findByText('显示星期'))
    fireEvent.click(screen.getByText('节假日课程灰显'))
    first.unmount()
    renderPage()
    expect(await screen.findByText('周一')).toBeTruthy()
    cleanup()
    renderPage()
    expect(screen.queryByText('周一')).toBeNull()
  })
})
