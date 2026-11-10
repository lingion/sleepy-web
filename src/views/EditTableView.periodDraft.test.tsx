import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../data/db'
import type { PeriodTable } from '../data/types'
import { initI18n } from '../i18n'
import { EditTableView } from './EditTableView'

const mocks = vi.hoisted(() => ({ loadPeriodTables: vi.fn(), executePolicyAndSave: vi.fn(), getTablesBoundTo: vi.fn() }))
vi.mock('../data/repository', async original => ({ ...await original<typeof import('../data/repository')>(), ...mocks }))
const periods: PeriodTable[] = ['14:00', '19:00'].map((start, i) => ({ id: i + 2, name: ['下午作息', '晚间作息'][i], nodesPerDay: 1, timeJson: JSON.stringify([{ node: 1, start, end: `${start.slice(0, 2)}:30` }]), smartConfigJson: '', createdAt: 0, updatedAt: 0 }))
const props = { tableId: 1, onBack() {}, onSaved() {}, onDeleted() {} }
beforeAll(() => initI18n('zh-CN'))
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.loadPeriodTables.mockResolvedValue(periods)
  mocks.executePolicyAndSave.mockResolvedValue(undefined)
  mocks.getTablesBoundTo.mockResolvedValue(1)
  await db.timetables.put({ id: 1, name: '学期课表', isDefault: 1, startDate: '2026-09-07', maxWeek: 20, nodeCount: 1, periodTableId: 2, smartConfigJson: '', timeJson: '[{"node":1,"start":"08:00","end":"08:45"}]', createdAt: 0 })
})
afterEach(async () => { cleanup(); await db.delete(); await db.open() })
async function expand() { fireEvent.click(await screen.findByRole('button', { name: /节次时间表/ })) }
describe('课表作息草稿来源与同步', () => {
  it('waits for the bound period table instead of seeding stale compatibility clocks', async () => {
    let resolve!: (tables: PeriodTable[]) => void
    mocks.loadPeriodTables.mockImplementation(() => new Promise<PeriodTable[]>(done => { resolve = done }))
    render(<EditTableView {...props} />)
    await waitFor(() => expect(mocks.loadPeriodTables).toHaveBeenCalled())
    // Let the course-table read finish before the slower independent period-table query.
    await act(async () => { await db.timetables.get(1) })
    await act(async () => resolve(periods))
    await expand()
    expect((await screen.findByDisplayValue('14:00') as HTMLInputElement).value).toBe('14:00')
    expect(screen.queryByDisplayValue('08:00')).toBeNull()
  })
  it('replaces the draft immediately after selecting a different period table', async () => {
    render(<EditTableView {...props} />)
    await expand()
    fireEvent.click(screen.getByRole('button', { name: '作息表' }))
    fireEvent.click(screen.getByRole('button', { name: /晚间作息/ }))
    fireEvent.click(screen.getByRole('button', { name: '手动模式' }))
    expect((await screen.findByDisplayValue('19:00') as HTMLInputElement).value).toBe('19:00')
    expect(screen.queryByDisplayValue('14:00')).toBeNull()
  })
  it('keeps edited automatic config and clocks together through shared-schedule policy selection', async () => {
    render(<EditTableView {...props} />)
    await expand()
    fireEvent.click(screen.getByRole('button', { name: '自动模式' }))
    fireEvent.change(screen.getByLabelText(/^每节时长/), { target: { value: '40' } })
    expect((screen.getByLabelText(/^每节时长/) as HTMLInputElement).value).toBe('40')
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    const dialog = await screen.findByRole('dialog')
    expect(mocks.executePolicyAndSave).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /同步/ }))
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    await waitFor(() => expect(mocks.executePolicyAndSave).toHaveBeenCalledTimes(1))
    const args = mocks.executePolicyAndSave.mock.calls[0]
    expect(JSON.parse(args[2])[0]).toMatchObject({ start: '14:00', end: '14:40' })
    expect(JSON.parse(args[3]).periodMinutes).toBe(40)
    expect(args[6]).toMatchObject({ timeJson: args[2], smartConfigJson: args[3] })
  })
  it('cancels only the period draft while retaining the edited course-table name', async () => {
    render(<EditTableView {...props} />)
    await expand()
    fireEvent.change(screen.getByDisplayValue('学期课表'), { target: { value: '已改名称' } })
    fireEvent.change(await screen.findByDisplayValue('14:00'), { target: { value: '13:50' } })
    fireEvent.click(screen.getByRole('button', { name: /保存/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /取消/ }))
    expect(await screen.findByDisplayValue('14:00')).toBeTruthy()
    expect(screen.getByDisplayValue('已改名称')).toBeTruthy()
    expect(mocks.executePolicyAndSave).not.toHaveBeenCalled()
  })
})
