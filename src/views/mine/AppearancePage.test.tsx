/**
 * AppearancePage — AppearanceScreen.kt 1:1 布局契约。
 * 锁定: 网格单元序列 (5 预设 → 自定义 → 加号末格) 按 2 列 chunk + 单格行补空位;
 * 名称行 20×20 ✓槽位恒在 (选中不改行高); 外观模式点当前项不写; 节次表头导航行。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { usePrefsStore } from '../../state/prefsStore'
import { saveTheme, CUSTOM_KEY_PREFIX } from '../../data/customThemeStore'
import { AppearancePage } from './AppearancePage'
import { initI18n } from '../../i18n'

beforeAll(() => {
  initI18n('zh-CN')
  ;(window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = () => ({ matches: false })
})

beforeEach(async () => {
  localStorage.clear()
  await usePrefsStore.getState().load()
})

afterEach(() => {
  cleanup()
})

const PRESET_NAMES = ['默认淡紫', '春绿', '海蓝', '蜜桃粉', '石板灰']

function addCustom(id: string, name: string) {
  saveTheme({
    id, name, primary: '#336699', secondary: '#669933', tertiary: '#993366',
    surfaceHue: 210, surfaceChroma: 8, createdAt: 1,
  })
}

/** 网格行: 预设卡所在 Row 的父容器的直接子 Row 列表 */
function gridRows(): HTMLElement[] {
  const first = screen.getByText(PRESET_NAMES[0]).closest('[role="button"]') as HTMLElement
  const grid = first.parentElement!.parentElement!.parentElement as HTMLElement
  return Array.from(grid.children) as HTMLElement[]
}

describe('主题网格 (cells.chunked(2))', () => {
  it('无自定义: 5 预设 + 加号 = 3 行满格, 加号恰为末格', () => {
    render(<AppearancePage onBack={() => {}} />)
    const rows = gridRows()
    expect(rows).toHaveLength(3)
    rows.forEach((r) => expect(r.children).toHaveLength(2))
    expect(rows[2].lastElementChild!.querySelector('[aria-label="新建主题"]')).toBeTruthy()
  })

  it('1 个自定义: 第 6 格自定义卡, 加号独占末行并补空位', () => {
    addCustom('c1', '我的主题')
    render(<AppearancePage onBack={() => {}} />)
    const rows = gridRows()
    expect(rows).toHaveLength(4)
    expect(rows[2].children[1].textContent).toContain('我的主题')
    expect(rows[3].children).toHaveLength(2)
    expect(rows[3].children[0].querySelector('[aria-label="新建主题"]')).toBeTruthy()
    expect(rows[3].children[1].getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByLabelText('编辑主题')).toBeTruthy()
  })

  it('名称行 ✓槽位恒在 20×20, 仅选中卡在槽内渲染对勾; 空名自定义回落 theme_new', async () => {
    addCustom('c1', '')
    await usePrefsStore.getState().update({ theme: CUSTOM_KEY_PREFIX + 'c1' })
    render(<AppearancePage onBack={() => {}} />)
    const nameSlot = (name: string) => {
      const row = screen.getByText(name).parentElement as HTMLElement
      return row.lastElementChild as HTMLElement
    }
    for (const n of PRESET_NAMES) {
      const slot = nameSlot(n)
      expect(slot.style.width).toBe('20px')
      expect(slot.style.height).toBe('20px')
      expect(slot.children).toHaveLength(0)
    }
    const customSlot = nameSlot('新建主题')
    expect(customSlot.querySelector('[aria-label="已选中"]')).toBeTruthy()
  })

  it('编辑色块点击只开编辑器, 不切换主题', async () => {
    addCustom('c1', '我的主题')
    const onOpen = vi.fn()
    render(<AppearancePage onBack={() => {}} onOpenThemeEditor={onOpen} />)
    const before = usePrefsStore.getState().prefs.theme
    fireEvent.click(screen.getByLabelText('编辑主题'))
    expect(onOpen).toHaveBeenCalledWith('c1')
    expect(usePrefsStore.getState().prefs.theme).toBe(before)
    fireEvent.click(screen.getByLabelText('新建主题'))
    expect(onOpen).toHaveBeenLastCalledWith(null)
  })
})

describe('外观深浅 + 节次表头', () => {
  it('点非当前模式写入, aria-pressed 跟随', async () => {
    render(<AppearancePage onBack={() => {}} />)
    const cur = usePrefsStore.getState().prefs.themeMode
    expect(cur).toBe('system')
    const dark = screen.getByRole('button', { name: '深色' })
    fireEvent.click(dark)
    await waitFor(() => expect(usePrefsStore.getState().prefs.themeMode).toBe('dark'))
    const container = dark.parentElement as HTMLElement
    expect(container.style.padding).toBe('4px')
    expect(dark.style.height).toBe('44px')
    expect(dark.getAttribute('aria-pressed')).toBe('true')
  })

  it('跟随系统说明 Web 能力且不宣称 Android 动态取色', () => {
    render(<AppearancePage onBack={() => {}} />)
    const description = screen.getByText('跟随浏览器系统明暗模式，使用 Web 默认色板')
    expect(description).toBeTruthy()
    expect(description.textContent).not.toContain('Material You')
    expect(description.textContent).not.toContain('Android')
  })
  it('节次表头: 段头 + 同名导航行, 点击进入', () => {
    const onOpen = vi.fn()
    render(<AppearancePage onBack={() => {}} onOpenPeriodHeader={onOpen} />)
    const hits = screen.getAllByText('节次表头')
    expect(hits).toHaveLength(2)
    fireEvent.click(hits[1].closest('[role="button"]') as HTMLElement)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
