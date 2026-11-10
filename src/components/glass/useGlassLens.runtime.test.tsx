import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useGlassLens } from './useGlassLens'
import { prepareGlassRuntime } from './runtime'

afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  document.body.replaceChildren(); delete document.documentElement.dataset.uiStyle
})

describe('lens optics mode lifecycle', () => {
  it('pays no PNG/SVG cost in classic, installs when enabled, and releases on mode changes and unmount', async () => {
    vi.stubGlobal('CanvasRenderingContext2D', class {})
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (w: number, h: number) => ({data: new Uint8ClampedArray(w * h * 4)}), putImageData() {},
    }) as unknown as CanvasRenderingContext2D)
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,lifecycle')
    const track = document.createElement('div')
    track.innerHTML = '<span class="segment-lens"></span><div class="glass-content-warp"></div>'
    Object.defineProperties(track, {offsetWidth: {value: 364}, offsetHeight: {value: 42}})
    for (const child of track.children) {
      Object.defineProperties(child, {offsetWidth: {value: 119}, offsetHeight: {value: 34}})
      ;(child as HTMLElement).style.borderRadius = '999px'
    }
    document.body.appendChild(track); document.documentElement.dataset.uiStyle = 'classic'
    const { result, rerender, unmount } = renderHook(({ enabled }) => useGlassLens({current: track}, {kind: 'segment', index: 1, count: 3, enabled}), {initialProps: {enabled: true}})
    expect(encode).not.toHaveBeenCalled(); expect(document.querySelectorAll('filter')).toHaveLength(0)
    const mode = async (value: 'classic' | 'liquid_glass') => {
      await prepareGlassRuntime(value)
      await act(async () => { document.documentElement.dataset.uiStyle = value; await Promise.resolve() })
    }
    await mode('liquid_glass')
    expect(document.querySelectorAll('filter')).toHaveLength(2); expect(encode).toHaveBeenCalled()
    act(() => result.current.press(100, 20)); expect(requestAnimationFrame).toHaveBeenCalled()
    await mode('classic')
    expect(document.querySelectorAll('filter')).toHaveLength(0); expect(cancelAnimationFrame).toHaveBeenCalled()
    const count = encode.mock.calls.length
    act(() => result.current.press(100, 20)); expect(encode).toHaveBeenCalledTimes(count)
    await mode('liquid_glass'); expect(document.querySelectorAll('filter')).toHaveLength(2)
    rerender({enabled: false}); expect(document.querySelectorAll('filter')).toHaveLength(0)
    rerender({enabled: true}); expect(document.querySelectorAll('filter')).toHaveLength(2)
    unmount(); expect(document.querySelectorAll('filter')).toHaveLength(0)
  })
})
