import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { db } from '../data/db'
import { ScheduleView } from './ScheduleView'
import { initI18n } from '../i18n'

const layout = vi.hoisted(() => ({ grouped: false }))
vi.mock('../components/schedule/toolbarLayout', () => ({ toolbarLayout: () => ({ inset: 0, gap: 0, internal: 0, sideScale: 1, fitScale: 1, grouped: layout.grouped }) }))
beforeAll(() => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
beforeEach(async () => {
  layout.grouped = false
  await db.timetables.add({ id: 1, name: '边界课表', isDefault: 1, periodTableId: null, timeJson: '[{"node":1,"start":"08:00","end":"08:45"}]', smartConfigJson: '', startDate: '2026-09-07', nodeCount: 12, maxWeek: 20, createdAt: 0 })
})
afterEach(async () => { cleanup(); await db.delete(); await db.open() })

describe('native week control panes', () => {
  it('keeps the full week row ordinary and its three controls independent', async () => {
    render(<ScheduleView />)
    await screen.findByTitle('切换课表')
    const group = document.querySelector<HTMLElement>('.week-controls')!
    expect(group.hasAttribute('data-glass-role')).toBe(false)
    expect(group.hasAttribute('data-glass-group')).toBe(false)
    expect(screen.getByTitle('上一周').dataset.glassIcon).toBe('true')
    expect(group.querySelector<HTMLElement>('.week-label')!.dataset.glassRole).toBe('regular')
    expect(group.querySelector<HTMLElement>('.week-label')!.hasAttribute('data-glass-tint')).toBe(false)
    expect(screen.getByTitle('下一周').dataset.glassRole).toBe('regular')
  })
  it('shares one grouped pane and portals the menu beyond child suppression', async () => {
    layout.grouped = true
    render(<ScheduleView />)
    await screen.findByTitle('切换课表')
    const group = document.querySelector<HTMLElement>('.week-controls')!
    expect(group.dataset.glassRole).toBe('regular')
    expect(group.dataset.glassGroup).toBe('true')
    expect(group.querySelector('[data-glass-role]')).toBeNull()
    fireEvent.click(group.querySelector<HTMLElement>('.week-label')!)
    const menu = document.querySelector<HTMLElement>('[data-glass-role="menu"]')!
    expect(menu.dataset.glassMotion).toBe('static')
    expect(menu.closest('[data-glass-group]')).toBeNull()
    const chosen = menu.querySelector<HTMLElement>('[data-glass-selected="true"]')!
    expect(chosen.dataset.glassTint).toBe('var(--md-primary)')
    expect(chosen.style.width).toBe('40px')
  })
  it('keeps the week menu within twelve-pixel viewport margins at the narrowest layout', async () => {
    const previousWidth = window.innerWidth
    window.innerWidth = 240
    try {
      render(<ScheduleView />)
      await screen.findByTitle('切换课表')
      fireEvent.click(document.querySelector<HTMLElement>('.week-label')!)
      const menu = document.querySelector<HTMLElement>('[data-glass-role="menu"]')!
      expect(menu.style.width).toBe('216px')
      expect(menu.style.left).toBe('50%')
      expect(menu.style.maxWidth).toBe('calc(100vw - 24px)')
    } finally { window.innerWidth = previousWidth }
  })
})
