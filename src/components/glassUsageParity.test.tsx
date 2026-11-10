import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AlertDialog, TextButton } from './AlertDialog'
import { DialogActionButtons } from './DialogActionButtons'
import { LanguageMenu } from '../views/mine/LanguageMenu'
import { initI18n } from '../i18n'

beforeAll(() => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(cleanup)

describe('native glass usage boundaries', () => {
  it('keeps alert optics static while its explicit actions remain eligible', () => {
    render(<AlertDialog title="确认" onDismiss={() => {}}><DialogActionButtons confirmText="保存" onConfirm={() => {}} dismissText="取消" /></AlertDialog>)
    expect(screen.getByRole('dialog').dataset.glassRole).toBe('alert')
    expect(screen.getByRole('dialog').dataset.glassMotion).toBe('static')
    expect(screen.getByRole('button', { name: '保存' }).dataset.glassTint).toBe('var(--md-primary)')
    expect(screen.getByRole('button', { name: '取消' }).dataset.glassTint).toBe('var(--md-secondary-container)')
  })
  it('allows Material dialog and text actions to explicitly stay ordinary', () => {
    render(<AlertDialog glassRole={false} title="备份" onDismiss={() => {}} buttons={<TextButton glassRole={false} label="取消" onClick={() => {}} />}>内容</AlertDialog>)
    expect(screen.getByRole('dialog').hasAttribute('data-glass-role')).toBe(false)
    expect(screen.getByRole('button').hasAttribute('data-glass-role')).toBe(false)
  })
  it('gives the language popup one menu pane and leaves anchor and selected row ordinary', () => {
    render(<LanguageMenu lang="zh-CN" onChange={() => {}} />)
    const anchor = screen.getByRole('button', { name: /简体中文/ })
    expect(anchor.hasAttribute('data-glass-role')).toBe(false)
    fireEvent.click(anchor)
    expect(screen.getByRole('menu').dataset.glassRole).toBe('menu')
    expect(screen.getByRole('menu').dataset.glassMotion).toBe('static')
    for (const item of screen.getAllByRole('menuitemradio')) expect(item.hasAttribute('data-glass-role')).toBe(false)
    expect(screen.getByRole('menuitemradio', { name: '简体中文' }).getAttribute('aria-checked')).toBe('true')
  })
})
