/**
 * PeriodHeaderSettingsPage — PeriodHeaderSettingsScreen.kt 1:1。
 * 预览卡即样式选择器 (点选, selected=primaryContainer) → 布局分段 (labelMedium 小标题)
 * → 显示"第 X 节"开关行, 悬挂滑杆仅 three_line 布局时显示且挂在开关行下方。
 */

import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { periodHeaderLines, type PeriodHeaderStyle } from '../../components/schedule/periodHeader'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'
import { SettingsScaffold, SectionHeader, ToggleRow, SliderRow } from './shared'

const STYLES: Array<[PeriodHeaderStyle, string]> = [
  ['arabic', '1  2  3'],
  ['chinese', '一  二  三'],
  ['financial', '壹  贰  叁'],
  ['circled', '①  ②  ③'],
  ['roman', 'Ⅰ  Ⅱ  Ⅲ'],
]

export function PeriodHeaderSettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  return <SettingsScaffold title={t('settings_period_header', '节次表头')} onBack={onBack}>
    <SectionHeader title={t('settings_period_header_preview', '预览')} />
    {/* 预览卡即样式选择器 (PeriodHeaderSettingsScreen.kt HeaderStylePreviews):
        选中 = primaryContainer 外卡 + onPrimaryContainer 标签 */}
    <div className="m3-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
      {STYLES.map(([style, label]) => {
        const selected = prefs.periodHeaderStyle === style
        return (
          <div
            key={style}
            onClick={() => void update({ periodHeaderStyle: style })}
            style={{
              minWidth: 76, flex: '1 1 auto', borderRadius: 16, padding: 6, cursor: 'pointer',
              background: selected ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            }}
          >
            <div
              style={{
                width: 68, height: 52, borderRadius: 8, padding: 3,
                background: 'var(--md-surface-container-low)', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
              }}
            >
              {periodHeaderLines(
                { label: '12', displayStart: '08:00', displayEnd: '08:45' },
                prefs.periodHeaderLayout, style, prefs.periodHeaderShowX,
              ).map((line, i) => <div key={i} className="m3-label-small">{line}</div>)}
            </div>
            <span
              className="m3-label-small"
              style={{ color: selected ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)' }}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>

    {/* 布局: labelMedium 小标题 + SegmentedSwitcher 高40 surfaceContainerHighest */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('settings_period_header_layout', '布局')}
      </span>
      <SegmentedSwitcher
        options={[t('settings_period_header_legacy', '旧式'), t('settings_period_header_three_line', '三行')]}
        selected={prefs.periodHeaderLayout === 'three_line' ? 1 : 0}
        onSelect={(i) => void update({ periodHeaderLayout: i === 1 ? 'three_line' : 'legacy' })}
        height={40}
        containerColor="var(--md-surface-container-highest)"
      />
    </div>

    <ToggleRow label={t('settings_period_header_show_x', '显示“第 X 节”')} checked={prefs.periodHeaderShowX} onChange={(v) => void update({ periodHeaderShowX: v })} />
    {/* 悬挂滑杆仅三行布局显示 (Android if (layout == "three_line")), 挂在开关行下方 */}
    {prefs.periodHeaderLayout === 'three_line' && (
      <SliderRow
        label={t('settings_period_header_hanging', '悬挂位置')}
        value={prefs.periodHeaderHanging}
        min={-1}
        max={1}
        step={0.1}
        formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
        onChange={(v) => void update({ periodHeaderHanging: v })}
      />
    )}
  </SettingsScaffold>
}
