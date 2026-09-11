/**
 * App 壳 — MainActivity.kt Tab 枚举 1:1
 * 4 tab: Schedule / Today / Manage / Mine; NavigationBar 样式。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from './state/prefsStore'
import { ScheduleView } from './views/ScheduleView'
import { TodayView } from './views/TodayView'
import { ManageView } from './views/ManageView'
import { MineView } from './views/MineView'

type Tab = 'schedule' | 'today' | 'manage' | 'mine'

const TAB_ICONS: Record<Tab, string> = {
  schedule: '📅',
  today: '🕐',
  manage: '🗂️',
  mine: '👤',
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
        background: 'var(--md-background)',
      }}
    >
      <main style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'schedule' && <ScheduleView />}
        {tab === 'today' && <TodayView />}
        {tab === 'manage' && <ManageView />}
        {tab === 'mine' && <MineView />}
      </main>
      {navDock && (
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
          ).map(([key, label]) => (
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
                  {TAB_ICONS[key]}
                </span>
              ) : (
                <span style={{ fontSize: 18, lineHeight: '28px' }}>{TAB_ICONS[key]}</span>
              )}
              <span className="m3-label-medium">{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
