/**
 * ReminderPage — 提醒 (ReminderScreen.kt 1:1)。从 MineView.tsx 拆出。
 * web 无系统通知通道, 仅展示配置占位: master/daily/beforeClass + 时间/提前分钟。
 * Android ReminderScreen 581 行 = master/daily/beforeClass/banner/fluid + 时间选择。
 * Web 浏览器原生 Notifications API 可作 web push 化替代, 但需用户授权且会丢后台唤醒,
 * 故此处保留完整入口与配置展示, 让用户知晓平台限制。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsScaffold, SectionHeader, ToggleRow } from './shared'


export function ReminderPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [master, setMaster] = useStoredBoolean('sleepy.reminder.master', false)
  const [daily, setDaily] = useStoredBoolean('sleepy.reminder.daily', true)
  const [beforeClass, setBeforeClass] = useStoredBoolean('sleepy.reminder.beforeClass', false)
  const [time, setTime] = useStoredString('sleepy.reminder.time', '07:00')
  const [minutes, setMinutes] = useStoredNumber('sleepy.reminder.minutes', 10)
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window

  async function setMasterAndPermission(enabled: boolean) {
    if (enabled && notificationSupported && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    setMaster(enabled)
  }

  return (
    <SettingsScaffold title={t('reminder_title')} onBack={onBack}>
      <SectionHeader title={t('reminder_master_title')} />
      <div className="m3-card" style={{ padding: 16 }}>
        <ToggleRow label={t('reminder_master_title')} subtitle={t('reminder_master_sub')} checked={master} onChange={(v) => void setMasterAndPermission(v)} />
        {!notificationSupported && <p className="m3-body-small" style={{ margin: '8px 0 0', color: 'var(--md-on-surface-variant)' }}>当前浏览器不支持通知权限。</p>}
        {notificationSupported && Notification.permission === 'denied' && <p className="m3-body-small" style={{ margin: '8px 0 0', color: 'var(--md-error)' }}>通知权限已被浏览器拒绝，请在站点设置中重新允许。</p>}
      </div>
      <SectionHeader title={t('reminder_daily_title')} />
      <div className="m3-card" style={{ padding: 16 }}>
        <ToggleRow label={t('reminder_daily_title')} subtitle={t('reminder_daily_sub')} checked={daily} onChange={setDaily} />
        {daily && <label className="m3-body-medium" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          {t('reminder_daily_time_label', { defaultValue: '提醒时间' })}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ font: 'inherit' }} />
        </label>}
      </div>
      <SectionHeader title={t('reminder_before_class_title')} />
      <div className="m3-card" style={{ padding: 16 }}>
        <ToggleRow label={t('reminder_before_class_title')} subtitle={t('reminder_before_class_sub')} checked={beforeClass} onChange={setBeforeClass} />
        {beforeClass && <label className="m3-body-medium" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          {t('reminder_before_minutes_label', { defaultValue: '提前分钟数' })}
          <input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 1)} style={{ width: 72, font: 'inherit' }} />
        </label>}
      </div>
    </SettingsScaffold>
  )
}

function useStoredBoolean(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) === null ? initial : localStorage.getItem(key) === 'true')
  return [value, (next) => { setValue(next); localStorage.setItem(key, String(next)) }]
}

function useStoredString(key: string, initial: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? initial)
  return [value, (next) => { setValue(next); localStorage.setItem(key, next) }]
}

function useStoredNumber(key: string, initial: number): [number, (value: number) => void] {
  const [value, setValue] = useState(() => Number(localStorage.getItem(key) ?? initial))
  return [value, (next) => { const safe = Math.min(120, Math.max(1, next)); setValue(safe); localStorage.setItem(key, String(safe)) }]
}
