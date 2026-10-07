import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SettingsCard, SliderRow, Switch } from './shared'

afterEach(cleanup)

describe('SettingsCard interaction parity', () => {
  it('toggles once from its title or unhandled static content', () => {
    const onToggle = vi.fn()
    render(
      <SettingsCard title="Display options" expanded onToggle={onToggle}>
        <span>Static details</span>
      </SettingsCard>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Display options' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Static details'))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('does not toggle for nested switch, radio, button, or input interactions', () => {
    const onToggle = vi.fn()
    const onRadio = vi.fn()
    const onButton = vi.fn()
    const onInput = vi.fn()
    render(
      <SettingsCard title="Controls" expanded onToggle={onToggle}>
        <Switch checked={false} onChange={() => {}} />
        <div role="radio" aria-checked="false" onClick={onRadio}>Radio option</div>
        <button type="button" onClick={onButton}>Nested action</button>
        <input aria-label="Nested input" onClick={onInput} />
      </SettingsCard>,
    )

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('radio'))
    fireEvent.click(screen.getByRole('button', { name: 'Nested action' }))
    fireEvent.click(screen.getByLabelText('Nested input'))

    expect(onToggle).not.toHaveBeenCalled()
    expect(onRadio).toHaveBeenCalledTimes(1)
    expect(onButton).toHaveBeenCalledTimes(1)
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  it.each(['Enter', ' '])('supports %s keyboard activation without a second parent toggle', (key) => {
    const onToggle = vi.fn()
    render(<SettingsCard title="Keyboard options" expanded={false} onToggle={onToggle}><span>Detail</span></SettingsCard>)
    const title = screen.getByText('Keyboard options').parentElement as HTMLElement
    fireEvent.keyDown(title, { key })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('SliderRow commit semantics', () => {
  it('updates its draft while dragging and persists only on pointer release', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(
      <SliderRow
        label="Scale"
        value={50}
        min={0}
        max={100}
        step={5}
        formatValue={(value) => `${value}%`}
        onChange={onChange}
        onCommit={onCommit}
      />,
    )
    const slider = screen.getByRole('slider', { name: 'Scale' }) as HTMLInputElement

    fireEvent.change(slider, { target: { value: '75' } })
    expect(onChange).toHaveBeenCalledWith(75)
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText((text) => text.replace(/\s+/g, ' ').trim() === 'Scale 75%')).toBeTruthy()

    fireEvent.pointerUp(slider)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(75)
  })

  it('commits keyboard adjustments on key release', () => {
    const onCommit = vi.fn()
    render(<SliderRow label="Scale" value={50} min={0} max={100} step={5} onCommit={onCommit} />)
    const slider = screen.getByRole('slider', { name: 'Scale' }) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '55' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenCalledWith(55)
  })
})
