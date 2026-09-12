/**
 * App 壳 — MainActivity.kt AppRoot/Tab 1:1
 * 4 tab: Schedule / Today / Manage / Mine (MainActivity.kt:173-178)。
 * 底栏双形态对齐 PillNavigationBar.kt:
 *   navDock=false → 贴底通栏 (dock=false 分支, MainActivity.kt:392-423)
 *   navDock=true  → 悬浮胶囊 Dock (dock=true 分支, MainActivity.kt:424-474)
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

// MainActivity.kt:173-178 Tab 枚举图标 1:1 (Icons.Outlined.*)
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

  // Tab 枚举顺序 = MainActivity.kt:173 Schedule/Today/Manage/Mine
  const items: [Tab, string][] = [
    ['schedule', t('tab_schedule', '课表')],
    ['today', t('tab_today', '今日')],
    ['manage', t('tab_manage', '课表管理')],
    ['mine', t('tab_mine', '我的')],
  ]

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
        // 悬浮胶囊 Dock (PillNavigationBar dock=true / DockNavigationBar):
        // iOS 悬浮 tab bar 语义 — 居中玻璃胶囊, 4 座位等宽恒显 icon+label 双行,
        // thumb (secondaryContainer) 包住整个座位, 选中文字 onSecondaryContainer
        <nav
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 12,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 900,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 64,
              padding: '0 8px',
              borderRadius: 32,
              background: 'color-mix(in srgb, var(--md-surface-container) 86%, transparent)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
              pointerEvents: 'auto',
            }}
          >
            {items.map(([key, label]) => {
              const Icon = TAB_ICONS[key]
              const isSel = tab === key
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-current={isSel ? 'page' : undefined}
                  style={{
                    width: 56,
                    height: 52,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    border: 'none',
                    borderRadius: 26,
                    cursor: 'pointer',
                    background: isSel ? 'var(--md-secondary-container)' : 'transparent',
                    color: isSel
                      ? 'var(--md-on-secondary-container)'
                      : 'var(--md-on-surface-variant)',
                  }}
                >
                  <Icon size={24} />
                  <span
                    className="m3-label-small"
                    style={{ maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      ) : (
        // 贴底通栏 (PillNavigationBar dock=false): 全宽 surfaceContainer 带,
        // thumb 色块 (secondaryContainer, 64×32 圆角16) 只包图标, label 在色块外
        // 下方 4dp; 选中 label SemiBold + onSurface, 未选 Medium + onSurfaceVariant
        <nav style={{ display: 'flex', background: 'var(--md-surface-container)' }}>
          {items.map(([key, label]) => {
            const Icon = TAB_ICONS[key]
            const isSel = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={isSel ? 'page' : undefined}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '10px 0 12px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: isSel ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 64,
                    height: 32,
                    borderRadius: 16,
                    background: isSel ? 'var(--md-secondary-container)' : 'transparent',
                  }}
                >
                  <Icon size={20} />
                </span>
                <span
                  className="m3-label-small"
                  style={{ fontWeight: isSel ? 600 : 500 }}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
