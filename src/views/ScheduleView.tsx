/**
 * ScheduleView — 课表主 tab (ScheduleScreen.kt 1:1)
 * TopBar (左: 切换课表/撤回 · 中: 周翻页三件套+跳周菜单 · 右: 加课/分享) +
 * SegmentedSwitcher (周视图/网格, 会话级) + FullWeekView/CardsGridView 双模式 +
 * EmptyState/NoCourseState 双空态 (ScheduleScreen.kt:570-613) +
 * TableSwitcherDialog + ShareScheduleSheet 接线 +
 * 课程按当前周 inWeek 过滤 (ScheduleScreen.kt:236) +
 * 节假日/周末灰显 (HolidayManager.shouldGrey web 同构: 网络源 + localStorage 磁盘缓存)。
 */

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lazyPage, PageSuspense } from '../startup/lazyPage'
import { preparePageTranslations } from '../i18n'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  IconChevronLeft, IconChevronRight,
  IconAdd, IconIosShare, IconCheck, IconClose, IconCalendarMonth,
} from '../components/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'
import { holidaySetsForYear, useHolidayStore, getHolidayTransfers } from '../state/holidayStore'
import { holidayGreyDaysForWeek, type HolidayYearData } from '../domain/holiday/ranges'
import { displayMaxWeek, projectWeekCourses } from '../domain/courseOccurrence'
import { installBackHandler, useBackStack, type BackKey } from '../state/backStack'
import { abandonPendingTable, beginNewTable, usePendingTable } from '../state/pendingTable'
import { useScheduleSessionStore } from '../state/scheduleSessionStore'
import { undoManager, useUndoStore } from '../data/undoStore'
import { CardsGridView, dateOfWeek } from '../components/schedule/CardsGridView'
import { FullWeekView } from '../components/schedule/FullWeekView'
const MemoCardsGridView = memo(CardsGridView)
const MemoFullWeekView = memo(FullWeekView)
const CourseDetailSheet = lazyPage(() => import('../components/CourseDetailSheet').then(module => ({ default: module.CourseDetailSheet })))
const AddCourseView = lazyPage(() => import('./AddCourseView').then(module => ({ default: module.AddCourseView })))
const ImportView = lazyPage(() => import('./ImportView').then(module => ({ default: module.ImportView })), preparePageTranslations)
const ShareScheduleSheetView = lazyPage(() => import('./ExportView').then(module => ({ default: module.ShareScheduleSheetView })))
const EditTableView = lazyPage(() => import('./EditTableView').then(module => ({ default: module.EditTableView })))
import { normalizeNode } from '../data/types'
import { createScheduleDataQuery, getInitialScheduleData } from '../startup/scheduleData'
import type { Course, Table } from '../data/types'
import { pagerTrackWeeks, PAGER_SETTLE_MS, useWeekPager } from '../components/schedule/useWeekSwipe'
import { ScheduleInteractionLayer } from '../components/schedule/ScheduleInteractionLayer'
import { useDeferredOccurrenceActions } from '../startup/useDeferredOccurrenceActions'
import type { QuickAddSeed } from '../components/schedule/interactionTypes'
import { ScheduleToolbar } from '../components/schedule/ScheduleToolbar'
import { SegmentedSwitcher } from '../components/SegmentedSwitcher'
import { normalizeStartDateToMonday } from './importExportUtils'

/** 周次计算 — 与 Android DateUtils 一致，先将任意起始日归一到周一。 */
export function computeCurrentWeek(startDate: string, maxWeek: number): number {
  if (!startDate) return 1
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!m) return 1
  const normalized = normalizeStartDateToMonday(startDate)
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)!
  const start = new Date(Number(n[1]), Number(n[2]) - 1, Number(n[3]))
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000)
  const week = Math.floor(diffDays / 7) + 1
  return Math.min(Math.max(week, 1), maxWeek)
}

/** 实际周 (不 clamp maxWeek) — DateUtils.currentWeek 同构; isOnActual 判定用 */
export function actualWeekOf(startDate: string): number {
  if (!startDate) return 1
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!m) return 1
  const normalized = normalizeStartDateToMonday(startDate)
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)!
  const start = new Date(Number(n[1]), Number(n[2]) - 1, Number(n[3]))
  const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000)
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

// ── 节假日灰显 — HolidayManager.shouldGrey web 同构 ─────────────────────
// 数据源与 Android 相同: unpkg holiday-calendar (gitcode.com/zy-mayong/publicHoliday,
// MIT)。取数顺序 内存缓存 → localStorage 磁盘缓存(拉成功一次永久) → 网络, 失败静默
// (仅周末灰显, 与 Android 离线兜底同语义)。用户范围化覆盖段 (HolidayRangeOps) 经
// holidayStore 合并 (mergeSegments→toSets), 三开关走 decideGrey — 与 Android 全同构。

/** 某年节假日数据与三开关类型已迁至 domain/holiday/ranges (ref #139: 周灰显纯函数随迁可测)。 */



/** 某周跨越的年份 (跨年周最多 2 个) */
function yearsSpanned(startDate: string, week: number): number[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return []
  const years = new Set<number>()
  for (let day = 1; day <= 7; day++) {
    const d = dateOfWeek(startDate, week, day)
    if (d) years.add(d.getFullYear())
  }
  return [...years].sort((a, b) => a - b)
}

/** 年数据 hook — holidayStore 取数(内存→磁盘→网络) + 覆盖合并; 就绪/覆盖变化即重渲染 */
function useHolidayYearData(years: number[]): Map<number, HolidayYearData> {
  const entries = useHolidayStore((s) => s.entries)
  const overrides = useHolidayStore((s) => s.overrides)
  const load = useHolidayStore((s) => s.load)
  const key = years.join(',')
  useEffect(() => {
    for (const y of years) void load(y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return useMemo(() => {
    const m = new Map<number, HolidayYearData>()
    for (const y of years) {
      const en = entries[y]
      if (en) m.set(y, holidaySetsForYear(en, overrides))
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, entries, overrides])
}

export function ScheduleView(props: { navExtraBottom?: number; readOnly?: boolean }) {
  return <PageSuspense><ScheduleContent {...props} /></PageSuspense>
}

function ScheduleContent({ navExtraBottom = 0, readOnly = false }: { navExtraBottom?: number; readOnly?: boolean }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const updatePrefs = usePrefsStore((s) => s.update)
  // 视图模式 + 周次: 会话层持有 (useScheduleSessionStore — 基线 §1.4 AppRoot 会话契约) —
  // 本组件随 overlay/tab 切换卸载重建, 状态在 store 里不丢。
  // 启动初值落 startView/真实周; 手动切换只写会话态不回写 prefs (Android 同)。
  const viewMode = useScheduleSessionStore((s) => s.viewMode)
  const setViewMode = useScheduleSessionStore((s) => s.setViewMode)
  const week = useScheduleSessionStore((s) => s.week)
  const setWeek = useScheduleSessionStore((s) => s.setWeek)
  const resetForTableSwitch = useScheduleSessionStore((s) => s.resetForTableSwitch)
  const [pageWidth, setPageWidth] = useState(0)
  const [detailCourse, setDetailCourse] = useState<Course | null>(null)
  const [adding, setAdding] = useState(false)
  const [quickAdd, setQuickAdd] = useState<QuickAddSeed | null>(null)
  const [importing, setImporting] = useState(false)
  const [importTargetId, setImportTargetId] = useState<number | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingTableId, setEditingTableId] = useState<number | null>(null)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [weekGrouped, setWeekGrouped] = useState(false)
  const weekAnchor = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const back = useBackStack((s) => s.pop)
  const push = useBackStack((s) => s.push)
  const pendingId = usePendingTable((s) => s.pendingId)

  // 浏览器返回时同步本地 page state (popstate 广播 popped key → 收回本视图的层)。
  useEffect(() => installBackHandler((key) => {
    if (key === 'addCourse') {
      if (adding && importing) setAdding(false)
      else { setAdding(false); setImporting(false); setEditingCourse(null); setQuickAdd(null) }
    }
    else if (key === 'editTable') setEditingTableId(null)
    else if (key === 'courseDetail') setDetailCourse(null)
    else if (key === 'weekSwitcher') setShowSwitcher(false)
    else if (key === 'weekJump') setJumpOpen(false)
    else if (key === 'shareSheet') setShowShare(false)
  }), [adding, importing])

  // 入栈只在事件处理器里做 (带 hash 地址, 浏览器返回可弹), 返回按钮 pop 出栈。
  // 🚫 渲染期 push: 每次重渲染都会再入一层, 返回一次弹不干净 (底栏卡在隐藏态)。
  const open = (key: BackKey, show: () => void) => {
    push(key)
    startTransition(show)
  }
  const leave = () => back()

  // 撤回/重做失败 toast — Android Toast.makeText(schedule_undo_none/redo_none) 同义
  const [toastMsg, setToastMsg] = useState('')
  const toast = (msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(''), 2500)
  }

  // 撤回/重做显隐 — Android UndoManager.hasSnapshot/hasRedoSnapshot 同义 (ScheduleScreen.kt:518-519)
  const undoDepth = useUndoStore((s) => s.undoStack.length)
  const redoDepth = useUndoStore((s) => s.redoStack.length)

  const [scheduleSource] = useState(() => {
    const initial = getInitialScheduleData()
    return { initial, query: createScheduleDataQuery(initial) }
  })
  const schedule = useLiveQuery(scheduleSource.query, [], scheduleSource.initial)
  const tableList = schedule?.tables
  const defaultTable = schedule?.defaultTable
  const allCourses = schedule?.courses

  const occurrenceActions = useDeferredOccurrenceActions(defaultTable)
  const maxWeek = displayMaxWeek(defaultTable,getHolidayTransfers(defaultTable?.id ?? null))
  const currentWeek = week ?? computeCurrentWeek(defaultTable?.startDate ?? '', maxWeek)
  const actualWeek = useMemo(
    () => actualWeekOf(defaultTable?.startDate ?? ''),
    [defaultTable?.startDate]
  )
  const isOnActual = currentWeek === actualWeek
  const weekLabel = t('schedule_week_prefix', { v1: currentWeek, defaultValue: `第 ${currentWeek} 周` })

  // 课程按当前周过滤 + normalizeNode (ScheduleScreen.kt:236-241 HorizontalPager 同构) —
  // 切周次 → weekCourses 变化 → 网格/周视图只显示本周应有的课


  // 轨道周次 — 邻接周与本周一起渲染 (HorizontalPager pageCount 同语义),
  // 三页并排整条平移 → 相邻两周视觉上连成一体
  const trackWeeks = useMemo(() => pagerTrackWeeks(currentWeek, maxWeek), [currentWeek, maxWeek])
  const trackIndex = Math.max(0, trackWeeks.indexOf(currentWeek))

  // 节假日/周末灰显 (ScheduleScreen.kt:242-254 produceState 同构) — 按轨道三周并集取年份,
  // 邻页灰显才与本周同域 (跨年那一周不会邻页缺灰)
  const greyYears = useMemo(() => {
    const years = new Set<number>()
    for (const w of trackWeeks) for (const y of yearsSpanned(defaultTable?.startDate ?? '', w)) years.add(y)
    return [...years]
  }, [defaultTable?.startDate, trackWeeks])
  const holidayData = useHolidayYearData(greyYears)
  const transferRevision = useHolidayStore((s) => s.transferRevision)
  const defaultTableId = defaultTable?.id ?? null
  // transferRevision 仅作重读信号: 调休页写 localStorage 后递增
  const holidayTransfers = useMemo(() => getHolidayTransfers(defaultTableId), [defaultTableId, transferRevision])
  // ref #139 (Android b92efaf6): 自定义补班日 = 调休映射的 targetDate, 与网络法定补班日同等豁免地位
  const customWorkdayDates = useMemo(
    () => new Set(holidayTransfers.map((t) => t.targetDate)),
    [holidayTransfers]
  )
  // 三开关 (HolidayManager.shouldGrey 读 AppPrefs 三键同构)
  const greyToggles = useMemo(
    () => ({
      greyHoliday: prefs.holidayGreyHoliday,
      greyWeekend: prefs.holidayGreyWeekend,
      ignoreWorkday: prefs.holidayIgnoreWorkday,
    }),
    [prefs.holidayGreyHoliday, prefs.holidayGreyWeekend, prefs.holidayIgnoreWorkday]
  )
  const greyDays = useMemo(
    () => holidayGreyDaysForWeek(defaultTable?.startDate ?? '', currentWeek, holidayData, greyToggles, customWorkdayDates),
    [defaultTable?.startDate, currentWeek, holidayData, greyToggles, customWorkdayDates]
  )
  const greyDaysByWeek = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const w of trackWeeks) map.set(w, holidayGreyDaysForWeek(defaultTable?.startDate ?? '', w, holidayData, greyToggles, customWorkdayDates))
    return map
  }, [defaultTable?.startDate, trackWeeks, holidayData, greyToggles, customWorkdayDates])

  // 轨道内每周课程 (ScheduleScreen.kt:236-241 每页独立 inWeek 过滤 + normalizeNode)
  const coursesByWeek = useMemo(() => {
    const map = new Map<number, Course[]>()
    if (!defaultTable) return map
    const tj = defaultTable.timeJson
    for (const w of trackWeeks) {
      map.set(w, projectWeekCourses(defaultTable, w, allCourses ?? [], holidayTransfers).map((course) => tj ? normalizeNode(course, tj) : course))
    }
    return map
  }, [allCourses, defaultTable, trackWeeks, holidayTransfers])

  const weekCourses = coursesByWeek.get(currentWeek) ?? []

  // 单页宽 = 滚动容器宽 (翻页阈值按半页比例算, 落定位移按整页算, 都依赖它)
  const measureRo = useRef<ResizeObserver | null>(null)
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    measureRo.current?.disconnect()
    measureRo.current = null
    if (!el) return
    setPageWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setPageWidth(e.contentRect.width)
    })
    ro.observe(el)
    measureRo.current = ro
  }, [])

  // 主页左右滑动切换周次 + 连动翻页动画 (ScheduleScreen.kt HorizontalPager 同构):
  // pointermove 位移→轨道 transform 跟手; 松手 pagerTargetWeek (半页阈值+fling)→落定/回弹;
  // 外部周次变化 (TopBar 箭头/跳周菜单/切表) → effect 清位移 (scrollToPage 同位)
  const pager = useWeekPager((w) => setWeek(w), maxWeek, currentWeek, pageWidth)
  // 只把事件处理器铺到滚动容器上 (offset/settling 是渲染状态, 不能当 DOM 属性;
  // attachPager 走 ref 合并, 也不能当 DOM 属性)
  const { offset: pagerOffsetPx, settling: pagerSettling, attachPager, ...pagerHandlers } = pager
  const scrollElement = useRef<HTMLDivElement | null>(null)
  const attachScheduleScroll = useCallback((el: HTMLDivElement | null) => {
    scrollElement.current = el
    attachScroll(el)
    attachPager(el)
  }, [attachScroll, attachPager])
  // StrictMode replays passive cleanup while retaining the DOM ref. Restore
  // native wheel/touch bindings without measuring the scroll box again.
  useEffect(() => {
    if (scrollElement.current) attachPager(scrollElement.current)
  }, [attachPager])

  // v7.10.5 会话级置顶 override — 网格 onPickTop 与详情弹窗 radio 共用真相源 (Android 同构)
  const [topOverrides, setTopOverrides] = useState<Record<string, number>>({})
  // v7.10.16r 轮换态 (issue#10) — 簇键 → 轮换步数, 会话级不落盘
  const [rotationSteps, setRotationSteps] = useState<Record<string, number>>({})

  const setTopOverride = useCallback((key: string, courseId: number | null) => {
    setTopOverrides((prev) => {
      const next = { ...prev }
      if (courseId == null) delete next[key]
      else next[key] = courseId
      return next
    })
  }, [])

  // 详情弹窗默认置顶变更 — 会话级换层 + 轮换态清除 + 持久化 (ScheduleScreen.kt:293-313 同构)
  function handleDefaultTopChanged(clusterKey: string, repId: number | null) {
    setRotationSteps((prev) => {
      if (!(clusterKey in prev)) return prev
      const next = { ...prev }
      delete next[clusterKey]
      return next
    })
    setTopOverride(clusterKey, repId)
    const nextPrefs = { ...prefs.conflictDefaultTop }
    if (repId === null) delete nextPrefs[clusterKey]
    else nextPrefs[clusterKey] = repId
    void updatePrefs({ conflictDefaultTop: nextPrefs })
  }

  const showCourse = useCallback((course: Course) => {
    push('courseDetail')
    startTransition(() => setDetailCourse(course))
  }, [push])
  const setRotationStep = useCallback((key: string, step: number) => {
    setRotationSteps(prev => {
      const next = { ...prev }
      if (step <= 0) delete next[key]
      else next[key] = step
      return next
    })
  }, [])

  const display = viewMode ?? prefs.startView

  // 示例课表提示: seed 时记 sampleTableId; 用户关掉提示条 (sampleBannerDismissed) 后不再显示
  // 必须留在下方三个 early return 之前 — hook 数量在早退分支里变化会触发 React #300
  const [sampleBannerOff, setSampleBannerOff] = useState(false)
  const sampleMeta = schedule?.sampleMeta

  if (adding || editingCourse) {
    return (
      <AddCourseView
        editingCourse={editingCourse}
        quickAdd={quickAdd}
        targetTableId={importing ? importTargetId ?? undefined : undefined}
        onBack={() => { leave(); setAdding(false); setEditingCourse(null); setQuickAdd(null) }}
        onSaved={() => { leave(); setAdding(false); setEditingCourse(null); setQuickAdd(null) }}
      />
    )
  }

  if (importing) {
    return <ImportView addingCourses={importTargetId !== null} targetTableId={importTargetId ?? 0}
      onManualAdd={() => open('addCourse', () => { setQuickAdd(null); setAdding(true) })}
      onDone={() => { leave(); setImporting(false) }} />
  }

  // 建表流 (EmptyState 副按钮) — 插表后进 EditTableView (Android onCreateTable 同语义)
  if (editingTableId !== null) {
    return (
      <EditTableView
        tableId={editingTableId}
        pendingNewTableId={pendingId}
        onBack={() => { leave(); setEditingTableId(null) }}
        onDiscardPending={() => { void abandonPendingTable(); leave(); setEditingTableId(null) }}
        onSaved={() => { leave(); setEditingTableId(null) }}
        onDeleted={() => { leave(); setEditingTableId(null) }}
      />
    )
  }

  const hasTable = (tableList ?? []).length > 0

  // 空态建表 — MainActivity:432-438 同款待保存动线 (建空表不切选中 → EditTable → 不保存即丢弃)
  const createFirstTable = () => {
    void beginNewTable().then((id) => open('editTable', () => setEditingTableId(id)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }} ref={containerRef}>
      {/* 顶栏 — 无表不渲染 (Android !hasTable 直接 EmptyState 全屏, ScheduleScreen.kt:142-159) */}
      {hasTable && (
        <>
          <ScheduleToolbar onGroupedChange={setWeekGrouped}>
            {/* 左缘: 切换课表 + 撤回 (仅有可撤回快照时显示, ScheduleScreen.kt:417-428) */}
            <div className="toolbar-start">
              {readOnly ? (
                <span style={{ display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', color: 'var(--md-on-surface-variant)' }}>
                  <IconCalendarMonth size={18} />
                </span>
              ) : <NavCircleBtn
                title={t('schedule_switch_table', { defaultValue: '切换课表' })}
                onClick={() => open('weekSwitcher', () => setShowSwitcher(true))}
              >
                <IconCalendarMonth size={18} />
              </NavCircleBtn>}
              {!readOnly && (undoDepth > 0 || redoDepth > 0) && (
                <UndoRedoCapsule
                  showUndo={undoDepth > 0}
                  showRedo={redoDepth > 0}
                  onUndo={async () => { if (!await undoManager.undo()) toast(t('schedule_undo_none')) }}
                  onRedo={async () => { if (!await undoManager.redo()) toast(t('schedule_redo_none')) }}
                />
              )}
            </div>

            {/* 翻页三件套 — 屏幕正中 (ScheduleScreen.kt:433-436 Box 叠加同构) */}
            <div className="week-controls" data-glass-role={weekGrouped ? "regular" : undefined} data-glass-group={weekGrouped ? "true" : undefined}>
              <NavCircleBtn
                glass={!weekGrouped}
                onClick={() => setWeek(Math.max(1, currentWeek - 1))}
                disabled={currentWeek <= 1}
                title={t('schedule_prev_week', { defaultValue: '上一周' })}
              >
                <IconChevronLeft size={18} />
              </NavCircleBtn>
              {/* 周次胶囊 — 在当前实际周点击弹跳周菜单, 否则一键跳回 (ScheduleScreen.kt:470-517) */}
              <div style={{ position: 'relative' }}>
                <span
                  onClick={() => (isOnActual ? open('weekJump', () => setJumpOpen(true)) : setWeek(null))}
                  className="m3-label-large week-label"
                  ref={weekAnchor}
                  data-glass-role={weekGrouped ? undefined : "regular"}
                  data-glass-plain={weekGrouped ? true : undefined}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOnActual ? open('weekJump', () => setJumpOpen(true)) : setWeek(null) } }}
                  role="button"
                  aria-label={weekLabel}
                  style={{
                    display: 'inline-block',
                    fontWeight: 600,
                    borderRadius: 12,
                    padding: '4px 14px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    background: isOnActual
                      ? 'var(--md-primary-container)'
                      : 'color-mix(in srgb, var(--md-primary-container) 60%, transparent)',
                    color: isOnActual ? 'var(--md-on-primary-container)' : 'var(--md-primary)',
                  }}
                >
                  <span data-week-text>{weekLabel}</span>
                </span>
                {jumpOpen && createPortal(
                  <>
                    <div
                      onClick={() => { leave(); setJumpOpen(false) }}
                      style={{ position: 'fixed', inset: 0, zIndex: 990 }}
                    />
                    <div
                      data-glass-role="menu" data-glass-motion="static"
                      style={{
                        position: 'fixed',
                        top: (weekAnchor.current?.getBoundingClientRect().bottom ?? 64) + 4,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 991,
                        width: Math.min(280, Math.max(0, window.innerWidth - 24)),
                        maxWidth: 'calc(100vw - 24px)',
                        padding: 12,
                        borderRadius: 12,
                        background: 'var(--md-surface-container-highest)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.24)',
                      }}
                    >
                      <div
                        className="m3-label-medium"
                        style={{ color: 'var(--md-on-surface-variant)', padding: '0 4px 8px' }}
                      >
                        {t('schedule_jump_week', { defaultValue: '跳转到周次' })}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => {
                          const isCurrent = w === currentWeek
                          return (
                            <div
                              data-glass-role="regular"
                              data-glass-selected={isCurrent ? "true" : undefined}
                              data-glass-tint={isCurrent ? "var(--md-primary)" : undefined}
                              key={w}
                              onClick={() => {
                                setWeek(w)
                                leave()
                                setJumpOpen(false)
                              }}
                              className="m3-label-large"
                              role="button"
                              aria-label={`${w}`}
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontWeight: isCurrent ? 700 : 400,
                                background: isCurrent ? 'var(--md-primary)' : 'var(--md-surface-container-high)',
                                color: isCurrent ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                              }}
                            >
                              {w}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>, document.body
                )}
              </div>
              <NavCircleBtn
                glass={!weekGrouped}
                onClick={() => setWeek(Math.min(maxWeek, currentWeek + 1))}
                disabled={currentWeek >= maxWeek}
                title={t('schedule_next_week', { defaultValue: '下一周' })}
              >
                <IconChevronRight size={18} />
              </NavCircleBtn>
            </div>

            {/* 右缘: 加课 + 分享 (ScheduleScreen.kt:530-540 WeekNavButton 对称位) */}
            <div className="toolbar-end">
              {!readOnly && <NavCircleBtn
                title={t('schedule_add_course', { defaultValue: '添加课程' })}
                disabled={!defaultTable}
                onClick={() => open('addCourse', () => { setImportTargetId(defaultTable?.id ?? 0); setImporting(true) })}
              >
                <IconAdd size={18} />
              </NavCircleBtn>}
              <NavCircleBtn
                title={t('schedule_share_table', { defaultValue: '分享课表' })}
                onClick={() => open('shareSheet', () => setShowShare(true))}
              >
                <IconIosShare size={18} />
              </NavCircleBtn>
            </div>
          </ScheduleToolbar>

          {/* SegmentedSwitcher — 周视图/网格 (ScheduleScreen.kt:196-204, 容器 surfaceContainer) */}
          {prefs.showViewSwitcher && (
            <div style={{ padding: '8px 16px' }}>
              <SegmentedSwitcher
                options={[t('view_full', { defaultValue: '周视图' }), t('view_cards', { defaultValue: '网格' })]}
                selected={display === 'full' ? 0 : 1}
                onSelect={(i) => setViewMode(i === 0 ? 'full' : 'cards')}
              />
            </div>
          )}

        </>
      )}

      {/* 示例课表提示条 — 首访教学, 关闭即永久 (Android 无此概念, web 特有) */}
      {defaultTable && !sampleBannerOff && sampleMeta?.id === String(defaultTable.id) && !sampleMeta.dismissed && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, margin: '0 16px 4px',
            padding: '10px 14px', borderRadius: 14,
            background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          }}
        >
          <span className="m3-body-small" style={{ flex: 1 }}>{t('sample_table_banner')}</span>
          <button
            onClick={() => {
              setSampleBannerOff(true)
              void db.prefs.put({ key: 'sampleBannerDismissed', value: '1' })
            }}
            data-glass-plain
            aria-label={t('sample_table_dismiss')}
            style={{
              border: 'none', cursor: 'pointer', flexShrink: 0, padding: 4,
              background: 'transparent', color: 'inherit', display: 'flex',
            }}
          >
            <IconClose size={18} />
          </button>
        </div>
      )}

      {/* 主体 — 左右滑动切换周次 (ScheduleScreen.kt:239 HorizontalPager 同构):
          轨道同时渲染 [上周|本周|下周] 三页并排, 整条平移 → 相邻两周连成一体一起移动
          (旧实现只平移当前页, 拖出来是空白 = 反馈"没连起来")。
          松手按半页位移 / fling 判定 → 落定动画滑到邻页槽位, 动画结束才提交周次,
          轨道以新周重居中时画面正好接上, 无跳变。
          滚动层 overflow 管纵向 (横向 hidden, 轨道 300% 宽不外溢), 轨道只管横向跟手;
          touch-action:pan-y 把纵向滚动让给浏览器, 只抢横向。 */}
      <div
        data-schedule-scroll
        ref={attachScheduleScroll}
        style={{ flex: 1, overflowX: 'hidden', overflowY: 'auto', touchAction: 'pan-y', userSelect: 'none', overscrollBehaviorX: 'contain' }}
        {...pagerHandlers}
      >
        {tableList === undefined ? null : !hasTable ? (
          // 真的没表: 导入或建表 (ScheduleScreen.kt:570-613 EmptyState)
          <div
            style={{
              minHeight: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 16px',
              boxSizing: 'border-box',
            }}
          >
            <EmptyStateCard
              onGoImport={() => open('addCourse', () => { setImportTargetId(null); setImporting(true) })}
              onCreateTable={createFirstTable}
            />
          </div>
        ) : allCourses === undefined ? null : allCourses.length === 0 ? (
          // 有表无课 (ScheduleScreen.kt:615-660 NoCourseState)
          <NoCourseCard
            tableName={defaultTable?.name ?? ''}
            onAddCourse={() => { if (defaultTable) open('addCourse', () => { setImportTargetId(defaultTable.id); setImporting(true) }) }}
            onImport={() => open('addCourse', () => { setImportTargetId(null); setImporting(true) })}
          />
        ) : defaultTable && pageWidth > 0 ? (
          <div
            style={{
              display: 'flex',
              width: `${trackWeeks.length * 100}%`,
              // 基准 = 把"本周"那一槽推到视口, 再叠加跟手位移
              transform: `translate3d(calc(${(-trackIndex * (100 / trackWeeks.length)).toFixed(4)}% + ${pagerOffsetPx}px), 0, 0)`,
              transition: pagerSettling
                ? `transform ${PAGER_SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`
                : 'none',
              willChange: 'transform',
            }}
          >
            {trackWeeks.map((w) => (
              <div
                key={w}
                data-schedule-week={w}
                style={{
                  width: `${100 / trackWeeks.length}%`,
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              >
                {display === 'full' ? (
                  <MemoFullWeekView
                    courses={coursesByWeek.get(w) ?? []}
                    timeJson={defaultTable.timeJson}
                    startDate={defaultTable.startDate}
                    currentWeek={w}
                    greyDays={greyDaysByWeek.get(w) ?? greyDays}
                    onCourseClick={showCourse}
                  />
                ) : (
                  <div style={{ padding: '0 8px 8px' }}>
                    <MemoCardsGridView
                      courses={coursesByWeek.get(w) ?? []}
                      timeJson={defaultTable.timeJson}
                      startDate={defaultTable.startDate}
                      currentWeek={w}
                      // -32: wrapper '0 8px' 左右 16 + CardsGridView 自身 padding 8px 四边 16 —
                      // colW 按 padding 内真实可用宽算 (Android BoxWithConstraints
                      // 在 padding(8dp) 内测量同构), 不扣则 minWidth > 容器 → 周日列截断
                      containerWidth={pageWidth - 32}
                      greyDays={greyDaysByWeek.get(w) ?? greyDays}
                      topOverrides={topOverrides}
                      onSetTopOverride={setTopOverride}
                      rotationSteps={rotationSteps}
                      onRotationStep={setRotationStep}
                      onCourseClick={showCourse}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {/* Dock 悬浮底栏: 滚动尾部多留 Dock 总高 (CourseTableView.kt:376/655 同构),
            最后一张课程卡能滚到 Dock 上方完全可见 */}
        {navExtraBottom > 0 && <div style={{ height: navExtraBottom, flexShrink: 0 }} />}
      </div>

      <ScheduleInteractionLayer rootRef={containerRef} table={defaultTable} courses={allCourses ?? []} week={currentWeek} readOnly={readOnly}
        onWeek={(next) => setWeek(next)} onMove={occurrenceActions.move} onDelete={occurrenceActions.remove} onEdit={(course,week,startInEdit) => { void occurrenceActions.openEdit(course,week,false,startInEdit) }}
        onQuickAdd={(seed) => { setQuickAdd(seed); open('addCourse', () => setAdding(true)) }} />
      {occurrenceActions.overlays}

      {/* 课表切换弹窗 (TableSwitcherDialog.kt 1:1) */}
      {showSwitcher && tableList !== undefined && (
        <TableSwitcherDialog
          tables={tableList}
          selectedTableId={defaultTable?.id ?? null}
          onSelect={(id) => {
            void (async () => {
              const { setDefault } = await import('../data/repository')
              await setDefault(id)
            })()
            leave()
            setShowSwitcher(false)
            resetForTableSwitch()
            setTopOverrides({})
            setRotationSteps({})
          }}
          onDismiss={() => { leave(); setShowSwitcher(false) }}
        />
      )}

      {/* 顶栏分享底部弹窗 (ShareScheduleSheet — 全表课程, Android state.courses 同域) */}
      {showShare && defaultTable && (
        <ShareScheduleSheetView
          table={defaultTable}
          courses={allCourses ?? []}
          onDismiss={() => { leave(); setShowShare(false) }}
        />
      )}

      {/* 课程详情弹层 — allCourses 与网格同周域 (防 ICS 拆行幽灵簇, ScheduleScreen.kt:293-296) */}
      {detailCourse && defaultTable && (
        <CourseDetailSheet
          course={detailCourse}
          allCourses={weekCourses}
          timeJson={defaultTable.timeJson}
          onDismiss={() => { leave(); setDetailCourse(null) }}
          onEdit={readOnly ? undefined : (c) => {
            useBackStack.getState().replace('addCourse')
            startTransition(() => { setDetailCourse(null); setEditingCourse(c) })
          }}
          onAdjustOccurrence={readOnly ? undefined : (course) => { setDetailCourse(null); void occurrenceActions.openEdit(course,currentWeek,true) }}
          onDeleteOccurrence={readOnly ? undefined : (course) => { void occurrenceActions.remove(course,currentWeek).then((saved) => { if(saved) { leave(); setDetailCourse(null) } }) }}
          onDefaultTopChanged={handleDefaultTopChanged}
        />
      )}

      {/* 撤回/重做失败 toast — Android SnackbarHost 底部居中同位 */}
      {toastMsg !== '' && (
        <div
          role="status"
          className="m3-body-medium"
          style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, maxWidth: 'calc(100vw - 32px)', padding: '10px 16px', borderRadius: 8,
            background: 'var(--md-inverse-surface, var(--md-surface-container-highest))',
            color: 'var(--md-inverse-on-surface, var(--md-on-surface))',
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ── 子组件 ──────────────────────────────────────────────────────────────

/** WeekNavButton — 32dp 圆底 surfaceContainerHigh + onSurfaceVariant tint (ScheduleScreen.kt:524-541) */
function NavCircleBtn({
  children,
  onClick,
  disabled,
  title,
  glass = true,
}: {
  glass?: boolean
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-glass-role={glass ? "regular" : undefined}
      data-glass-icon={glass ? "true" : undefined}
      data-glass-plain={!glass ? true : undefined}
      className="schedule-icon-button"
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        border: 'none',
        padding: 0,
        flexShrink: 0,
        background: 'var(--md-surface-container-high)',
        color: disabled ? 'var(--md-outline)' : 'var(--md-on-surface-variant)',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

/**
 * IconUndo — Icons.AutoMirrored.Outlined.Undo 同形矢量 (material 24dp undo path)。
 * 落点暂置本文件: icons.tsx 属 T14 分区, T14 落地后迁移归位。
 */
function IconUndo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden="true">
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
    </svg>
  )
}

/**
 * IconRedo — Icons.AutoMirrored.Outlined.Redo 同形矢量 (undo 的水平镜像)。
 */
function IconRedo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden="true">
      <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" />
    </svg>
  )
}

/**
 * UndoRedoCapsule — ScheduleScreen.kt:692-750 1:1 (2026-09-21 定令):
 * 体育场胶囊 surfaceContainerHigh, 左右半 32×32 各一 icon, 中缝 1×14 淡竖线
 * (onSurfaceVariant@Alpha.inactive); 无快照侧半透明禁用 (alpha .38 占位保形);
 * hasUndo||hasRedo 才渲染整个胶囊 (ScheduleScreen.kt:520)。web 无捏合缩放 → scale=1。
 */
function UndoRedoCapsule({
  showUndo,
  showRedo,
  onUndo,
  onRedo,
}: {
  showUndo: boolean
  showRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const half = 32
  return (
    <div
      data-glass-role="regular" data-glass-group="true"
      style={{
        height: half,
        borderRadius: half / 2,
        background: 'var(--md-surface-container-high)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'visible',
      }}
    >
      <button
        type="button"
        data-glass-plain
        aria-label="撤回"
        disabled={!showUndo}
        onClick={onUndo}
        style={{
          width: half, height: half, border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: showUndo ? 'pointer' : 'default', padding: 0,
          color: 'var(--md-on-surface-variant)', opacity: showUndo ? 1 : 0.38,
        }}
      >
        <IconUndo size={20} />
      </button>
      <div
        style={{
          width: 1, height: 14, flexShrink: 0,
          // Alpha.inactive = 0.6 (Theme.kt:385, ScheduleScreen.kt:730)
          background: 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)',
        }}
      />
      <button
        type="button"
        data-glass-plain
        aria-label="取消撤回"
        disabled={!showRedo}
        onClick={onRedo}
        style={{
          width: half, height: half, border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: showRedo ? 'pointer' : 'default', padding: 0,
          color: 'var(--md-on-surface-variant)', opacity: showRedo ? 1 : 0.38,
        }}
      >
        <IconRedo size={20} />
      </button>
    </div>
  )
}

/** TableSwitcherDialog — ScheduleScreen.kt:319-388 1:1 (居中弹窗 + 列表 + 当前表高亮对勾) */
function TableSwitcherDialog({
  tables,
  selectedTableId,
  onSelect,
  onDismiss,
}: {
  tables: Table[]
  selectedTableId: number | null
  onSelect: (id: number) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'color-mix(in srgb, var(--md-scrim) 32%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        data-glass-role="alert" data-glass-motion="static"
        role="dialog"
        aria-modal="true"
        aria-label={t('schedule_switch_table', { defaultValue: '切换课表' })}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 28,
          background: 'var(--md-surface-container-high)',
          color: 'var(--md-on-surface)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="m3-title-large">{t('schedule_switch_table', { defaultValue: '切换课表' })}</div>
        <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tables.map((tb) => {
            const isCurrent = tb.id === selectedTableId
            return (
              <div
                key={tb.id}
                onClick={() => onSelect(tb.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 8,
                  padding: '10px 8px',
                  cursor: 'pointer',
                  background: isCurrent ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
                }}
              >
                <span
                  className="m3-body-medium"
                  style={{
                    flex: 1,
                    fontWeight: 500,
                    color: isCurrent ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {tb.name}
                </span>
                {isCurrent && (
                  <span style={{ color: 'var(--md-primary)', flexShrink: 0, display: 'flex' }}>
                    <IconCheck size={18} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** EmptyState — ScheduleScreen.kt:662-713 1:1 (extraLarge 28 圆角 + 22/24 padding + 双入口分离) */
function EmptyStateCard({ onGoImport, onCreateTable }: { onGoImport: () => void; onCreateTable: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        width: 'auto',
        // ScheduleScreen.kt EmptyState: Column 外衬 horizontal=22 → 卡体再内缩 22
        margin: '0 22px',
        background: 'var(--md-surface-container)',
        borderRadius: 28,
        padding: '24px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div className="m3-title-large" style={{ fontWeight: 600 }}>{t('schedule_empty', { defaultValue: '还没有课表' })}</div>
      <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('schedule_empty_hint', { defaultValue: '前往课表管理导入，或手动创建第一张课表。' })}
      </div>
      <button
        data-glass-role="tinted" data-glass-tint="var(--md-primary)"
        onClick={onGoImport}
        style={{
          width: '100%', height: 56, borderRadius: 16, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 14, fontWeight: 500,
        }}
      >
        {t('schedule_empty_import', { defaultValue: '导入第一张课表' })}
      </button>
      <button
        data-glass-role="tinted" data-glass-tint="var(--md-secondary-container)"
        onClick={onCreateTable}
        style={{
          width: '100%', height: 56, borderRadius: 16, border: 'none', cursor: 'pointer',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          fontSize: 14, fontWeight: 500,
        }}
      >
        {t('schedule_empty_create_table', { defaultValue: '创建第一张课表' })}
      </button>
    </div>
  )
}

/** NoCourseState — ScheduleScreen.kt:615-660 1:1 (表名插入 + 加课 primary / 导入 secondary) */
function NoCourseCard({
  tableName,
  onAddCourse,
  onImport,
}: {
  tableName: string
  onAddCourse: () => void
  onImport: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        margin: '12px 16px',
        background: 'var(--md-surface-container)',
        borderRadius: 28,
        padding: '24px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div className="m3-title-large" style={{ fontWeight: 600 }}>
        {t('schedule_empty_name', { v1: tableName, defaultValue: `「${tableName}」还是空的` })}
      </div>
      <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('schedule_empty_name_hint', { defaultValue: '给这张课表添加课程，或导入一张新课表' })}
      </div>
      <button
        data-glass-role="tinted" data-glass-tint="var(--md-primary)"
        onClick={onAddCourse}
        style={{
          width: '100%', height: 56, borderRadius: 16, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 14, fontWeight: 500,
        }}
      >
        {t('schedule_manual_first', { defaultValue: '先手动添加一门课' })}
      </button>
      <button
        data-glass-role="tinted" data-glass-tint="var(--md-secondary-container)"
        onClick={onImport}
        style={{
          width: '100%', height: 56, borderRadius: 16, border: 'none', cursor: 'pointer',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          fontSize: 14, fontWeight: 500,
        }}
      >
        {t('schedule_go_manage', { defaultValue: '前往导入' })}
      </button>
    </div>
  )
}
