import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import type { Prefs } from '../../data/types'
import { FlatCard, ToggleRow, SettingsCard } from './shared'
import { TimePickerField } from '../../components/DateTimePickers'
import { useState } from 'react'

export function DisplayOptions({ section }: { section: 'common' | 'week' | 'grid' | 'holiday' }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore(s => s.prefs)
  const update = usePrefsStore(s => s.update)
  const [daysOpen, setDaysOpen] = useState(false)
  const toggle = (key: keyof Prefs, label: string, subtitle?: string) => <ToggleRow key={key} label={t(label)} subtitle={subtitle ? t(subtitle) : undefined} checked={prefs[key] as boolean} onChange={value => void update({ [key]: value })} />
  const card = (key: keyof Prefs, label: string, options: string[], values: unknown[]) => <FlatCard title={t(label)} options={options.map(label => t(label))} selectedKey={values.indexOf(prefs[key])} onSelect={i => void update({ [key]: values[i] })} />
  return <div style={{ display: 'grid', gap: 8, padding: 16, borderRadius: 16, background: 'var(--md-surface-container)' }}>
    {section === 'common' && <>
      {card('startView', 'settings_appearance_default_view', ['settings_start_view_full', 'settings_start_view_cards'], ['full', 'cards'])}
      {toggle('showViewSwitcher', 'settings_show_view_switcher')}
      <SettingsCard title={t('settings_visible_days')} expanded={daysOpen} onToggle={() => setDaysOpen(!daysOpen)}>
        {(t('@day_names', { returnObjects: true }) as string[]).map((name, i) => <ToggleRow key={i} label={name} checked={prefs.visibleDays.includes(i + 1)} onChange={on => {
          const days = on ? [...prefs.visibleDays, i + 1].sort() : prefs.visibleDays.filter(day => day !== i + 1)
          if (days.length) void update({ visibleDays: days })
        }} />)}
      </SettingsCard>
      {toggle('showDate', 'settings_show_date')}
      {card('displayMode', 'settings_display_mode', ['settings_display_node', 'settings_display_time'], ['node', 'time'])}
      {toggle('nearestBusyDay', 'settings_nearest_busy_day', 'settings_nearest_busy_day_sub')}
    </>}
    {section === 'week' && <>
      {toggle('weekTwoColumn', 'settings_week_two_column')}
      {prefs.weekTwoColumn && card('weekTwoColumnMode', 'settings_week_two_column', ['settings_week_two_column_days', 'settings_week_two_column_balance'], ['days', 'balance'])}
      {toggle('weekHideEmptyDays', 'settings_week_hide_empty')}
      {toggle('weekUseAlias', 'settings_week_alias')}
    </>}
    {section === 'grid' && <>
      {card('gridSubInfo', 'settings_grid_sub_info', ['settings_grid_sub_room', 'settings_grid_sub_teacher', 'settings_grid_sub_none'], ['room', 'teacher', 'none'])}
      {toggle('gridUseAlias', 'settings_grid_alias')}
      {toggle('gridAdaptiveHeight', 'settings_grid_adaptive_height', 'settings_grid_adaptive_height_sub')}
      {toggle('gridPinchZoom', 'settings_grid_pinch_zoom', 'settings_grid_pinch_zoom_sub')}
      {toggle('gridAutoHideEmptyEvening', 'settings_grid_auto_hide_evening', 'settings_grid_auto_hide_evening_sub')}
      {prefs.gridAutoHideEmptyEvening && <TimePickerField label={t('settings_grid_evening_start')} value={prefs.gridEveningStart} onValueChange={v => void update({ gridEveningStart: v })} />}
      {toggle('gridShowSeparators', 'settings_grid_show_separators', 'settings_appearance_separator_scope')}
      {toggle('gridLongBreakSpacing', 'settings_grid_long_break_spacing', 'settings_appearance_break_scope')}
    </>}
    {section === 'holiday' && <>
      {toggle('holidayGreyHoliday', 'settings_holiday_holiday')}
      {toggle('holidayGreyWeekend', 'settings_holiday_weekend')}
      {toggle('holidayIgnoreWorkday', 'settings_appearance_workday_visible')}
      {card('holidayStyle', 'settings_holiday_style', ['settings_holiday_style_grey', 'settings_holiday_style_strikethrough'], ['grey', 'strikethrough'])}
    </>}
  </div>
}
