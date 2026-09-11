/**
 * TodayView — 今日 tab (TodayScreen.kt 1:1)
 * TodayHeader (日期+周次/学期状态 chip) + EmptyToday 三分支 + 冲突分栏课程卡。
 * 学期外感知: BEFORE_START/AFTER_END 时今日课不按周过滤展示。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'
import { weekLaneRows } from '../domain/conflictLayout'
import { courseTimeString } from '../domain/timeTable'
import { pickCourseColorWithGroupRows, textColorOn, parseHex } from '../domain/courseColor'
import { inWeek, normalizeNode } from '../data/types'
import type { Course } from '../data/types'
import { localizedDay } from '../components/schedule/CardsGridView'

type SemesterStatus = 'BEFORE_START' | 'IN_RANGE' | 'AFTER_END'

export function semesterStatus(startDate: string, maxWeek: number, today: Date): SemesterStatus {
  if (!startDate) return 'IN_RANGE'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!m) return 'IN_RANGE'
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
  if (diffDays < 0) return 'BEFORE_START'
  if (diffDays >= maxWeek * 7) return 'AFTER_END'
  return 'IN_RANGE'
}

export function TodayView() {
  const { t, i18n } = useTranslation()
  const today = useMemo(() => new Date(), [])
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()

  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const allCourses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id]
  )

  const status = useMemo(
    () => semesterStatus(defaultTable?.startDate ?? '', defaultTable?.maxWeek ?? 20, today),
    [defaultTable?.startDate, defaultTable?.maxWeek, today]
  )
  const actualWeek = useMemo(() => {
    if (!defaultTable?.startDate) return 1
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(defaultTable.startDate)
    if (!m) return 1
    const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
    return Math.max(1, Math.floor(diffDays / 7) + 1)
  }, [defaultTable?.startDate, today])

  const isOut = status !== 'IN_RANGE'
  const todayCourses = useMemo(() => {
    if (isOut) return []
    let list = (allCourses ?? []).filter((c) => c.day === dayOfWeek && inWeek(c, actualWeek))
    const tj = defaultTable?.timeJson
    if (tj) list = list.map((c) => normalizeNode(c, tj))
    return list.sort((a, b) => a.startNode - b.startNode)
  }, [allCourses, dayOfWeek, actualWeek, isOut, defaultTable?.timeJson])

  const laneRows = useMemo(
    () => weekLaneRows(todayCourses, defaultTable?.timeJson ?? null),
    [todayCourses, defaultTable?.timeJson]
  )

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TodayHeader
        date={today}
        week={actualWeek}
        count={todayCourses.length}
        semesterStatus={status}
        lang={i18n.language}
      />
      {todayCourses.length === 0 ? (
        <EmptyToday semesterStatus={status} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="m3-title-medium" style={{ fontWeight: 600 }}>
              {t('widget_today_label')}
            </span>
            <span className="m3-label-medium" style={{ color: 'var(--md-primary)' }}>
              {t('n_course_periods', { v1: todayCourses.length })}
            </span>
          </div>
          {laneRows.map((row, ri) => {
            if (row.laneCount === 1) {
              const c = row.courses[0]
              return (
                <TodayCourseCard
                  key={`r-${ri}`}
                  course={c}
                  timeJson={defaultTable?.timeJson}
                  groupRows={todayCourses.filter((x) => x.groupId === c.groupId)}
                />
              )
            }
            return (
              <div key={`rc-${ri}`} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                {Array.from({ length: row.laneCount }, (_, li) => (
                  <div key={li} style={{ display: 'flex', flex: 1, gap: 6 }}>
                    {li > 0 && (
                      <div
                        style={{
                          width: 0.5,
                          background: 'color-mix(in srgb, var(--md-on-surface) 30%, transparent)',
                          alignSelf: 'stretch',
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {row.courses
                        .filter((c) => row.laneOf.get(c.id) === li)
                        .map((c) => (
                          <TodayCourseCard
                            key={c.id}
                            course={c}
                            timeJson={defaultTable?.timeJson}
                            groupRows={todayCourses.filter((x) => x.groupId === c.groupId)}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function TodayHeader({
  date,
  week,
  count,
  semesterStatus,
  lang,
}: {
  date: Date
  week: number
  count: number
  semesterStatus: SemesterStatus
  lang: string
}) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        borderRadius: 28,
        background: 'var(--md-surface-container)',
        padding: 16,
      }}
    >
      <span className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('today_today')}
      </span>
      <div style={{ height: 6 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <span className="m3-headline-small" style={{ fontWeight: 400, fontSize: 32, lineHeight: '40px' }}>
          {t('date_long_format', { v1: date.getMonth() + 1, v2: date.getDate() })}
        </span>
        <span
          className="m3-title-medium"
          style={{ color: 'var(--md-on-surface-variant)', paddingBottom: 4 }}
        >
          {localizedDay(date.getDay() === 0 ? 7 : date.getDay(), lang)}
        </span>
      </div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {semesterStatus === 'BEFORE_START' ? (
          <Stat label={t('semester_not_started')} bg="var(--md-secondary-container)" fg="var(--md-on-secondary-container)" />
        ) : semesterStatus === 'AFTER_END' ? (
          <Stat label={t('semester_ended')} bg="var(--md-secondary-container)" fg="var(--md-on-secondary-container)" />
        ) : (
          <Stat label={t('schedule_current_week', { v1: week })} bg="var(--md-primary-container)" fg="var(--md-on-primary-container)" />
        )}
        <Stat
          label={count === 0 ? t('no_course') : t('n_course_periods', { v1: count })}
          bg="var(--md-tertiary-container)"
          fg="var(--md-on-tertiary-container)"
        />
      </div>
    </div>
  )
}

function Stat({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      className="m3-label-medium"
      style={{
        fontWeight: 500,
        color: fg,
        background: bg,
        borderRadius: 12,
        padding: '6px 12px',
      }}
    >
      {label}
    </span>
  )
}

function EmptyToday({ semesterStatus }: { semesterStatus: SemesterStatus }) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        borderRadius: 28,
        background: 'var(--md-surface-container)',
        padding: 32,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 48, opacity: 0.5 }}>🕐</span>
      {semesterStatus === 'BEFORE_START' ? (
        <>
          <span className="m3-title-medium">{t('semester_not_started')}</span>
          <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('today_semester_out_hint')}
          </span>
        </>
      ) : semesterStatus === 'AFTER_END' ? (
        <>
          <span className="m3-title-medium">{t('semester_ended')}</span>
          <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('today_semester_out_hint')}
          </span>
        </>
      ) : (
        <>
          <span className="m3-title-medium">{t('schedule_no_course_today')}</span>
          <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('today_no_course')}
          </span>
        </>
      )}
    </div>
  )
}

export function TodayCourseCard({
  course,
  timeJson,
  groupRows,
}: {
  course: Course
  timeJson?: string
  groupRows: Course[]
  onClick?: () => void
}) {
  const prefs = usePrefsStore((s) => s.prefs)
  const isDark = prefs.themeMode === 'dark'
  const neutral = isDark ? '#49454F' : '#E7E0EC'
  const bg = pickCourseColorWithGroupRows(course, groupRows, isDark, neutral, false)
  const onSurface = isDark ? '#E6E0E9' : '#1D1B20'
  const fgRgb = textColorOn(parseHex(bg) ?? [0, 0, 0], isDark, parseHex(onSurface) ?? [0, 0, 0])
  const fg = '#' + fgRgb.map((v) => v.toString(16).padStart(2, '0')).join('')
  const time =
    course.ownTime && course.startTime && course.endTime
      ? `${course.startTime}-${course.endTime}`
      : timeJson
        ? courseTimeString(course.startNode, course.step, timeJson)
        : null
  const nodeLabel =
    course.ownTime && course.startTime && course.endTime
      ? `${course.startTime}-${course.endTime}`
      : `${course.startNode}-${course.startNode + course.step - 1}节`

  const meta = [course.teacher, course.room].filter(Boolean).join(' · ')

  return (
    <div
      style={{
        borderRadius: 28,
        background: bg,
        padding: 12,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      {/* 时间槽 — 固定 76dp 避免截断 */}
      <div style={{ width: 76, flexShrink: 0 }}>
        <div className="m3-title-medium" style={{ fontWeight: 700, color: fg }}>
          {nodeLabel}
        </div>
        {time && (
          <div className="m3-label-small" style={{ color: fg, opacity: 0.8, whiteSpace: 'nowrap' }}>
            {time}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="m3-title-medium"
          style={{
            fontWeight: 600,
            color: fg,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {course.courseName}
        </div>
        {meta && (
          <>
            <div style={{ height: 4 }} />
            <div className="m3-body-medium" style={{ color: fg, opacity: 0.8, fontSize: 12 }}>
              {meta}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
