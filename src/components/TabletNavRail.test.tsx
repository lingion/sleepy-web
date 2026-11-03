/**
 * 平板 Rail 契约 — SleepyNavHost.kt:519-600 when(effectiveRightTab) 结构锁定:
 * 槽位顺序恒 Today/Manage/Mine; 当前右栏 tab 槽 = 跑道胶囊 (aria-label 前缀「课表·」),
 * 其余两个 = 普通项; 点击回调携带正确的 tab。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { TabletNavRail } from './TabletNavRail'

const LABELS = { today: '今日', manage: '课表管理', mine: '我的' }

afterEach(cleanup)

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'))
}

describe('TabletNavRail', () => {
  it('三槽位顺序恒 Today/Manage/Mine, 当前 tab 槽是胶囊 (课表·前缀)', () => {
    const { container } = render(<TabletNavRail current="manage" labels={LABELS} onSelect={() => {}} />)
    const labels = buttons(container).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['今日', '课表·课表管理', '我的'])
  })

  it('胶囊随 current 移动: current=today → 第一槽是胶囊', () => {
    const { container } = render(<TabletNavRail current="today" labels={LABELS} onSelect={() => {}} />)
    expect(buttons(container)[0].getAttribute('aria-label')).toBe('课表·今日')
    expect(buttons(container)[0].getAttribute('aria-current')).toBe('page')
  })

  it('点击普通项/胶囊都回调对应 tab', () => {
    const onSelect = vi.fn()
    const { container } = render(<TabletNavRail current="today" labels={LABELS} onSelect={onSelect} />)
    fireEvent.click(buttons(container)[2]) // 我的 (普通项)
    expect(onSelect).toHaveBeenLastCalledWith('mine')
    fireEvent.click(buttons(container)[0]) // 胶囊 (今日)
    expect(onSelect).toHaveBeenLastCalledWith('today')
  })
})
