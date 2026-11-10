import { describe, it, expect } from 'vitest'
import { resolveReminderTableScope } from './tableScope'
import type { Table } from '../../data/types'
const tables = [{ id: 1, isDefault: 1 }, { id: 2, isDefault: 0 }] as Table[]
describe('v1.0.64 reminder scope', () => {
  it('follows selected table before customization', () => {
    expect(resolveReminderTableScope(tables).map(t => t.reminderEnabled)).toEqual([1, 0])
    expect(resolveReminderTableScope(tables, 2).map(t => t.reminderEnabled)).toEqual([0, 1])
  })
  it('keeps a fully disabled explicit choice after selection changes', () => {
    expect(resolveReminderTableScope(tables.map(t => ({ ...t, reminderOverride: false })), 2).map(t => t.reminderEnabled)).toEqual([0, 0])
  })
  it('retains the old disabled eligibility in automatic mode', () => {
    expect(resolveReminderTableScope([{ ...tables[0], reminderEnabled: 0 }, tables[1]]).map(t => t.reminderEnabled)).toEqual([0, 0])
  })
})
