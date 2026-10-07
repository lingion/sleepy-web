import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePrefsStore } from '../../state/prefsStore'
import { initI18n } from '../../i18n'
import { PeriodHeaderSettingsPage } from './PeriodHeaderSettingsPage'

beforeAll(() => {
  initI18n('zh-CN')
  ;(window as unknown as { matchMedia: (query: string) => { matches: boolean } }).matchMedia = () => ({ matches: false })
})

beforeEach(async () => {
  localStorage.clear()
  await usePrefsStore.getState().load()
})

afterEach(cleanup)

describe('PeriodHeaderSettingsPage', () => {
  it('shows each preview and opens the hanging slider only for three-line layout', async () => {
    await usePrefsStore.getState().update({ periodHeaderLayout: 'three_line' })
    render(<PeriodHeaderSettingsPage onBack={() => {}} />)

    const cardLabels = screen.getAllByRole('button').map((button) => button.textContent ?? '')
    expect(cardLabels.some((label) => label.includes('1') && label.includes('2') && label.includes('3'))).toBe(true)
    expect(cardLabels.some((label) => label.includes('一') && label.includes('二') && label.includes('三'))).toBe(true)
    expect(cardLabels.some((label) => label.includes('壹') && label.includes('贰') && label.includes('叁'))).toBe(true)
    expect(cardLabels.some((label) => label.includes('①') && label.includes('②') && label.includes('③'))).toBe(true)
    expect(cardLabels.some((label) => label.includes('Ⅰ') && label.includes('Ⅱ') && label.includes('Ⅲ'))).toBe(true)
    expect(screen.getByRole('slider', { name: /左右移动 \+0\.0 个开始时间宽度/ })).toBeTruthy()
  })

  it('updates hanging preview label during dragging but saves only when the pointer is released', async () => {
    await usePrefsStore.getState().update({ periodHeaderLayout: 'three_line', periodHeaderHanging: 0 })
    const update = vi.spyOn(usePrefsStore.getState(), 'update')
    render(<PeriodHeaderSettingsPage onBack={() => {}} />)
    const slider = screen.getByRole('slider', { name: /左右移动 \+0\.0 个开始时间宽度/ }) as HTMLInputElement

    fireEvent.change(slider, { target: { value: '0.5' } })
    const hangingLabel = screen.getAllByText(/左右移动/)[0]
    await waitFor(() => expect(hangingLabel.textContent).toContain('+0.5'))
    expect(update).not.toHaveBeenCalledWith({ periodHeaderHanging: 0.5 })

    fireEvent.pointerUp(slider)
    await waitFor(() => expect(update).toHaveBeenCalledWith({ periodHeaderHanging: 0.5 }))
  })
})
