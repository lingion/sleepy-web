// TimePickerField — DateTimePickers.kt TimePickerField 1:1: 点字段弹 select_time 弹窗,
// 确定写回 HH:MM, 取消不写; 值解析失败时初值 08:00
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TimePickerField } from './DateTimePickers'
import { initI18n } from '../i18n'

beforeAll(() => {
  initI18n('zh-CN')
  // jsdom 无 ResizeObserver (DialogActionButtons 量行宽)
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试替身
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

afterEach(() => {
  cleanup()
})

describe('TimePickerField', () => {
  it('字段只读; 点击弹窗, 确定写回所选时间', () => {
    const onValueChange = vi.fn()
    render(<TimePickerField value="20:00" onValueChange={onValueChange} label="" />)
    const field = screen.getByDisplayValue('20:00') as HTMLInputElement
    expect(field.readOnly).toBe(true)
    fireEvent.click(field)
    const input = screen.getByLabelText('选择时间', { selector: 'input' }) as HTMLInputElement
    expect(input.value).toBe('20:00')
    fireEvent.change(input, { target: { value: '21:30' } })
    fireEvent.click(screen.getByText('确定'))
    expect(onValueChange).toHaveBeenCalledWith('21:30')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('取消不写回; 无法解析的值初值 08:00', () => {
    const onValueChange = vi.fn()
    render(<TimePickerField value="" onValueChange={onValueChange} label="" />)
    fireEvent.click(screen.getByRole('textbox'))
    expect((screen.getByLabelText('选择时间', { selector: 'input' }) as HTMLInputElement).value).toBe('08:00')
    fireEvent.click(screen.getByText('取消'))
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
