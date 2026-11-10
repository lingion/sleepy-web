/**
 * App 壳 — MainActivity.kt AppRoot/Tab 1:1
 * 4 tab: Schedule / Today / Manage / Mine (MainActivity.kt:173-178)。
 * 底栏双形态对齐 PillNavigationBar.kt:
 *   navDock=false → 贴底通栏 (dock=false 分支, MainActivity.kt:392-423)
 *   navDock=true  → 悬浮胶囊 Dock (dock=true 分支, MainActivity.kt:424-474)
 * 平板横屏第三形态 (SleepyNavHost.kt:484-657): 宽≥600 且 横屏 → NavigationRail +
 * 左课表固定/右 Today·Manage·Mine 的 Master-Detail 双栏。
 */

import { useEffect, useRef, useState } from 'react'
import { GlassControls } from './components/glass/GlassControls'
import { GlassNavigation } from './components/glass/GlassNavigation'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from './state/prefsStore'
import { chainFromHash, installBackHandler, restoreChain, tabFromHash, useBackStack, type BackKey, type TabKey } from './state/backStack'
import { useTabletLayout } from './state/tabletLayout'
import { TabletNavRail } from './components/TabletNavRail'
import { abandonPendingTable } from './state/pendingTable'
import { IconCalendarMonth, IconToday, IconSettings, IconPerson } from './components/icons'
import { ScheduleView } from './views/ScheduleView'
import { TodayView } from './views/TodayView'
import { ManageView } from './views/ManageView'
import { MineView } from './views/MineView'
import { publicScheduleEnabled } from './publicSchedule'
import { startReminderEngine, stopReminderEngine } from './domain/reminders/scheduler'
import { useReminderStore } from './state/reminderStore'
import { DailyAgendaPage } from './views/DailyAgendaPage'
import { agendaDateFromHash } from './domain/reminders/agenda'

type Tab = TabKey

// MainActivity.kt:173-178 Tab 枚举图标 1:1 (Icons.Outlined.*)
const TAB_ICONS: Record<Tab, (p: { size?: number }) => JSX.Element> = {
  schedule: IconCalendarMonth,
  today: IconToday,
  manage: IconSettings,
  mine: IconPerson,
}

// 课表页弹层族 = Android 局部 sheet/dialog (不入 overlayStack 语义), Web 入栈只为
// 浏览器返回先关弹层; 平板双栏下不触发拆栏回落 (见上 fullOverlay 注释)。
const PANE_DIALOG_KEYS: ReadonlySet<BackKey> = new Set<BackKey>([
  'courseDetail',
  'weekSwitcher',
  'weekJump',
  'shareSheet',
])

export function App() {
  const { t } = useTranslation()
  const navDock = usePrefsStore((s) => s.prefs.navDock)
  const uiStyle = usePrefsStore((s) => (s.prefs as { uiStyle?: 'classic' | 'liquid_glass' }).uiStyle ?? 'classic')
  const publicSchedule = publicScheduleEnabled()
  const [tab, setTab] = useState<Tab>(() => publicSchedule ? 'schedule' : tabFromHash(window.location.hash))
  const [agendaDate, setAgendaDate] = useState(() => agendaDateFromHash(window.location.hash))
  const [dockExtra, setDockExtra] = useState(76)
  const pushTab = useBackStack((s) => s.pushTab)
  const replaceTab = useBackStack((s) => s.replaceTab)
  // 不变量 (MainActivity.kt:301-397): 每个 overlay 分支都在底栏组合之前 return —
  // 栈上只要有一层 (二级/三级皆算, 随栈深递增永远成立), 底栏两种形态都不存在。
  const hasOverlay = useBackStack((s) => s.stack.length > 0)
  // 平板横屏 Master-Detail (SleepyNavHost.kt:484-494): 宽≥600 且 宽≥高 → 左课表固定 + 右 Today/Manage/Mine。
  // 全屏覆盖层 (二级/三级页) 打开时回落单栏 — Android overlay 是 NavHost 全屏目的地, 盖住整个双栏;
  // 课表页弹层族 (详情/切表/跳周/分享) 是 fixed 浮层, 不拆栏 (Android 本就是 sheet/dialog 局部层)。
  const tablet = useTabletLayout()
  const stack = useBackStack((s) => s.stack)
  const fullOverlay = stack.some((k) => !PANE_DIALOG_KEYS.has(k))
  const tabletSplit = tablet && !publicSchedule && !fullOverlay

  // tab hash 首次进入不新增历史;之后点击 tab 写入独立地址。
  // 直达/刷新落在二三级页 hash → 重建返回栈链 (replaceTab 会把子页 hash 抹平甩回 tab 根)。
  useEffect(() => {
    if (publicSchedule) {
      if (window.location.hash !== '#/课表') window.history.replaceState(null, '', '#/课表')
      setTab('schedule')
      return
    }
    const chain = chainFromHash(window.location.hash)
    if (chain.length > 0) restoreChain(chain, window.location.hash)
    else if (window.location.hash) replaceTab(tab)
    else pushTab(tab)
    return installBackHandler((popped, hash) => {
      // 浏览器返回退出 EditTable → 未保存的新表就地丢弃
      // (MainActivity:271-277 BackHandler 在 popOverlay 之前先 discardNewTable)。
      if (popped === 'editTable') void abandonPendingTable()
      // 二级层由其所在视图处理;退回 tab 层时 hash 直接决定当前 tab。
      const next = tabFromHash(hash)
      setTab(next)
      setAgendaDate(agendaDateFromHash(hash))
    })
  }, [])

  useEffect(() => {
    const openAgenda = (event: Event) => {
      const hash = (event as CustomEvent<unknown>).detail
      if (typeof hash !== 'string') return
      const date = agendaDateFromHash(hash)
      if (!date) return
      useBackStack.getState().pushTab('today')
      useBackStack.getState().push('dailyAgenda', hash)
      setTab('today')
      setAgendaDate(date)
    }
    window.addEventListener('sleepy:open-agenda', openAgenda)
    return () => window.removeEventListener('sleepy:open-agenda', openAgenda)
  }, [])

  const selectTab = (next: Tab) => {
    if (publicSchedule || next === tab) return
    pushTab(next)
    setTab(next)
  }

  // 提醒引擎 (页内定时器, CourseNotificationScheduler 对位): 常驻挂载, 提醒配置一变即重排。
  useEffect(() => {
    startReminderEngine()
    const unsub = useReminderStore.subscribe(() => startReminderEngine())
    return () => {
      unsub()
      stopReminderEngine()
    }
  }, [])

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
  const items: [Tab, string][] = publicSchedule
    ? [['schedule', t('tab_schedule', '课表')]]
    : [
        ['schedule', t('tab_schedule', '课表')],
        ['today', t('tab_today', '今日')],
        ['manage', t('tab_manage', '课表管理')],
        ['mine', t('tab_mine', '我的')],
      ]

  if (agendaDate && stack.includes('dailyAgenda')) return <><GlassControls style={uiStyle} /><DailyAgendaPage date={agendaDate} onBack={() => { useBackStack.getState().pop(); setAgendaDate(null) }} /></>

  // ── 平板横屏 Master-Detail (SleepyNavHost.kt:494-657) ─────────────────
  // 左 50% = 课表永久固定; 右 50% = Today/Manage/Mine 跟 rail 切;
  // tab=Schedule 时右栏派生 Today (Android「宽屏派生为 Tab.Today」同构)。
  if (tabletSplit) {
    const rightTab = (tab === 'schedule' ? 'today' : tab) as 'today' | 'manage' | 'mine'
    return (
      <div style={{ display: 'flex', height: '100%', background: 'var(--md-background)' }}>
        <GlassControls style={uiStyle} />
        <TabletNavRail
          current={rightTab}
          labels={{
            today: t('tab_today', '今日'),
            manage: t('tab_manage', '课表管理'),
            mine: t('tab_mine', '我的'),
          }}
          onSelect={selectTab}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', padding: '12px 16px', gap: 16 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 16,
              background: 'var(--md-surface-container-low)',
              overflow: 'auto',
            }}
          >
            <ScheduleView navExtraBottom={0} readOnly={publicSchedule} />
          </div>
          {/* 暗色沟槽 12dp (Android gap Box, 背景=background) */}
          <div style={{ width: 12, flexShrink: 0, background: 'var(--md-background)' }} />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 16,
              background: 'var(--md-surface-container-low)',
              overflow: 'auto',
            }}
          >
            {rightTab === 'today' && <TodayView navExtraBottom={0} />}
            {rightTab === 'manage' && <ManageView navExtraBottom={0} />}
            {rightTab === 'mine' && <MineView navExtraBottom={0} />}
          </div>
        </div>
      </div>
    )
  }

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
      {/* H1 唯一持有者 = index.html 壳层静态标签(Bing 只读源码,运行期注入不可见,
          2026-10-28 复报定案)。App 内不再渲染 h1,否则文档双 H1;各 tab 内容标题
          维持 m3-title-large div(Android TopAppBar 1:1 对齐不许动)。 */}
      <GlassControls style={uiStyle} />
      <main key={tab} className="app-page-transition" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tab === 'schedule' && <ScheduleView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} readOnly={publicSchedule} />}
        {tab === 'today' && <TodayView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
        {tab === 'manage' && <ManageView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
        {tab === 'mine' && <MineView navExtraBottom={!hasOverlay && navDock ? dockExtra : 0} />}
      {publicSchedule && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 950, padding: '6px 10px', borderRadius: 999, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }}>
          <span className="m3-label-small">只读分享</span>
        </div>
      )}
      </main>
      {/* 底栏闸门 = 返回栈是否为空 (Android 每个 overlay 分支都在底栏之前 return)。
          栈非空 → 贴底通栏与悬浮 Dock 两种形态都不渲染, 底部滚动余量同时归零。 */}
      {!publicSchedule && !hasOverlay && <GlassNavigation
        ref={dockNavRef} items={items.map(([key, label]) => ({ key, label, icon: TAB_ICONS[key] }))}
        current={tab} dock={navDock} onSelect={(key) => selectTab(key as Tab)}
      />}
    </div>
  )
}
