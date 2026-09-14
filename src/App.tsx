/**
 * App 壳 — MainActivity.kt AppRoot/Tab 1:1
 * 4 tab: Schedule / Today / Manage / Mine (MainActivity.kt:173-178)。
 * 底栏双形态对齐 PillNavigationBar.kt:
 *   navDock=false → 贴底通栏 (dock=false 分支, MainActivity.kt:392-423)
 *   navDock=true  → 悬浮胶囊 Dock (dock=true 分支, MainActivity.kt:424-474)
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from './state/prefsStore'
import { installBackHandler, tabFromHash, useBackStack, type TabKey } from './state/backStack'
import { abandonPendingTable } from './state/pendingTable'
import { IconCalendarMonth, IconToday, IconSettings, IconPerson } from './components/icons'
import { ScheduleView } from './views/ScheduleView'
import { TodayView } from './views/TodayView'
import { ManageView } from './views/ManageView'
import { MineView } from './views/MineView'

type Tab = TabKey

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
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash))
  const [dockExtra, setDockExtra] = useState(76)
  const pushTab = useBackStack((s) => s.pushTab)
  const replaceTab = useBackStack((s) => s.replaceTab)
  // 不变量 (MainActivity.kt:301-397): 每个 overlay 分支都在底栏组合之前 return —
  // 栈上只要有一层 (二级/三级皆算, 随栈深递增永远成立), 底栏两种形态都不存在。
  const hasOverlay = useBackStack((s) => s.stack.length > 0)

  // tab hash 首次进入不新增历史;之后点击 tab 写入独立地址。
  useEffect(() => {
    if (window.location.hash) replaceTab(tab)
    else pushTab(tab)
    return installBackHandler((popped, hash) => {
      // 浏览器返回退出 EditTable → 未保存的新表就地丢弃
      // (MainActivity:271-277 BackHandler 在 popOverlay 之前先 discardNewTable)。
      if (popped === 'editTable') void abandonPendingTable()
      // 二级层由其所在视图处理;退回 tab 层时 hash 直接决定当前 tab。
      const next = tabFromHash(hash)
      setTab(next)
    })
  }, [])

  const selectTab = (next: Tab) => {
    if (next === tab) return
    pushTab(next)
    setTab(next)
  }

  // Dock 滚动余量 (MainActivity dockOverlayPx→dockExtraDp 同构): 理论估算兜底
  // (首帧前, 64 高 + bottom 12 = 76), dock nav 实测高到位后覆盖 —
  // 猜值必小于真值, 实测保证最后一项能滚到 Dock 上方完全可见。
  // overlay 在栈上时底栏不渲染, 跳过测量 (否则 ResizeObserver 观测到卸载节点会把
  // dockExtra 污染成 0, 回主页面后底部留白消失)。
  const dockNavRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!navDock || hasOverlay) return
    const el = dockNavRef.current
    if (!el) return
    const measure = () => {
      const h = el.offsetHeight
      if (h > 0) setDockExtra(h + 12)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [navDock, hasOverlay])

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
        {tab === 'schedule' && <ScheduleView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
        {tab === 'today' && <TodayView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
        {tab === 'manage' && <ManageView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
        {tab === 'mine' && <MineView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
      </main>
      {/* 底栏闸门 = 返回栈是否为空 (Android 每个 overlay 分支都在底栏之前 return)。
          栈非空 → 贴底通栏与悬浮 Dock 两种形态都不渲染, 底部滚动余量同时归零。 */}
      {!hasOverlay && (navDock ? (
        // 悬浮胶囊 Dock (PillNavigationBar dock=true / DockNavigationBar):
        // iOS 悬浮 tab bar 语义 — 居中玻璃胶囊, 4 座位等宽恒显 icon+label 双行,
        // thumb (secondaryContainer) 包住整个座位, 选中文字 onSecondaryContainer
        <nav
          ref={dockNavRef}
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
                  onClick={() => selectTab(key)}
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
                onClick={() => selectTab(key)}
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
      ))}
    </div>
  )
}
