/**
 * App 壳 — MainActivity.kt Tab 枚举 1:1
 * 4 tab: Schedule / Today / Manage / Mine; NavigationBar 样式。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from './state/prefsStore'
import { IconCalendarMonth, IconToday, IconSettings, IconPerson } from './components/icons'
import { ScheduleView } from './views/ScheduleView'
import { TodayView } from './views/TodayView'
import { ManageView } from './views/ManageView'
import { MineView } from './views/MineView'

type Tab = 'schedule' | 'today' | 'manage' | 'mine'

// MainActivity.kt:171 Tab 枚举图标 1:1 (Icons.Outlined.*)
const TAB_ICONS: Record<Tab, (p: { size?: number }) => JSX.Element> = {
  schedule: IconCalendarMonth,
  today: IconToday,
  manage: IconSettings,
  mine: IconPerson,
}

export function App() {
  const { t } = useTranslation()
  const navDock = usePrefsStore((s) => s.prefs.navDock)
  const [tab, setTab] = useState<Tab>('schedule')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        background: 'var(--md-background)',
      }}
    >
      <main style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'schedule' && <ScheduleView />}
        {tab === 'today' && <TodayView />}
        {tab === 'manage' && <ManageView />}
        {tab === 'mine' && <MineView />}
      </main>
      {navDock ? (
        // 贴底 dock: 全宽色块底栏
        <nav
          style={{
            display: 'flex',
            background: 'var(--md-surface-container)',
            borderTop: '1px solid color-mix(in srgb, var(--md-outline-variant) 60%, transparent)',
          }}
        >
          {(
            [
              ['schedule', t('tab_schedule')],
              ['today', t('tab_today')],
              ['manage', t('tab_manage')],
              ['mine', t('tab_mine')],
            ] as [Tab, string][]
          ).map(([key, label]) => {
            const Icon = TAB_ICONS[key]
            return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '8px 0 10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: tab === key ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
              }}
            >
              {tab === key ? (
                <span
                  style={{
                    background: 'var(--md-secondary-container)',
                    borderRadius: 16,
                    padding: '2px 14px',
                    fontSize: 18,
                    lineHeight: '24px',
                  }}
                >
                  <Icon size={22} />
                </span>
              ) : (
                <span style={{ lineHeight: 0 }}><Icon size={22} /></span>
              )}
              <span className="m3-label-medium">{label}</span>
            </button>
            )
          })}
        </nav>
      ) : (
        // 悬浮胶囊 (PillNavigationBar dock=false): 居中悬浮胶囊条, 贴内容之上
        <nav
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 14,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 900,
          }}
          aria-label={t('settings_nav_style_floating')}
        >
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 6,
              borderRadius: 24,
              background: 'var(--md-surface-container-high)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
              pointerEvents: 'auto',
            }}
          >
            {(
              [
                ['schedule', t('tab_schedule')],
                ['today', t('tab_today')],
                ['manage', t('tab_manage')],
                ['mine', t('tab_mine')],
              ] as [Tab, string][]
            ).map(([key, label]) => {
            const Icon = TAB_ICONS[key]
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-label={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: tab === key ? '8px 16px' : '8px 12px',
                  borderRadius: 18,
                  border: 'none',
                  cursor: 'pointer',
                  background: tab === key ? 'var(--md-secondary-container)' : 'transparent',
                  color: tab === key ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
                }}
              >
                <Icon size={20} />
                {tab === key && <span className="m3-label-medium">{label}</span>}
              </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
