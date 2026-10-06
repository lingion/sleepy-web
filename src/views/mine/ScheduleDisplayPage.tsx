/**
 * ScheduleDisplayPage — ScheduleDisplayScreen.kt / ScheduleDisplayContent 1:1。
 * Android 此屏只有: 3 个滑杆 (缩放/周视图缩放/圆角) → 冲突样式 labelMedium 子标题
 * → 全宽 SegmentedSwitcher(surfaceContainerHighest) → 按样式条件显示一个参数滑杆。
 * ScheduleDisplayContent 为可复用体 (AppearanceScreen 第③节嵌同一组件, Android 同构)。
 * 课程显示类开关 (gridSubInfo/两栏/别名/星期等) 在 Android 只存在于通用设置, 本页不放。
 */

import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { SettingsScaffold, SegmentedSwitcher, SliderRow } from './shared'

/** ScheduleDisplayContent (ScheduleDisplayScreen.kt:35) —  Appearance 第③节与本屏共用体 */
export function ScheduleDisplayContent() {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SliderRow label={t('settings_pill_scale', '课表缩放')} value={prefs.gridScale} min={0.7} max={1.3} step={0.05} formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v) => void update({ gridScale: v })} />
      <SliderRow label={t('settings_pill_week_scale', '周视图缩放')} value={prefs.weekScale} min={0.7} max={1.3} step={0.05} formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v) => void update({ weekScale: v })} />
      <SliderRow label={t('settings_pill_corner', '圆角比例')} value={prefs.gridCornerRatio} min={0} max={2} step={0.05} formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v) => void update({ gridCornerRatio: v })} />

      {/* 冲突课程样式 — Section 下级分组: 子标题降级 labelMedium/onSurfaceVariant (ScheduleDisplayScreen.kt) */}
      <div className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)', paddingTop: 8 }}>
        {t('settings_conflict_style')}
      </div>
      <SegmentedSwitcher
        full
        options={[t('settings_conflict_stack'), t('settings_conflict_fold'), t('settings_conflict_rail')]}
        selected={['stack', 'fold', 'rail'].indexOf(prefs.conflictStyle)}
        onSelect={(i) => void update({ conflictStyle: (['stack', 'fold', 'rail'] as const)[i] })}
      />
      {prefs.conflictStyle === 'stack' && <SliderRow label={t('settings_conflict_stack_inset', '堆叠偏移')} value={prefs.conflictStackInset} min={4} max={20} step={1} formatValue={(v) => `${v}dp`} onChange={(v) => void update({ conflictStackInset: v })} />}
      {prefs.conflictStyle === 'rail' && <SliderRow label={t('settings_conflict_rail_inset', '侧轨偏移')} value={prefs.conflictRailInset} min={4} max={20} step={1} formatValue={(v) => `${v}dp`} onChange={(v) => void update({ conflictRailInset: v })} />}
      {prefs.conflictStyle === 'fold' && <SliderRow label={t('settings_conflict_fold_size', '折叠尺寸')} value={prefs.conflictFoldSize} min={8} max={28} step={1} formatValue={(v) => `${v}dp`} onChange={(v) => void update({ conflictFoldSize: v })} />}
    </div>
  )
}

export function ScheduleDisplayPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  return <SettingsScaffold title={t('appearance_section_schedule_display', '课表显示')} onBack={onBack}>
    <ScheduleDisplayContent />
  </SettingsScaffold>
}
