/**
 * ScheduleView — 课表主 tab (ScheduleScreen.kt 1:1)
 * TopBar (左: 切换课表/撤回 · 中: 周翻页三件套+跳周菜单 · 右: 加课/分享) +
 * SegmentedSwitcher (周视图/网格, 会话级) + FullWeekView/CardsGridView 双模式 +
 * EmptyState/NoCourseState 双空态 (ScheduleScreen.kt:570-613) +
 * TableSwitcherDialog + ShareScheduleSheet 接线 +
 * 课程按当前周 inWeek 过滤 (ScheduleScreen.kt:236) +
 * 节假日/周末灰显 (HolidayManager.shouldGrey web 同构: 网络源 + localStorage 磁盘缓存)。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconChevronLeft, IconChevronRight,
  IconCalendarMonth, IconAdd, IconIosShare, IconCheck,
} from '../components/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'
import { useBackStack } from '../state/backStack'
import { undoManager, useUndoStore } from '../data/undoStore'
import { CardsGridView, dateOfWeek } from '../components/schedule/CardsGridView'
import { FullWeekView } from '../components/schedule/FullWeekView'
import { CourseDetailSheet } from '../components/CourseDetailSheet'
import { AddCourseView } from './AddCourseView'
import { ImportView } from './ImportView'
import { ShareScheduleSheetView } from './ExportView'
import { EditTableView } from './EditTableView'
import { semesterStatus } from './TodayView'
import { insertTable } from '../data/repository'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import { inWeek, normalizeNode } from '../data/types'
import type { Course, Table } from '../data/types'
import { useWeekPager } from '../components/schedule/useWeekSwipe'

/** 周次计算 — startDate (周一) 起 currentWeek = floor(diff/7)+1, clamp 1..maxWeek */
export function computeCurrentWeek(startDate: string, maxWeek: number): number {
  if (!startDate) return 1
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!m) return 1
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
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
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000)
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

// ── 节假日灰显 — HolidayManager.shouldGrey web 同构 ─────────────────────
// 数据源与 Android 相同: unpkg holiday-calendar (gitcode.com/zy-mayong/publicHoliday,
// MIT)。取数顺序 内存缓存 → localStorage 磁盘缓存(拉成功一次永久) → 网络, 失败静默
// (仅周末灰显, 与 Android 离线兜底同语义)。用户范围化覆盖段 (HolidayRangeOps) web
// 偏好模型暂无对应, 不做 — 与 Android 默认态 (无覆盖) 一致。

/** 某年节假日数据 — ISO 日期集合 */
export interface HolidayYearData {
  holidays: Set<string>
  workdays: Set<string>
}

/** 模块级内存缓存 — null = 已确认拉取失败 (进程内不再重试, Android yearFetchFailed 同构) */
const holidayCache = new Map<number, HolidayYearData | null>()

function parseHolidayJson(text: string): HolidayYearData {
  const holidays = new Set<string>()
  const workdays = new Set<string>()
  try {
    const obj = JSON.parse(text) as { dates?: { date: string; type: string }[] }
    for (const d of obj.dates ?? []) {
      if (d.type === 'public_holiday') holidays.add(d.date)
      else if (d.type === 'transfer_workday') workdays.add(d.date)
    }
  } catch {
    /* 坏数据当空 → 仅周末灰显 */
  }
  return { holidays, workdays }
}

function fetchYearIfNeeded(year: number): Promise<HolidayYearData | null> {
  const cached = holidayCache.get(year)
  if (cached !== undefined) return Promise.resolve(cached)
  const cacheKey = `sleepy_holiday_cn_${year}`
  try {
    const raw = localStorage.getItem(cacheKey)
    if (raw !== null) {
      const parsed = parseHolidayJson(raw)
      holidayCache.set(year, parsed)
      return Promise.resolve(parsed)
    }
  } catch {
    /* localStorage 不可用 → 走网络 */
  }
  return fetch(`https://unpkg.com/holiday-calendar/data/CN/${year}.json`)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
    .then((text) => {
      try {
        localStorage.setItem(cacheKey, text)
      } catch {
        /* 忽略配额/隐私模式失败 */
      }
      const parsed = parseHolidayJson(text)
      holidayCache.set(year, parsed)
      return parsed
    })
    .catch(() => {
      holidayCache.set(year, null)
      return null
    })
}

/** 纯函数 — 某周灰显天集合 (1=周一..7=周日); 无年数据时仅周末灰显 */
export function holidayGreyDaysForWeek(
  startDate: string,
  week: number,
  yearData: Map<number, HolidayYearData>
): Set<number> {
  const out = new Set<number>()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return out
  for (let day = 1; day <= 7; day++) {
    const d = dateOfWeek(startDate, week, day)
    if (!d) continue
    const isWeekend = day >= 6
    const data = yearData.get(d.getFullYear())
    if (data) {
      // 法定节假日灰显 (greyHoliday=true 默认)
      if (data.holidays.has(isoDate(d))) {
        out.add(day)
        continue
      }
      // 周末灰显, 补班日豁免 (greyWeekend=true + ignoreWorkday=true 默认)
      if (isWeekend) {
        if (!data.workdays.has(isoDate(d))) out.add(day)
      }
    } else if (isWeekend) {
      out.add(day)
    }
  }
  return out
}

function isoDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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

/** 年数据拉取 hook — 就绪后触发重渲染, 纯增量 */
function useHolidayYearData(years: number[]): Map<number, HolidayYearData> {
  const [data, setData] = useState<Map<number, HolidayYearData>>(new Map())
  const key = years.join(',')
  useEffect(() => {
    if (years.length === 0) return
    let alive = true
    void Promise.all(years.map((y) => fetchYearIfNeeded(y))).then((list) => {
      if (!alive) return
      const m = new Map<number, HolidayYearData>()
      years.forEach((y, i) => {
        const v = list[i]
        if (v) m.set(y, v)
      })
      setData(m)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return data
}

export function ScheduleView({ navExtraBottom = 0 }: { navExtraBottom?: number }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const updatePrefs = usePrefsStore((s) => s.update)
  // 视图模式: 会话级 state, 初始值取 startView 偏好 — 手动切换不写回 (Android MainActivity
  // ViewMode 同语义: getStartView 只决定启动进入哪一视图)
  const [viewMode, setViewMode] = useState<'full' | 'cards' | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [detailCourse, setDetailCourse] = useState<Course | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [editingTableId, setEditingTableId] = useState<number | null>(null)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const back = useBackStack((s) => s.pop)
  const push = useBackStack((s) => s.push)

  // 二级页 push 入栈 (浏览器返回可弹), 返回按钮 pop 出栈。
  const enter = (key: Parameters<typeof push>[0]) => push(key)
  const leave = () => back()

  // 撤回深度 — 响应式订阅 ( getState() 不触发重渲染, 仅作渲染条件用)
  const undoDepth = useUndoStore((s) => s.undoStack.length)

  const tableList = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) as Table[] | undefined
  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const allCourses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id]
  )

  const maxWeek = defaultTable?.maxWeek ?? 20
  const currentWeek = week ?? computeCurrentWeek(defaultTable?.startDate ?? '', maxWeek)
  const actualWeek = useMemo(
    () => actualWeekOf(defaultTable?.startDate ?? ''),
    [defaultTable?.startDate]
  )
  const status = semesterStatus(defaultTable?.startDate ?? '', maxWeek, new Date())
  const isOnActual = currentWeek === actualWeek
  const weekLabel =
    status === 'IN_RANGE'
      ? t('schedule_current_week', { v1: currentWeek })
      : `${t(status === 'BEFORE_START' ? 'semester_not_started' : 'semester_ended', {
          defaultValue: status === 'BEFORE_START' ? '学期未开始' : '学期已结束',
        })} · ${t('schedule_week_prefix', { v1: currentWeek, defaultValue: `第 ${currentWeek} 周` })}`

  // 课程按当前周过滤 + normalizeNode (ScheduleScreen.kt:236-241 HorizontalPager 同构) —
  // 切周次 → weekCourses 变化 → 网格/周视图只显示本周应有的课
  const weekCourses = useMemo(() => {
    const list = allCourses ?? []
    if (!defaultTable) return []
    const tj = defaultTable.timeJson
    return list.filter((c) => inWeek(c, currentWeek)).map((c) => (tj ? normalizeNode(c, tj) : c))
  }, [allCourses, currentWeek, defaultTable])

  // 节假日/周末灰显 (ScheduleScreen.kt:242-254 produceState 同构)
  const greyYears = useMemo(
    () => yearsSpanned(defaultTable?.startDate ?? '', currentWeek),
    [defaultTable?.startDate, currentWeek]
  )
  const holidayData = useHolidayYearData(greyYears)
  const greyDays = useMemo(
    () => holidayGreyDaysForWeek(defaultTable?.startDate ?? '', currentWeek, holidayData),
    [defaultTable?.startDate, currentWeek, holidayData]
  )

  // 主页左右滑动切换周次 + 跟手翻页动画 (ScheduleScreen.kt HorizontalPager 同构):
  // touchmove 位移→offset→transform 跟手; 松手 pagerTargetWeek (阈值+fling)→setWeek;
  // 外部周次变化 (TopBar 箭头/跳周菜单/切表) → effect 清位移 (scrollToPage 同位)
  const pager = useWeekPager((w) => setWeek(w), maxWeek, currentWeek)

  // v7.10.5 会话级置顶 override — 网格 onPickTop 与详情弹窗 radio 共用真相源 (Android 同构)
  const [topOverrides, setTopOverrides] = useState<Record<string, number>>({})
  // v7.10.16r 轮换态 (issue#10) — 簇键 → 轮换步数, 会话级不落盘
  const [rotationSteps, setRotationSteps] = useState<Record<string, number>>({})

  function setTopOverride(key: string, courseId: number | null) {
    setTopOverrides((prev) => {
      const next = { ...prev }
      if (courseId == null) delete next[key]
      else next[key] = courseId
      return next
    })
  }

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const display = viewMode ?? prefs.startView

  if (importing) {
    enter('addCourse')
    return <ImportView onDone={() => { leave(); setImporting(false) }} />
  }

  if (adding || editingCourse) {
    enter('addCourse')
    return (
      <AddCourseView
        editingCourse={editingCourse}
        onBack={() => { leave(); setAdding(false); setEditingCourse(null) }}
        onSaved={() => { leave(); setAdding(false); setEditingCourse(null) }}
      />
    )
  }

  // 建表流 (EmptyState 副按钮) — 插表后进 EditTableView (Android onCreateTable 同语义)
  if (editingTableId !== null) {
    enter('editTable')
    return (
      <EditTableView
        tableId={editingTableId}
        onBack={() => { leave(); setEditingTableId(null) }}
        onSaved={() => { leave(); setEditingTableId(null) }}
        onDeleted={() => { leave(); setEditingTableId(null) }}
      />
    )
  }

  async function createFirstTable() {
    const n = (tableList ?? []).length + 1
    const id = await insertTable({
      name: `课表 ${n}`,
      startDate: '',
      timeJson: DEFAULT_TIME_JSON,
      isDefault: (tableList ?? []).length === 0 ? 1 : 0,
      maxWeek: 20,
      createdAt: Date.now(),
      smartConfigJson: '',
      nodeCount: 12,
    })
    setEditingTableId(id)
  }

  const hasTable = (tableList ?? []).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }} ref={containerRef}>
      {/* 顶栏 — 无表不渲染 (Android !hasTable 直接 EmptyState 全屏, ScheduleScreen.kt:142-159) */}
      {hasTable && (
        <>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 12px',
              background: 'var(--md-surface)',
            }}
          >
            {/* 左缘: 切换课表 + 撤回 (仅有可撤回快照时显示, ScheduleScreen.kt:417-428) */}
            <div style={{ position: 'absolute', left: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <NavCircleBtn
                title={t('schedule_switch_table', { defaultValue: '切换课表' })}
                onClick={() => { enter('editTable'); setShowSwitcher(true) }}
              >
                <IconCalendarMonth size={18} />
              </NavCircleBtn>
              {undoDepth > 0 && (
                <NavCircleBtn
                  title={t('schedule_undo', { defaultValue: '撤回' })}
                  onClick={() => void undoManager.undo()}
                >
                  <IconUndo size={18} />
                </NavCircleBtn>
              )}
            </div>

            {/* 翻页三件套 — 屏幕正中 (ScheduleScreen.kt:433-436 Box 叠加同构) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NavCircleBtn
                onClick={() => setWeek(Math.max(1, currentWeek - 1))}
                disabled={currentWeek <= 1}
                title={t('schedule_prev_week', { defaultValue: '上一周' })}
              >
                <IconChevronLeft size={18} />
              </NavCircleBtn>
              {/* 周次胶囊 — 在当前实际周点击弹跳周菜单, 否则一键跳回 (ScheduleScreen.kt:470-517) */}
              <div style={{ position: 'relative' }}>
                <span
                  onClick={() => (isOnActual ? (enter('editTable'), setJumpOpen(true)) : setWeek(null))}
                  className="m3-label-large"
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
                  {weekLabel}
                </span>
                {jumpOpen && (
                  <>
                    <div
                      onClick={() => { leave(); setJumpOpen(false) }}
                      style={{ position: 'fixed', inset: 0, zIndex: 990 }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 991,
                        width: 280,
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
                  </>
                )}
              </div>
              <NavCircleBtn
                onClick={() => setWeek(Math.min(maxWeek, currentWeek + 1))}
                disabled={currentWeek >= maxWeek}
                title={t('schedule_next_week', { defaultValue: '下一周' })}
              >
                <IconChevronRight size={18} />
              </NavCircleBtn>
            </div>

            {/* 右缘: 加课 + 分享 (ScheduleScreen.kt:530-540 WeekNavButton 对称位) */}
            <div style={{ position: 'absolute', right: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <NavCircleBtn
                title={t('schedule_add_course', { defaultValue: '添加课程' })}
                onClick={() => setAdding(true)}
              >
                <IconAdd size={18} />
              </NavCircleBtn>
              <NavCircleBtn
                title={t('schedule_share_table', { defaultValue: '分享课表' })}
                onClick={() => { enter('editTable'); setShowShare(true) }}
              >
                <IconIosShare size={18} />
              </NavCircleBtn>
            </div>
          </div>

          {/* SegmentedSwitcher — 周视图/网格 (ScheduleScreen.kt:196-204, 容器 surfaceContainer) */}
          <div style={{ padding: '8px 16px' }}>
            <SegmentedSwitcher<'full' | 'cards'>
              options={[
                ['full', t('view_full', { defaultValue: '周视图' })],
                ['cards', t('view_cards', { defaultValue: '网格' })],
              ]}
              selected={display}
              onSelect={(v) => setViewMode(v)}
            />
          </div>

        </>
      )}

      {/* 主体 — 左右滑动切换周次 + 跟手翻页动画 (HorizontalPager 页面实时平移同构):
          touchmove 位移→transform 跟手; 松手 pagerTargetWeek (阈值+fling)→翻页/回弹。
          transition 只在松手后开 (跟手期间禁用, 否则位移滞后于手指)。
          内容平移层独立于滚动层 — 滚动层 overflow:auto 管纵向, 平移层只管横向跟手 */}
      <div style={{ flex: 1, overflow: 'auto' }} {...pager}>
        <div
          style={{
            transform: `translateX(${pager.offset}px)`,
            transition: pager.animating ? 'transform 200ms cubic-bezier(0.2, 0, 0, 1)' : 'none',
            willChange: 'transform',
          }}
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
              onGoImport={() => setImporting(true)}
              onCreateTable={() => void createFirstTable()}
            />
          </div>
        ) : allCourses === undefined ? null : allCourses.length === 0 ? (
          // 有表无课 (ScheduleScreen.kt:615-660 NoCourseState)
          <NoCourseCard
            tableName={defaultTable?.name ?? ''}
            onAddCourse={() => setAdding(true)}
            onImport={() => setImporting(true)}
          />
        ) : defaultTable ? (
          display === 'full' ? (
            <FullWeekView
              courses={weekCourses}
              timeJson={defaultTable.timeJson}
              greyDays={greyDays}
              onCourseClick={(c) => { enter('editTable'); setDetailCourse(c) }}
            />
          ) : (
            <div style={{ padding: '0 8px 8px' }}>
              <CardsGridView
                courses={weekCourses}
                timeJson={defaultTable.timeJson}
                startDate={defaultTable.startDate}
                currentWeek={currentWeek}
                // -32: wrapper '0 8px' 左右 16 + CardsGridView 自身 padding 8px 四边 16 —
                // colW 按 padding 内真实可用宽算 (Android BoxWithConstraints
                // 在 padding(8dp) 内测量同构), 不扣则 minWidth > 容器 → 周日列截断
                containerWidth={containerWidth - 32}
                greyDays={greyDays}
                topOverrides={topOverrides}
                onSetTopOverride={setTopOverride}
                rotationSteps={rotationSteps}
                onRotationStep={(key, step) =>
                  setRotationSteps((prev) => {
                    const next = { ...prev }
                    if (step <= 0) delete next[key]
                    else next[key] = step
                    return next
                  })
                }
                onCourseClick={(c) => { enter('editTable'); setDetailCourse(c) }}
              />
            </div>
          )
        ) : null}
        </div>
        {/* Dock 悬浮底栏: 滚动尾部多留 Dock 总高 (CourseTableView.kt:376/655 同构),
            最后一张课程卡能滚到 Dock 上方完全可见 */}
        {navExtraBottom > 0 && <div style={{ height: navExtraBottom, flexShrink: 0 }} />}
      </div>

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
            setWeek(null)
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
          onEdit={(c) => {
            leave(); setDetailCourse(null)
            setEditingCourse(c)
          }}
          onDefaultTopChanged={handleDefaultTopChanged}
        />
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
}: {
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
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
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
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
    </svg>
  )
}

/**
 * SegmentedSwitcher — ui/component/SegmentedSwitcher.kt web 同构。
 * 容器 surfaceContainer 42px 圆角 14; 选中段 secondaryContainer thumb 色块圆角 10;
 * 文字 label-large 选中 SemiBold 平时 Medium。弹簧动画以 CSS transition 近似
 * (物理弹簧逐帧逐字上色为 Compose 特有实现, web 端 thumb 平移 + 文字整段翻色)。
 */
function SegmentedSwitcher<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: [T, string][]
  selected: T
  onSelect: (v: T) => void
}) {
  const idx = Math.max(0, options.findIndex(([v]) => v === selected))
  const count = Math.max(1, options.length)
  return (
    <div
      role="tablist"
      style={{
        position: 'relative',
        height: 42,
        borderRadius: 14,
        background: 'var(--md-surface-container)',
        padding: 4,
        display: 'flex',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: `calc(4px + ${idx} * (100% - 8px) / ${count})`,
          width: `calc((100% - 8px) / ${count})`,
          borderRadius: 10,
          background: 'var(--md-secondary-container)',
          transition: 'left 180ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      />
      {options.map(([v, label], i) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === selected}
          onClick={() => onSelect(v)}
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <span
            className="m3-label-large"
            style={{
              fontWeight: i === idx ? 600 : 500,
              color: i === idx ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
            }}
          >
            {label}
          </span>
        </button>
      ))}
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
                  borderRadius: 12,
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
        width: '100%',
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
        onClick={onGoImport}
        style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 15, fontWeight: 600,
        }}
      >
        {t('schedule_empty_import', { defaultValue: '导入第一张课表' })}
      </button>
      <button
        onClick={onCreateTable}
        style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          fontSize: 15, fontWeight: 600,
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
        onClick={onAddCourse}
        style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 15, fontWeight: 600,
        }}
      >
        {t('schedule_manual_first', { defaultValue: '先手动添加一门课' })}
      </button>
      <button
        onClick={onImport}
        style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          fontSize: 15, fontWeight: 600,
        }}
      >
        {t('schedule_go_manage', { defaultValue: '前往导入' })}
      </button>
    </div>
  )
}
