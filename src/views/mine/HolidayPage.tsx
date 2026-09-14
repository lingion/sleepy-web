/**
 * HolidayPage — 节假日灰显 (HolidaySettingsScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 三开关 (holidayGreyHoliday/GreyWeekend/IgnoreWorkday) + 灰显样式分段 (holidayStyle)。
 * 灰显样式: grey=半透明 / strikethrough=删除线 (ScheduleView greyDays 消费方)。
 * HolidayRuleEditor 本体 (KEY_HOLIDAY_OVERRIDES) 属节假日规则域, 另立分区移植。
 */

import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { SettingsScaffold, ToggleRow, HDiv, FlatCard } from './shared'


export function HolidayPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  return (
    <SettingsScaffold title={t('settings_holiday_title')} onBack={onBack}>
      {/* 三开关卡 (HolidaySettingsScreen.kt:276-307 同构) */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ToggleRow
          label={t('settings_holiday_holiday')}
          subtitle={t('settings_holiday_holiday_sub')}
          checked={prefs.holidayGreyHoliday}
          onChange={(v) => void update({ holidayGreyHoliday: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_holiday_weekend')}
          subtitle={t('settings_holiday_weekend_sub')}
          checked={prefs.holidayGreyWeekend}
          onChange={(v) => void update({ holidayGreyWeekend: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_holiday_workday')}
          subtitle={t('settings_holiday_workday_sub')}
          checked={prefs.holidayIgnoreWorkday}
          onChange={(v) => void update({ holidayIgnoreWorkday: v })}
        />
      </div>
      {/* 灰显样式分段 (HolidaySettingsScreen.kt:309-321 同构) */}
      <FlatCard
        title={t('settings_holiday_style')}
        options={[t('settings_holiday_style_grey'), t('settings_holiday_style_strikethrough')]}
        selectedKey={prefs.holidayStyle === 'strikethrough' ? 1 : 0}
        onSelect={(i) => void update({ holidayStyle: i === 1 ? 'strikethrough' : 'grey' })}
      />
      {/* HolidayRuleEditor 本体占位 — 用户范围化覆盖 (KEY_HOLIDAY_OVERRIDES), 另立分区移植 */}
      <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 8 }}>
        {t('settings_holiday_editor_placeholder', { defaultValue: '节假日规则编辑器尚未移植' })}
      </div>
    </SettingsScaffold>
  )
}
