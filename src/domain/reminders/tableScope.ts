import type { Table } from '../../data/types'

/** Automatic scope follows selection until the first manual choice freezes the switches. */
export function resolveReminderTableScope(tables: Table[], selectedId?: number): Table[] {
  const customized = tables.some(table => table.reminderOverride != null)
  const selected = tables.find(table => table.id === selectedId) ?? tables.find(table => table.isDefault === 1) ?? tables[0]
  return tables.map(table => ({ ...table, reminderEnabled: (customized ? table.reminderOverride === true : table.id === selected?.id && table.reminderEnabled !== 0) ? 1 : 0 }))
}
