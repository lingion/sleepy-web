import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { IntRangeSlider } from './IntRangeSlider'
import { SliderRow } from '../views/mine/shared'
afterEach(cleanup)
describe('two endpoint course range', () => {
  it('keeps a single-value baseline across committed values and clears it on return',()=>{
    const onCommit=vi.fn()
    const {rerender}=render(<SliderRow label="悬挂" value={0} min={-1} max={1} step={.1} onCommit={onCommit}/>)
    fireEvent.change(screen.getByRole('slider'),{target:{value:.4}})
    expect(document.querySelector('[data-slider-ghost]')).not.toBeNull()
    fireEvent.pointerUp(screen.getByRole('slider'))
    expect(onCommit).toHaveBeenLastCalledWith(.4)
    rerender(<SliderRow label="悬挂" value={.4} min={-1} max={1} step={.1} onCommit={onCommit}/>)
    expect(document.querySelector('[data-slider-ghost]')).not.toBeNull()
    fireEvent.change(screen.getByRole('slider'),{target:{value:0}})
    expect(document.querySelector('[data-slider-ghost]')).toBeNull()
  })
  it('keeps the opposite end pinned and shows the original range only when changed', () => {
    const onChange = vi.fn()
    const { rerender } = render(<IntRangeSlider label="节次" max={12} start={2} end={5} initialStart={2} initialEnd={5} onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('slider', { name: '节次 开始' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(3, 5)
    expect(document.querySelector('[data-range-ghost]')).toBeNull()
    rerender(<IntRangeSlider label="节次" max={12} start={3} end={5} initialStart={2} initialEnd={5} onChange={onChange} />)
    expect(document.querySelector('[data-range-ghost]')).not.toBeNull()
    fireEvent.keyDown(screen.getByRole('slider', { name: '节次 结束' }), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(3, 3)
    rerender(<IntRangeSlider label="节次" max={12} start={2} end={5} initialStart={2} initialEnd={5} onChange={onChange} />)
    expect(document.querySelector('[data-range-ghost]')).toBeNull()
  })
})
