import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { localizedDay } from '../../components/schedule/CardsGridView'
import { SettingsScaffold, SectionHeader, FlatCard, ToggleRow, SliderRow, HDiv } from './shared'

export function ScheduleDisplayPage({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  const [showAdvanced, setShowAdvanced] = useState(false)
  return <SettingsScaffold title={t('settings_schedule_display', '课表显示')} onBack={onBack}>
    <SectionHeader title={t('appearance_section_display', '显示')} />
    <SliderRow label={t('settings_pill_scale', '课表缩放')} value={prefs.gridScale} min={0.7} max={1.3} step={0.05} formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v) => void update({ gridScale: v })} />
    <SliderRow label={t('settings_pill_week_scale', '周视图缩放')} value={prefs.weekScale} min={0.7} max={1.3} step={0.05} formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v) => void update({ weekScale: v })} />
    <SliderRow label={t('settings_pill_corner', '圆角比例')} value={prefs.gridCornerRatio} min={0} max={2} step={0.05} formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v) => void update({ gridCornerRatio: v })} />
    <FlatCard title={t('settings_grid_sub_info')} options={[t('settings_grid_sub_room'), t('settings_grid_sub_teacher'), t('settings_grid_sub_none')]} selectedKey={prefs.gridSubInfo === 'room' ? 0 : prefs.gridSubInfo === 'teacher' ? 1 : 2} onSelect={(i) => void update({ gridSubInfo: (['room', 'teacher', 'none'] as const)[i] })} />
    <ToggleRow label={t('settings_week_two_column')} checked={prefs.weekTwoColumn} onChange={(v) => void update({ weekTwoColumn: v })} />
    <ToggleRow label={t('settings_week_hide_empty')} checked={prefs.weekHideEmptyDays} onChange={(v) => void update({ weekHideEmptyDays: v })} />
    <ToggleRow label={t('settings_week_alias')} checked={prefs.weekUseAlias} onChange={(v) => void update({ weekUseAlias: v })} />
    <ToggleRow label={t('settings_grid_alias')} checked={prefs.gridUseAlias} onChange={(v) => void update({ gridUseAlias: v })} />
    <ToggleRow label={t('settings_show_date')} checked={prefs.showDate} onChange={(v) => void update({ showDate: v })} />
    <SectionHeader title={t('settings_visible_days')} />
    <div className="m3-card" style={{ padding: 16 }}>{DAYS.map((day) => <div key={day}><ToggleRow label={localizedDay(day, i18n.language)} checked={prefs.visibleDays.includes(day)} onChange={(on) => { const next = on ? [...prefs.visibleDays, day] : prefs.visibleDays.filter((item) => item !== day); if (next.length) void update({ visibleDays: next.sort((a, b) => a - b) }) }} />{day < 7 && <HDiv />}</div>)}</div>
    <button type="button" className="m3-card" onClick={() => setShowAdvanced((v) => !v)} style={{ border: 0, textAlign: 'left', padding: 16, color: 'var(--md-on-surface)' }}>{showAdvanced ? '收起冲突样式' : '展开冲突样式'}</button>
    {showAdvanced && <div className="m3-card" style={{ padding: 16 }}>
      <FlatCard title={t('settings_conflict_style')} options={[t('settings_conflict_stack'), t('settings_conflict_fold'), t('settings_conflict_rail')]} selectedKey={['stack', 'fold', 'rail'].indexOf(prefs.conflictStyle)} onSelect={(i) => void update({ conflictStyle: (['stack', 'fold', 'rail'] as const)[i] })} />
      {prefs.conflictStyle === 'stack' && <SliderRow label={t('settings_conflict_stack_inset', '堆叠偏移')} value={prefs.conflictStackInset} min={4} max={20} step={1} formatValue={(v) => `${v}dp`} onChange={(v) => void update({ conflictStackInset: v })} />}
      {prefs.conflictStyle === 'rail' && <SliderRow label={t('settings_conflict_rail_inset', '侧轨偏移')} value={prefs.conflictRailInset} min={4} max={20} step={1} formatValue={(v) => `${v}dp`} onChange={(v) => void update({ conflictRailInset: v })} />}
      {prefs.conflictStyle === 'fold' && <SliderRow label={t('settings_conflict_fold_size', '折叠尺寸')} value={prefs.conflictFoldSize} min={8} max={28} step={1} formatValue={(v) => `${v}dp`} onChange={(v) => void update({ conflictFoldSize: v })} />}
      <ToggleRow label={t('settings_course_colorless')} checked={prefs.courseColorless} onChange={(v) => void update({ courseColorless: v })} />
    </div>}
  </SettingsScaffold>
}

const DAYS = [1, 2, 3, 4, 5, 6, 7]
