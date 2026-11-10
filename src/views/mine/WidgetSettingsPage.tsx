import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { hydratedWith } from '../../data/types'
import { usePrefsStore, resolveIsDark } from '../../state/prefsStore'
import { SettingsScaffold, SectionHeader, ToggleRow, SettingsCard } from './shared'
import { courseNeutralTokens } from '../../theme/themes'
import { pickCourseColor, parseHex, rgbToHex, textColorOn } from '../../domain/courseColor'
import { coursesForDate, dateOfWeekIso, projectWeekCourses, weekOfDate } from '../../domain/courseOccurrence'
import { getHolidayTransfers } from '../../state/holidayStore'
import { currentWeek } from '../../domain/semester'
import { courseTimeParts } from '../../domain/timeTable'
import { EntryRow } from './GeneralSettingsPage'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'

export function WidgetSettingsPage({ onBack, onOpenScheduleDisplay = () => {}, onOpenManagement = () => {} }: { onOpenManagement?: () => void; onBack: () => void; onOpenScheduleDisplay?: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore(s => s.prefs)
  const update = usePrefsStore(s => s.update)
  const data = useLiveQuery(async () => {
    const raw = await db.timetables.where('isDefault').equals(1).first()
    if (!raw) return null
    const table = hydratedWith(raw, raw.periodTableId ? await db.periodTables.get(raw.periodTableId) : null)
    return { table, courses: await db.courses.where('tableId').equals(table.id).toArray() }
  }, [])
  const [mode, setMode] = useState(2)
  const [gallery, setGallery] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [offset, setOffset] = useState(0)
  const dark = resolveIsDark(prefs)
  const tokens = courseNeutralTokens(dark)
  const now = new Date()
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const week = data ? Math.max(1, Math.min(data.table.maxWeek, currentWeek(data.table.startDate, now) + offset)) : 1
  const transfers = data ? getHolidayTransfers(data.table.id) : []
  const projected = data ? projectWeekCourses(data.table, week, data.courses, transfers) : []
  let todayDate = iso
  let todayCourses = data ? coursesForDate(iso, data.table.startDate, data.table.maxWeek, data.courses, transfers) : []
  if (data && prefs.nearestBusyDay && !todayCourses.length && data.table.startDate) {
    for (let delta = 1; delta <= data.table.maxWeek * 7; delta++) {
      const day = new Date(`${iso}T12:00:00`)
      day.setDate(day.getDate() + delta)
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      if (weekOfDate(data.table.startDate, date) > data.table.maxWeek) break
      const rows = coursesForDate(date, data.table.startDate, data.table.maxWeek, data.courses, transfers)
      if (rows.length) { todayDate = date; todayCourses = rows; break }
    }
  }
  const names = t('@day_names', { returnObjects: true }) as string[]
  const days = mode === 0 ? [new Date(`${todayDate}T12:00:00`).getDay() || 7] : prefs.visibleDays
  return <SettingsScaffold title={t('mine_widget', '桌面小组件')} onBack={onBack}>
    <EntryRow title={t('widget_manage_entry')} onClick={onOpenManagement} />
    <EntryRow title={t('web_widget_live_preview')} onClick={() => setGallery(!gallery)} />
    <p className="m3-body-small" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>{t('web_widget_settings_unavailable')}</p>
    {gallery && <section style={{ display: 'grid', gap: 12 }}>
      <SegmentedSwitcher options={[t('tab_today'), t('settings_start_view_full'), t('settings_start_view_cards')]} selected={mode} onSelect={setMode} />
      {mode !== 0 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button data-glass-role="tinted" data-glass-tint="var(--md-secondary-container)" type="button" className="m3-button-tonal" disabled={week <= 1} onClick={() => setOffset(offset - 1)} aria-label={t('schedule_prev_week')}>‹</button>
        <span>{t('schedule_week_prefix', { v1: week })}</span>
        <button data-glass-role="tinted" data-glass-tint="var(--md-secondary-container)" type="button" className="m3-button-tonal" disabled={!data || week >= data.table.maxWeek} onClick={() => setOffset(offset + 1)} aria-label={t('schedule_next_week')}>›</button>
      </div>}
      <div data-widget-preview={['today', 'week', 'grid'][mode]} style={{ padding: 12, borderRadius: 20, background: 'var(--md-surface-container)', display: 'grid', gridTemplateColumns: mode === 2 ? `repeat(${Math.max(1, days.length)}, minmax(0, 1fr))` : '1fr', gap: 6, minHeight: 160 }}>
        {days.map(day => {
          const rows = (mode === 0 ? todayCourses : projected.filter(course => course.day === day)).sort((a, b) => a.startNode - b.startNode)
          return <div key={day} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: prefs.widgetSeparator ? 6 : 2 }}>
            <div className="m3-label-small" style={{ textAlign: 'center' }}>{mode === 0 ? todayDate : names[day - 1]}{mode !== 0 && prefs.showDate && data?.table.startDate && <div>{dateOfWeekIso(data.table.startDate, week, day).slice(5)}</div>}</div>
            {rows.map((course, index) => {
              const color = pickCourseColor(course, dark, tokens.neutral, prefs.widgetColorless)
              const text = rgbToHex(textColorOn(parseHex(color) ?? [255, 255, 255], dark, parseHex(tokens.onSurface) ?? [0, 0, 0]))
              return <div key={`${course.id}-${index}`} style={{ padding: mode === 2 ? '8px 4px' : 12, minWidth: 0, borderRadius: 8, background: color, color: text, fontSize: 12, overflowWrap: 'anywhere' }}>
                {prefs.widgetUseAlias && course.alias ? course.alias : course.courseName}<br />{course.room}<br />{data && courseTimeParts(course.startNode, course.step, data.table.timeJson, course.ownTime, course.startTime, course.endTime)?.join('–')}
              </div>
            })}
          </div>
        })}
        {!(mode === 0 ? todayCourses : projected).length && <p style={{ gridColumn: '1 / -1' }}>{t('no_courses', '暂无课程')}</p>}
      </div>
    </section>}
    <SettingsCard title={t('settings_widget_global_appearance')} expanded={expanded} onToggle={() => setExpanded(!expanded)}>
      <ToggleRow label={t('settings_widget_colorless')} subtitle={t('settings_widget_colorless_sub')} checked={prefs.widgetColorless} onChange={v => void update({ widgetColorless: v })} />
      <ToggleRow label={t('settings_widget_separator')} subtitle={t('settings_widget_separator_sub')} checked={prefs.widgetSeparator} onChange={v => void update({ widgetSeparator: v })} />
    </SettingsCard>
    <EntryRow title={t('settings_widget_shared_display')} onClick={onOpenScheduleDisplay} />
    <SectionHeader title={t('settings_widget_advanced')} />
    <ToggleRow label={t('settings_widget_vert_punct_experimental')} subtitle={t('settings_vert_punct_sub')} checked={prefs.vertPunct} onChange={v => void update({ vertPunct: v })} />
  </SettingsScaffold>
}
