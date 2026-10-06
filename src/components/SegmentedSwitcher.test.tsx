import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SegmentedSwitcher } from './SegmentedSwitcher'

afterEach(() => cleanup())

describe('SegmentedSwitcher (SegmentedSwitcher.kt 1:1)', () => {
  it('uses r14 / padding 4 / height 42 on surfaceContainer by default', () => {
    const { container } = render(<SegmentedSwitcher options={['周视图', '网格']} selected={0} onSelect={() => {}} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.borderRadius).toBe('14px')
    expect(root.style.padding).toBe('4px')
    expect(root.style.height).toBe('42px')
    expect(root.style.background).toBe('var(--md-surface-container)')
    expect(root.style.width).toBe('100%')
  })

  it('honours containerColor / height and slides a single r12 thumb', () => {
    const { container } = render(
      <SegmentedSwitcher options={['a', 'b', 'c']} selected={2} onSelect={() => {}} height={36} containerColor="var(--md-surface-container-highest)" />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.height).toBe('36px')
    expect(root.style.background).toBe('var(--md-surface-container-highest)')
    const thumb = root.firstElementChild as HTMLElement
    expect(thumb.style.borderRadius).toBe('12px')
    // jsdom 会把 calc 里的 2/3 折算成小数
    expect(thumb.style.left).toMatch(/^calc\(4px \+ 0\.666\d* \* \(100% - 8px\)\)$/)
  })

  it('marks the selected segment SemiBold and reports clicks by index', () => {
    const onSelect = vi.fn()
    render(<SegmentedSwitcher options={['每周', '单周', '双周']} selected={1} onSelect={onSelect} />)
    const selected = screen.getByRole('button', { name: '单周' })
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(selected.style.fontWeight).toBe('600')
    expect(screen.getByRole('button', { name: '每周' }).style.fontWeight).toBe('500')
    fireEvent.click(screen.getByRole('button', { name: '双周' }))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('fit mode sizes to content instead of filling', () => {
    const { container } = render(<SegmentedSwitcher options={['节次', '时间']} selected={0} onSelect={() => {}} fit />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.width).not.toBe('100%')
  })
})
