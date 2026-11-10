import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { GlassControls } from './GlassControls'
import { GlassPressMotion } from './physics'

// Keep the real motion and document events; rasterization is outside this scheduler contract.
vi.mock('./runtime', () => ({
  getPreparedGlassRuntime: () => ({ installLensOptics: () => ({ configure() {}, destroy() {} }) }),
}))

let frames: Map<number, FrameRequestCallback>, now: number, nextFrame: number
let sizes: WeakMap<HTMLElement, { width: number; height: number }>
let observers: TestResizeObserver[], reduceMotion: boolean
class TestResizeObserver {
  targets = new Set<Element>()
  constructor(private callback: ResizeObserverCallback) { observers.push(this) }
  observe(target: Element) { this.targets.add(target) }
  unobserve(target: Element) { this.targets.delete(target) }
  disconnect() { this.targets.clear() }
  notify(target: Element) {
    if (this.targets.has(target)) this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
}

beforeEach(() => {
  frames = new Map(); now = 1000; nextFrame = 0; sizes = new WeakMap(); observers = []; reduceMotion = false
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  vi.stubGlobal('matchMedia', () => ({ matches: reduceMotion }))
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return sizes.get(this)?.width ?? 100 })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return sizes.get(this)?.height ?? 40 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const { width, height } = sizes.get(this) ?? { width: 100, height: 40 }
    return new DOMRect(0, 0, width, height)
  })
})
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  document.body.replaceChildren(); delete document.documentElement.dataset.uiStyle
})

function mountControls(strict = false, count = 1) {
  // Keep targets connected after the effect unmounts, so stale listeners would still be observable.
  const buttons = Array.from({ length: count }, () => {
    const button = document.createElement('button')
    button.dataset.glassRole = 'regular'; button.innerHTML = '<span>Action</span>'
    document.body.appendChild(button)
    return button
  })
  const view = render(strict ? <StrictMode><GlassControls style="liquid_glass" /></StrictMode> : <GlassControls style="liquid_glass" />)
  return { ...view, button: buttons[0], buttons }
}
function pointer(type: string, target: Element, x = 30, y = 20, id = 1) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: id })
  fireEvent(target, event)
}
function advance(milliseconds = 1000 / 60) {
  now += milliseconds
  const pending = [...frames.values()]; frames.clear()
  act(() => pending.forEach(callback => callback(now)))
}
function css(button: HTMLElement, name: string) { return parseFloat(button.style.getPropertyValue(`--glass-${name}`)) }
function expectMotion(button: HTMLElement, motion: GlassPressMotion) {
  expect(css(button, 'lift')).toBeCloseTo(Math.max(0, Math.min(1, motion.lift.value)), 10)
  expect(css(button, 'x')).toBeCloseTo(motion.x.value, 10)
  expect(css(button, 'y')).toBeCloseTo(motion.y.value, 10)
}
function settle(button: HTMLElement, motion: GlassPressMotion, first = true) {
  let ticks = 0
  while (motion.running && ticks < 240) {
    // Advance according to the real spring's convergence, not an arbitrary animation timeout.
    motion.tick(first && ticks === 0 ? 1 / 60 : 1000 / 60 / 1000)
    advance(); expectMotion(button, motion); ticks++
  }
  expect(motion.running).toBe(false)
}
function hold(button: HTMLElement) {
  const motion = new GlassPressMotion(); motion.press()
  pointer('pointerdown', button); settle(button, motion)
  return motion
}
function resize(button: HTMLElement, width: number, height: number) {
  sizes.set(button, { width, height })
  act(() => observers.forEach(observer => observer.notify(button)))
}
function trackSizeReads(button: HTMLElement) {
  const width = vi.fn(() => sizes.get(button)?.width ?? 100), height = vi.fn(() => sizes.get(button)?.height ?? 40)
  Object.defineProperties(button, { offsetWidth: { configurable: true, get: width }, offsetHeight: { configurable: true, get: height } })
  return { width, height }
}

describe('ordinary glass idle scheduling', () => {
  it('sleeps only after complete convergence and does no layout reads or paint during a stable hold', () => {
    const { button } = mountControls()
    hold(button)
    expect(button.classList.contains('glass-moving')).toBe(true)
    expect(css(button, 'lift')).toBe(1)
    expect(frames.size).toBe(0)
    const { width, height } = trackSizeReads(button)
    const paint = vi.spyOn(button.style, 'setProperty')
    advance(60_000)
    expect(frames.size).toBe(0); expect(width).not.toHaveBeenCalled(); expect(height).not.toHaveBeenCalled(); expect(paint).not.toHaveBeenCalled()
  })

  it.each(['pointerup', 'pointercancel'])('wakes on two-axis drag and %s after sleeping, with no idle time added to the spring', release => {
    const { button } = mountControls()
    const motion = hold(button)
    advance(60_000)
    motion.drag(35, -25, 40); pointer('pointermove', button, 65, -5)
    expect(frames.size).toBe(1)
    motion.tick(1 / 60); advance(); expectMotion(button, motion)
    expect(css(button, 'x')).toBeGreaterThan(0); expect(css(button, 'x')).toBeLessThan(motion.x.target)
    expect(css(button, 'y')).toBeLessThan(0)
    // A missed frame during motion must still use its full elapsed time.
    motion.tick(.25); advance(250); expectMotion(button, motion)
    settle(button, motion, false); expect(frames.size).toBe(0)
    motion.drag(-50, 30, 40); pointer('pointermove', button, -20, 50)
    settle(button, motion); expect(css(button, 'x')).toBeLessThan(0); expect(css(button, 'y')).toBeGreaterThan(0)
    expect(frames.size).toBe(0)
    advance(30_000)
    motion.release(); pointer(release, document.body)
    expect(frames.size).toBe(1)
    settle(button, motion)
    expect(css(button, 'lift')).toBe(0); expect(css(button, 'x')).toBe(0); expect(css(button, 'y')).toBe(0)
    expect(button.classList.contains('glass-moving')).toBe(false); expect(frames.size).toBe(0)
    expect(observers.every(observer => !observer.targets.has(button))).toBe(true)
  })

  it('updates both scale axes on resize while held and asleep, without polling or another frame loop', () => {
    const { button } = mountControls()
    hold(button)
    expect(css(button, 'scale-x')).toBeCloseTo(1.16)
    const { width, height } = trackSizeReads(button)
    resize(button, 200, 80)
    expect(css(button, 'scale-x')).toBeCloseTo(1.08); expect(css(button, 'scale-y')).toBeCloseTo(1.08)
    expect(frames.size).toBe(0)
    expect(width).toHaveBeenCalledTimes(1); expect(height).toHaveBeenCalledTimes(1)
    width.mockClear(); height.mockClear(); advance(10_000)
    expect(width).not.toHaveBeenCalled(); expect(height).not.toHaveBeenCalled()
    resize(button, 40, 50)
    expect(css(button, 'scale-x')).toBe(1.25); expect(css(button, 'scale-y')).toBe(1.25)
    expect(frames.size).toBe(0)
  })

  it('does not repaint a sleeping held control when another control is moving', () => {
    const { buttons: [first, second] } = mountControls(false, 2)
    hold(first)
    const { width } = trackSizeReads(first), paint = vi.spyOn(first.style, 'setProperty')
    const motion = new GlassPressMotion(); motion.press()
    pointer('pointerdown', second, 30, 20, 2); settle(second, motion)
    expect(width).not.toHaveBeenCalled(); expect(paint).not.toHaveBeenCalled(); expect(frames.size).toBe(0)
    pointer('pointerup', first)
    expect(frames.size).toBe(1)
  })

  it('preserves the quick-release lift gate and the entire original spring trajectory', () => {
    const { button } = mountControls()
    const motion = new GlassPressMotion(); motion.press(); motion.release()
    pointer('pointerdown', button); pointer('pointerup', button)
    let peak = 0, ticks = 0
    while (motion.running && ticks < 240) {
      motion.tick(1 / 60); advance(); expectMotion(button, motion)
      peak = Math.max(peak, css(button, 'lift')); ticks++
    }
    expect(peak).toBeGreaterThanOrEqual(.975); expect(motion.running).toBe(false)
    expect(css(button, 'lift')).toBe(0); expect(frames.size).toBe(0)
  })

  it.each([false, true])('cleans observers, frames and document listeners after StrictMode unmount (settled=%s)', settled => {
    const { button, unmount } = mountControls(true)
    if (settled) hold(button)
    else { pointer('pointerdown', button); advance() }
    expect(observers.some(observer => observer.targets.has(button))).toBe(true)
    unmount()
    expect(frames.size).toBe(0); expect(observers.every(observer => observer.targets.size === 0)).toBe(true)
    expect(button.matches('.glass-control,.glass-moving')).toBe(false)
    const paint = vi.spyOn(button.style, 'setProperty')
    // Re-add eligibility to expose any leaked document handler after effect teardown.
    button.classList.add('glass-control')
    pointer('pointerdown', button); pointer('pointermove', button, 60, 50); pointer('pointerup', button)
    resize(button, 300, 80); advance()
    expect(frames.size).toBe(0); expect(paint).not.toHaveBeenCalled()
  })

  it('keeps reduced motion immediate, ignores drag and updates held size without frames', () => {
    reduceMotion = true
    const { button } = mountControls()
    pointer('pointerdown', button)
    expect(css(button, 'lift')).toBe(1); expect(frames.size).toBe(0)
    pointer('pointermove', button, 80, 60)
    expect(css(button, 'x')).toBe(0); expect(css(button, 'y')).toBe(0)
    resize(button, 200, 80)
    expect(css(button, 'scale-x')).toBeCloseTo(1.08); expect(frames.size).toBe(0)
    pointer('pointerup', button)
    expect(css(button, 'lift')).toBe(0); expect(frames.size).toBe(0)
    expect(button.classList.contains('glass-moving')).toBe(false)
    expect(observers.every(observer => observer.targets.size === 0)).toBe(true)
  })

  it.each(['native', 'aria', 'ancestor'])('does not start motion or size observation for %s-disabled input', disabled => {
    const { button } = mountControls()
    if (disabled === 'native') button.disabled = true
    else if (disabled === 'aria') button.setAttribute('aria-disabled', 'true')
    else button.firstElementChild!.setAttribute('aria-disabled', 'true')
    pointer('pointerdown', button.firstElementChild!)
    expect(frames.size).toBe(0); expect(button.style.getPropertyValue('--glass-lift')).toBe('')
    expect(button.classList.contains('glass-moving')).toBe(false)
    expect(observers.every(observer => observer.targets.size === 0)).toBe(true)
  })

  it('releases held motion and size observation on classic mode and declaration removal', async () => {
    const { button, rerender } = mountControls()
    hold(button)
    await act(async () => { delete button.dataset.glassRole })
    expect(observers.every(observer => observer.targets.size === 0)).toBe(true)
    advance(); expect(frames.size).toBe(0)
    await act(async () => { button.dataset.glassRole = 'regular' })
    pointer('pointerdown', button); advance()
    rerender(<GlassControls style="classic" />)
    expect(frames.size).toBe(0); expect(observers.every(observer => observer.targets.size === 0)).toBe(true)
    expect(button.style.getPropertyValue('--glass-lift')).toBe('')
    pointer('pointermove', button, 70, 80); pointer('pointerup', button); resize(button, 200, 80)
    expect(frames.size).toBe(0); expect(button.style.getPropertyValue('--glass-lift')).toBe('')
  })
})
