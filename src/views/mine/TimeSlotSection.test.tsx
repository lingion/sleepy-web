import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { initI18n } from '../../i18n'
import { DEFAULT_SMART_CONFIG } from '../../domain/smartPeriod'
import type { TimeSlotRow } from '../../domain/timeTable'
import { TimeSlotSection } from './TimeSlotSection'

beforeAll(() => initI18n('zh-CN'))
afterEach(cleanup)
const initial: TimeSlotRow[] = [
  { node: 0, start: '07:00', end: '07:30', edgeClass: 'before' },
  { node: 1, start: '14:00', end: '14:30', edgeClass: null },
  { node: 2, start: '14:50', end: '15:20', edgeClass: null },
]
function Editor() {
  const [rows, setRows] = useState(initial)
  const [config, setConfig] = useState({ ...DEFAULT_SMART_CONFIG, totalPeriods: 2 })
  return <><TimeSlotSection expanded onToggle={() => {}} rows={rows} onRowsChange={setRows} smartConfig={config} onSmartConfigChange={setConfig} /><output data-testid="rows">{JSON.stringify(rows)}</output></>
}
describe('作息手动和自动模式切换', () => {
  it('opens automatic mode with the current manual clocks and retains edge rows', () => {
    render(<Editor />)
    fireEvent.click(screen.getByRole('button', { name: '自动模式' }))
    expect((screen.getByLabelText(/^每节时长/) as HTMLInputElement).value).toBe('30')
    expect(JSON.parse(screen.getByTestId('rows').textContent!)).toEqual(initial)
  })
  it('applies edited automatic duration to manual rows while preserving gaps and edge rows', () => {
    render(<Editor />)
    fireEvent.click(screen.getByRole('button', { name: '自动模式' }))
    fireEvent.change(screen.getByLabelText(/^每节时长/), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: '手动模式' }))
    expect(JSON.parse(screen.getByTestId('rows').textContent!)).toEqual([
      initial[0], { ...initial[1], end: '14:40' }, { ...initial[2], start: '15:00', end: '15:40' },
    ])
  })
})
