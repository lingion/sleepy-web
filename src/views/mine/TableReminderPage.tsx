import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { setTableReminderEnabled } from '../../data/repository'
import { resolveReminderTableScope } from '../../domain/reminders/tableScope'
import { useReminderStore } from '../../state/reminderStore'
import { SettingsScaffold, ToggleRow } from './shared'

export function TableReminderPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.toArray(), [])
  const master = useReminderStore(state => state.prefs.masterEnabled)
  const [pending, setPending] = useState<number[]>([])
  const [error, setError] = useState('')
  async function toggle(id: number, enabled: boolean) {
    if (pending.includes(id)) return
    setPending(rows => [...rows, id])
    try { await setTableReminderEnabled(id, enabled) }
    catch { setError(t('table_reminder_save_failed')) }
    finally { setPending(rows => rows.filter(row => row !== id)) }
  }
  return <SettingsScaffold title={t('settings_table_reminder_scope')} onBack={onBack}>
    <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>{t(master ? 'table_reminder_subtitle' : 'table_reminder_master_off')}</p>
    {tables?.length === 0 && <p>{t('table_reminder_empty')}</p>}
    {resolveReminderTableScope(tables ?? []).map(table => <div key={table.id} style={{ padding: '0 16px', borderRadius: 16, background: 'var(--md-surface-container)', opacity: pending.includes(table.id) ? .6 : 1, pointerEvents: pending.includes(table.id) ? 'none' : undefined }} aria-busy={pending.includes(table.id)}>
      <ToggleRow label={table.name} checked={table.reminderEnabled !== 0} onChange={enabled => void toggle(table.id, enabled)} />
    </div>)}
    {error && <p role="alert">{error}</p>}
  </SettingsScaffold>
}
