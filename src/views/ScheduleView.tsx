/**
 * ScheduleView — 课表主 tab
 * 顶栏 (logo/撤回/周翻/视图切换/分享) + FullWeekView/CardsGridView 双模式 +
 * 周选择器 (第 N 周) + 学期周计算。
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'
import { undoManager, useUndoStore } from '../data/undoStore'
import { CardsGridView } from '../components/schedule/CardsGridView'
import { FullWeekView } from '../components/schedule/FullWeekView'
import type { Course } from '../data/types'

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

export function ScheduleView() {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const updatePrefs = usePrefsStore((s) => s.update)
  const [week, setWeek] = useState<number | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const containerRef = useRef<HTMLDivElement>(null)

  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const courses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id]
  )

  const maxWeek = defaultTable?.maxWeek ?? 20
  const autoWeek = useMemo(
    () => computeCurrentWeek(defaultTable?.startDate ?? '', maxWeek),
    [defaultTable?.startDate, maxWeek]
  )
  const currentWeek = week ?? autoWeek

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const display = prefs.displayMode

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} ref={containerRef}>
      {/* 顶栏: 课表名 + 撤回 + 周选择器 + 视图切换 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px 6px',
        }}
      >
        <span className="m3-title-large" style={{ fontWeight: 600, flexShrink: 0 }}>
          {defaultTable?.name ?? t('app_name')}
        </span>
        <div style={{ flex: 1 }} />
        <IconBtn
          title={t('schedule_undo')}
          onClick={() => void undoManager.undo()}
          disabled={useUndoStore.getState().undoStack.length === 0}
        >
          ↩
        </IconBtn>
        {/* 周选择器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconBtn
            onClick={() => setWeek(Math.max(1, currentWeek - 1))}
            disabled={currentWeek <= 1}
            title={t('schedule_undo')}
          >
            ‹
          </IconBtn>
          <span
            className="m3-label-large"
            style={{ minWidth: 64, textAlign: 'center', color: 'var(--md-primary)' }}
          >
            {t('schedule_current_week', { v1: currentWeek })}
          </span>
          <IconBtn
            onClick={() => setWeek(Math.min(maxWeek, currentWeek + 1))}
            disabled={currentWeek >= maxWeek}
            title={t('schedule_current_week', { v1: currentWeek })}
          >
            ›
          </IconBtn>
        </div>
        {/* 视图切换: full=周视图 / cards=网格 */}
        <IconBtn
          title={display === 'full' ? t('display_cards', '网格视图') : t('display_full', '周视图')}
          onClick={() => void updatePrefs({ displayMode: display === 'full' ? 'cards' : 'full' })}
        >
          {display === 'full' ? '▦' : '☰'}
        </IconBtn>
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!defaultTable ? (
          <EmptyHint text={t('schedule_empty_create_table')} />
        ) : display === 'full' ? (
          <FullWeekView
            courses={courses ?? []}
            timeJson={defaultTable.timeJson}
            onCourseClick={() => {}}
          />
        ) : (
          <div style={{ padding: '0 8px 8px' }}>
            <CardsGridView
              courses={courses ?? []}
              timeJson={defaultTable.timeJson}
              startDate={defaultTable.startDate}
              currentWeek={currentWeek}
              containerWidth={containerWidth - 16}
              onCourseClick={() => {}}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function IconBtn({
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
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        border: 'none',
        background: 'transparent',
        color: disabled ? 'var(--md-outline)' : 'var(--md-on-surface)',
        fontSize: 18,
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        gap: 12,
        color: 'var(--md-on-surface-variant)',
      }}
    >
      <span style={{ fontSize: 48, opacity: 0.4 }}>📅</span>
      <span className="m3-body-medium">{text}</span>
    </div>
  )
}
