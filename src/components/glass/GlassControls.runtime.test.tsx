import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { GlassControls } from './GlassControls'
import { prepareGlassRuntime } from './runtime'

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  document.body.replaceChildren(); delete document.documentElement.dataset.uiStyle
})

describe('declared controls material updates', () => {
  it('retains an unchanged definition and tracks both native and accessible disabled tint', async () => {
    vi.stubGlobal('CanvasRenderingContext2D', class {})
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (w: number, h: number) => ({data: new Uint8ClampedArray(w * h * 4)}), putImageData() {},
    }) as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,controls')
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(48)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(48)
    await prepareGlassRuntime('liquid_glass')
    render(<><GlassControls style="liquid_glass"/><button data-glass-role="tinted" data-glass-tint="#6750a4">保存</button></>)
    const button = screen.getByRole<HTMLButtonElement>('button'), url = button.style.getPropertyValue('--glass-optics-filter')
    const tint = button.style.getPropertyValue('--glass-style-tint')
    const change = async (fn: () => void) => { await act(async () => { fn(); await Promise.resolve(); await Promise.resolve() }) }
    await change(() => { button.dataset.glassMotion = 'static' })
    expect(button.style.getPropertyValue('--glass-optics-filter')).toBe(url)
    expect(button.classList.contains('glass-surface')).toBe(true)
    await change(() => { button.disabled = true })
    expect(button.style.getPropertyValue('--glass-style-tint')).toBe('rgba(253, 253, 253, 0.5411764705882353)')
    await change(() => { button.disabled = false; button.setAttribute('aria-disabled', 'true') })
    expect(button.style.getPropertyValue('--glass-style-tint')).toBe('rgba(253, 253, 253, 0.5411764705882353)')
    await change(() => { button.dataset.glassSelected = 'true' })
    expect(button.style.getPropertyValue('--glass-style-tint')).toBe(tint)
    await change(() => { button.dataset.glassSelected = 'false'; button.removeAttribute('aria-disabled') })
    expect(button.style.getPropertyValue('--glass-style-tint')).toBe(tint)
    expect(document.querySelectorAll('filter')).toHaveLength(1)
  })
})
