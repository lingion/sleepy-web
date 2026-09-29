import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { periodHeaderLines, type PeriodHeaderStyle } from '../../components/schedule/periodHeader'
import { SettingsScaffold, SectionHeader, FlatCard, ToggleRow, SliderRow } from './shared'

const STYLES: PeriodHeaderStyle[] = ['arabic', 'chinese', 'financial', 'circled', 'roman']

export function PeriodHeaderSettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  return <SettingsScaffold title={t('settings_period_header', '节次表头')} onBack={onBack}>
    <SectionHeader title={t('settings_period_header_preview', '预览')} />
    <div className="m3-card" style={{ display: 'flex', justifyContent: 'space-around', padding: 20 }}>
      {STYLES.map((style) => <div key={style} style={{ textAlign: 'center' }}>{periodHeaderLines({ label: '1', displayStart: '08:00', displayEnd: '08:45' }, prefs.periodHeaderLayout, style, prefs.periodHeaderShowX).map((line, i) => <div key={i}>{line}</div>)}</div>)}
    </div>
    <FlatCard title={t('settings_period_header_layout', '布局')} options={[t('settings_period_header_legacy', '旧式'), t('settings_period_header_three_line', '三行')]} selectedKey={prefs.periodHeaderLayout === 'three_line' ? 1 : 0} onSelect={(i) => void update({ periodHeaderLayout: i === 1 ? 'three_line' : 'legacy' })} />
    <FlatCard title={t('settings_period_header_style', '编号样式')} options={['1 2 3', '一 二 三', '壹 贰 叁', '① ② ③', 'Ⅰ Ⅱ Ⅲ']} selectedKey={STYLES.indexOf(prefs.periodHeaderStyle)} onSelect={(i) => void update({ periodHeaderStyle: STYLES[i] })} />
    <SliderRow label={t('settings_period_header_hanging', '悬挂位置')} value={prefs.periodHeaderHanging} min={-1} max={1} step={0.05} formatValue={(v) => v.toFixed(2)} onChange={(v) => void update({ periodHeaderHanging: v })} />
    <ToggleRow label={t('settings_period_header_show_x', '显示“第 X 节”')} checked={prefs.periodHeaderShowX} onChange={(v) => void update({ periodHeaderShowX: v })} />
  </SettingsScaffold>
}
