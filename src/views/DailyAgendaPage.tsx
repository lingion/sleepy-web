import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadDailyAgenda } from '../domain/reminders/scheduler'
import { useReminderStore } from '../state/reminderStore'
import { useHolidayStore } from '../state/holidayStore'
import { SettingsScaffold } from './mine/shared'

/** Notification destination reads current data rather than a stale serialized snapshot. */
export function DailyAgendaPage({ date, onBack }: { date: string; onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const prefs = useReminderStore(state => state.prefs)
  const overrides = useHolidayStore(state => state.overrides)
  const [retry, setRetry] = useState(0)
  const result = useLiveQuery(async () => {
    try { return { agenda: (await loadDailyAgenda(date)).agenda, failed: false } }
    catch { return { agenda: null, failed: true } }
  }, [date, prefs, overrides, retry])
  return <SettingsScaffold title={t('agenda_title')} onBack={onBack}>
    <div className="m3-title-medium">{new Date(date + 'T12:00:00').toLocaleDateString(i18n.language, { dateStyle: 'full' })}</div>
    {!result && <p role="status">{t('loading')}</p>}
    {result?.failed && <div role="alert"><p>{t('agenda_load_error')}</p><button className="m3-button-text" onClick={() => setRetry(value => value + 1)}>{t('holiday_data_retry')}</button></div>}
    {result?.agenda && (result.agenda.items.length === 0 ? <p>{t('agenda_empty')}</p> : <>
      <p className="m3-body-medium">{t('agenda_count', { v1: result.agenda.items.length, v2: result.agenda.tableCount })}</p>
      {result.agenda.items.map((item, index) => <article key={index} style={{ padding: 16, borderRadius: 16, background: 'var(--md-surface-container)', display: 'grid', gap: 4 }}>
        <div className="m3-label-large">{item.sources[0].startTime ? `${item.sources[0].startTime}${item.endTime ? `–${item.endTime}` : ''}` : t('agenda_time_unknown')}</div>
        <div className="m3-title-medium">{item.sources[0].course.courseName}</div>
        <div>{item.sources[0].course.room.trim() || t('notif_room_unknown')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{item.sources.map(source => source.table.name.trim() || t('agenda_table_unknown')).join(' · ')}</div>
      </article>)}
    </>)}
  </SettingsScaffold>
}
