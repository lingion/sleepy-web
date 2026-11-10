/** Android 1.0.64 的通用、周视图、网格、冲突和假期显示设置。 */

import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'
import { SettingsScaffold, SliderRow, SectionHeader } from './shared'
import { DisplayOptions } from './DisplayOptions'
import { EntryRow } from './GeneralSettingsPage'

/** ScheduleDisplayContent (ScheduleDisplayScreen.kt:35) —  Appearance 第③节与本屏共用体 */
export function ScheduleDisplayContent({ section = 'all' }: { section?: 'all' | 'week' | 'grid' | 'conflict' } = {}) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(section === 'all' || section === 'grid') && <SliderRow
        label={t('settings_pill_scale', '课表缩放')}
        value={prefs.gridScale}
        min={0.7}
        max={1.3}
        step={0.05}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        onCommit={(v) => void update({ gridScale: v })}
      />}
      {(section === 'all' || section === 'week') && <SliderRow
        label={t('settings_pill_week_scale', '周视图缩放')}
        value={prefs.weekScale}
        min={0.7}
        max={1.3}
        step={0.05}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        onCommit={(v) => void update({ weekScale: v })}
      />}
      {(section === 'all' || section === 'grid') && <SliderRow
        label={t('settings_pill_corner', '圆角比例')}
        value={prefs.gridCornerRatio}
        min={0}
        max={2}
        step={0.05}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        onCommit={(v) => void update({ gridCornerRatio: v })}
      />}

      {(section === 'all' || section === 'conflict') && <>
      {/* 冲突课程样式 — Section 下级分组: 子标题降级 labelMedium/onSurfaceVariant (ScheduleDisplayScreen.kt) */}
      <div className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)', paddingTop: 8 }}>
        {t('settings_conflict_style')}
      </div>
      <SegmentedSwitcher
        containerColor="var(--md-surface-container-highest)"
        options={[t('settings_conflict_stack'), t('settings_conflict_fold'), t('settings_conflict_rail')]}
        selected={['stack', 'fold', 'rail'].indexOf(prefs.conflictStyle)}
        onSelect={(i) => void update({ conflictStyle: (['stack', 'fold', 'rail'] as const)[i] })}
      />
      {prefs.conflictStyle === 'stack' && <SliderRow label={t('settings_conflict_stack_inset', '堆叠偏移')} value={prefs.conflictStackInset} min={4} max={20} step={1} formatValue={(v) => `${v}dp`} onCommit={(v) => void update({ conflictStackInset: v })} />}
      {prefs.conflictStyle === 'rail' && <SliderRow label={t('settings_conflict_rail_inset', '侧轨偏移')} value={prefs.conflictRailInset} min={4} max={20} step={1} formatValue={(v) => `${v}dp`} onCommit={(v) => void update({ conflictRailInset: v })} />}
      {prefs.conflictStyle === 'fold' && <SliderRow label={t('settings_conflict_fold_size', '折叠尺寸')} value={prefs.conflictFoldSize} min={8} max={28} step={1} formatValue={(v) => `${v}dp`} onCommit={(v) => void update({ conflictFoldSize: v })} />}
      </>}
    </div>
  )
}

export function ScheduleDisplayPage({ onBack, onOpenPeriodHeader = () => {} }: { onBack: () => void; onOpenPeriodHeader?: () => void }) {
  const { t } = useTranslation()
  return <SettingsScaffold title={t('appearance_section_schedule_display', '课表显示')} onBack={onBack}>
    <SectionHeader title={t('settings_appearance_common', '通用显示')} />
    <DisplayOptions section="common" />
    <SectionHeader title={t('settings_start_view_full')} />
    <DisplayOptions section="week" />
    <ScheduleDisplayContent section="week" />
    <SectionHeader title={t('settings_start_view_cards')} />
    <DisplayOptions section="grid" />
    <ScheduleDisplayContent section="grid" />
    <EntryRow title={t('appearance_period_header')} onClick={onOpenPeriodHeader} />
    <SectionHeader title={t('settings_conflict_style')} />
    <ScheduleDisplayContent section="conflict" />
    <SectionHeader title={t('settings_appearance_holidays', '假期显示')} />
    <DisplayOptions section="holiday" />
  </SettingsScaffold>
}
