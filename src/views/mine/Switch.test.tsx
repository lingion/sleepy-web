// Switch M3 1.3.0 几何契约 — 锁 SwitchTokens 关键值, 防止再回退成"看着像"的复制品:
// 未选中 = 2dp outline 内描边 + 16dp thumb @8,8; 选中 = 24dp thumb @4,24; button 原生可聚焦
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { Switch } from './shared'

function renderSwitch(checked: boolean, onChange = vi.fn()) {
  const { container } = render(<Switch checked={checked} onChange={onChange} />)
  const track = container.firstElementChild as HTMLElement
  const thumb = track.firstElementChild as HTMLElement
  return { track, thumb, onChange }
}

describe('Switch (material3 1.3.0 SwitchTokens)', () => {
  it('轨道 52×32, button 元素键盘可操作', () => {
    const { track } = renderSwitch(false)
    expect(track.tagName).toBe('BUTTON')
    expect(track.getAttribute('role')).toBe('switch')
    expect(track.style.width).toBe('52px')
    expect(track.style.height).toBe('32px')
  })

  it('未选中: 2dp outline 内描边, thumb 16dp @ top8/left8 (outline 色)', () => {
    const { track, thumb } = renderSwitch(false)
    expect(track.style.boxShadow).toContain('inset 0 0 0 2px')
    expect(thumb.style.width).toBe('16px')
    expect(thumb.style.height).toBe('16px')
    expect(thumb.style.top).toBe('8px')
    expect(thumb.style.left).toBe('8px')
  })

  it('选中: 无描边, thumb 24dp @ top4/left24 (maxBound=(52-24)-4)', () => {
    const { track, thumb } = renderSwitch(true)
    expect(track.style.boxShadow).toBe('none')
    expect(thumb.style.width).toBe('24px')
    expect(thumb.style.height).toBe('24px')
    expect(thumb.style.top).toBe('4px')
    expect(thumb.style.left).toBe('24px')
  })

  it('点击取反回调; aria-checked 反映状态', () => {
    const { track, onChange } = renderSwitch(false)
    expect(track.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(track)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
