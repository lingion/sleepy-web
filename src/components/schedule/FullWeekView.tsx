/**
 * FullWeekView — 周视图 (CourseTableView.kt FullWeekView/WeekStrip/DetailDayCard/
 * LessonRow 1:1)。
 * WeekStrip 7 天摘要 (132dp DaySummaryCell) + DetailPanel (单栏/两栏/balance)。
 * 行分组下沉引擎 weekLaneRows 时间域 (2026-09-10 同源)。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course } from '../../data/types'
import { usePrefsStore } from '../../state/prefsStore'
import { weekLaneRows } from '../../domain/conflictLayout'
import { courseTimeParts } from '../../domain/timeTable'
import { pickCourseColorWithGroupRows, textColorOn, parseHex } from '../../domain/courseColor'
import { localizedDay } from './CardsGridView'

export interface FullWeekViewProps {
  courses: Course[]
  timeJson: string
  greyDays?: Set<number>
  onCourseClick?: (c: Course) => void
}

export function FullWeekView({ courses, timeJson, greyDays = new Set(), onCourseClick }: FullWeekViewProps) {
  const prefs = usePrefsStore((s) => s.prefs)
  const scale = prefs.weekScale
  const cornerRatio = prefs.gridCornerRatio
  const today = useMemo(() => {
    const jsDay = new Date().getDay()
    return jsDay === 0 ? 7 : jsDay
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<number, Course[]>()
    for (const c of courses) {
      const list = m.get(c.day)
      if (list) list.push(c)
      else m.set(c.day, [c])
    }
    return m
  }, [courses])

  const visibleDays = prefs.visibleDays.filter((d) => d >= 1 && d <= 7)
  const hideEmptyDays = (prefs as unknown as { weekHideEmptyDays?: boolean }).weekHideEmptyDays ?? false
  const sortedDays = hideEmptyDays ? visibleDays.filter((d) => (byDay.get(d) ?? []).length > 0) : visibleDays

  return (
    <div style={{ padding: '6px 16px' }}>
      {/* WeekStrip */}
      <div style={{ display: 'flex', gap: 6 * scale }}>
        {visibleDays
          .slice()
          .sort((a, b) => a - b)
          .map((day) => (
            <DaySummaryCell
              key={day}
              day={day}
              courses={byDay.get(day) ?? []}
              isToday={day === today}
              isGrey={greyDays.has(day)}
              useAlias={prefs.weekUseAlias}
              scale={scale}
              cornerRatio={cornerRatio}
            />
          ))}
      </div>

      {/* DetailPanel */}
      <DetailPanel
        byDay={byDay}
        sortedDays={sortedDays}
        today={today}
        timeJson={timeJson}
        greyDays={greyDays}
        onCourseClick={onCourseClick}
        scale={scale}
        cornerRatio={cornerRatio}
      />
    </div>
  )
}

// ---- DaySummaryCell (WeekStrip 132dp 摘要) ----------------------------

function DaySummaryCell({
  day,
  courses,
  isToday,
  isGrey,
  useAlias,
  scale,
  cornerRatio,
}: {
  day: number
  courses: Course[]
  isToday: boolean
  isGrey: boolean
  useAlias: boolean
  scale: number
  cornerRatio: number
}) {
  const { t, i18n } = useTranslation()
  const bg = isToday ? 'var(--md-primary-container)' : 'var(--md-surface-container)'
  const fg = isGrey
    ? 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)'
    : isToday
      ? 'var(--md-on-primary-container)'
      : 'var(--md-on-surface)'

  const countText = courses.length === 0 ? '' : t('course_count_format', { v1: courses.length })
  // 列窄时退化为纯数字 (Android showNumberOnly 同构)
  const showNumberOnly = countText.length > 6

  return (
    <div
      style={{
        flex: 1,
        height: 132 * scale,
        borderRadius: 12 * scale * cornerRatio,
        background: bg,
        padding: `${8 * scale}px ${6 * scale}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 13 * scale,
          lineHeight: `${18 * scale}px`,
          fontWeight: 600,
          color: fg,
        }}
      >
        {localizedDay(day, i18n.language)}
      </span>
      <div style={{ height: 6 * scale }} />
      {courses.length > 0 && (
        <span
          style={{
            background: 'var(--md-surface-variant)',
            color: isGrey
              ? 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)'
              : 'var(--md-on-surface-variant)',
            borderRadius: 50,
            padding: `${2 * scale}px ${7 * scale}px`,
            fontSize: 10 * scale,
            lineHeight: `${14 * scale}px`,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {showNumberOnly ? String(courses.length) : countText}
        </span>
      )}
      <div style={{ height: 4 * scale }} />
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 * scale }}>
        {courses.slice(0, 5).map((c) => (
          <span
            key={c.id}
            style={{
              fontSize: 9 * scale,
              lineHeight: `${11 * scale}px`,
              color: isToday
                ? 'color-mix(in srgb, var(--md-on-primary-container) 80%, transparent)'
                : 'var(--md-on-surface-variant)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {useAlias && c.alias ? c.alias : c.courseName}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---- DetailPanel (单栏/两栏/balance) -----------------------------------

function DetailPanel({
  byDay,
  sortedDays,
  today,
  timeJson,
  greyDays,
  onCourseClick,
  scale,
  cornerRatio,
}: {
  byDay: Map<number, Course[]>
  sortedDays: number[]
  today: number
  timeJson: string
  greyDays: Set<number>
  onCourseClick?: (c: Course) => void
  scale: number
  cornerRatio: number
}) {
  const prefs = usePrefsStore((s) => s.prefs)
  const twoColumn = prefs.weekTwoColumn

  if (twoColumn && sortedDays.length >= 2) {
    // days=对半分 / balance=按课程数贪心平衡
    const balance = (prefs as unknown as { weekTwoColumnMode?: string }).weekTwoColumnMode === 'balance'
    let split: [number[], number[]]
    if (balance) {
      let l = 0
      let r = 0
      const left: number[] = []
      const right: number[] = []
      for (const day of sortedDays) {
        const w = Math.max(1, (byDay.get(day) ?? []).length)
        if (l <= r) {
          left.push(day)
          l += w
        } else {
          right.push(day)
          r += w
        }
      }
      split = [left, right]
    } else {
      const splitIdx = Math.ceil(sortedDays.length / 2)
      split = [sortedDays.slice(0, splitIdx), sortedDays.slice(splitIdx)]
    }
    return (
      <div style={{ display: 'flex', gap: 10 * scale, padding: 12 * scale, alignItems: 'flex-start' }}>
        <DayColumn
          days={split[0]}
          byDay={byDay}
          today={today}
          timeJson={timeJson}
          greyDays={greyDays}
          onCourseClick={onCourseClick}
          scale={scale}
          cornerRatio={cornerRatio}
        />
        {split[1].length > 0 && (
          <DayColumn
            days={split[1]}
            byDay={byDay}
            today={today}
            timeJson={timeJson}
            greyDays={greyDays}
            onCourseClick={onCourseClick}
            scale={scale}
            cornerRatio={cornerRatio}
          />
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        borderRadius: 16 * scale * cornerRatio,
        background: 'var(--md-surface-container-high)',
        padding: 12 * scale,
        display: 'flex',
        flexDirection: 'column',
        gap: 10 * scale,
        margin: 12 * scale,
      }}
    >
      {sortedDays.map((day) => (
        <DetailDayCard
          key={day}
          day={day}
          courses={(byDay.get(day) ?? []).slice().sort((a, b) => a.startNode - b.startNode)}
          isToday={day === today}
          timeJson={timeJson}
          isGrey={greyDays.has(day)}
          onCourseClick={onCourseClick}
          scale={scale}
          cornerRatio={cornerRatio}
        />
      ))}
    </div>
  )
}

function DayColumn({
  days,
  byDay,
  today,
  timeJson,
  greyDays,
  onCourseClick,
  scale,
  cornerRatio,
}: {
  days: number[]
  byDay: Map<number, Course[]>
  today: number
  timeJson: string
  greyDays: Set<number>
  onCourseClick?: (c: Course) => void
  scale: number
  cornerRatio: number
}) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 16 * scale * cornerRatio,
        background: 'var(--md-surface-container-high)',
        padding: 10 * scale,
        display: 'flex',
        flexDirection: 'column',
        gap: 10 * scale,
      }}
    >
      {days.map((day) => (
        <DetailDayCard
          key={day}
          day={day}
          courses={(byDay.get(day) ?? []).slice().sort((a, b) => a.startNode - b.startNode)}
          isToday={day === today}
          timeJson={timeJson}
          isGrey={greyDays.has(day)}
          onCourseClick={onCourseClick}
          scale={scale}
          cornerRatio={cornerRatio}
        />
      ))}
    </div>
  )
}

export function DetailDayCard({
  day,
  courses,
  isToday,
  isGrey = false,
  timeJson,
  onCourseClick,
  scale,
  cornerRatio,
  containerWidth = 360,
}: {
  day: number
  courses: Course[]
  isToday: boolean
  isGrey?: boolean
  timeJson: string
  onCourseClick?: (c: Course) => void
  scale: number
  cornerRatio: number
  containerWidth?: number
}) {
  const { t, i18n } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)

  return (
    <div
      style={{
        width: '100%',
        borderRadius: 12 * scale * cornerRatio,
        background: courses.length === 0 ? 'var(--md-surface-container-low)' : 'var(--md-surface)',
        padding: 10 * scale,
        display: 'flex',
        flexDirection: 'column',
        gap: 8 * scale,
      }}
    >
      <span
        className="m3-title-small"
        style={{
          fontWeight: 600,
          color: isGrey ? 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)' : 'var(--md-on-surface)',
        }}
      >
        {localizedDay(day, i18n.language)}
        {isToday ? t('today_suffix') : ''}
      </span>

      {courses.length === 0 ? (
        <span
          style={{
            fontSize: 12 * scale,
            lineHeight: `${16 * scale}px`,
            color: isGrey
              ? 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)'
              : 'var(--md-on-surface-variant)',
          }}
        >
          {localizedDay(day, i18n.language)}
          {t('no_course_today')}
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 * scale }}>
          {weekLaneRows(courses, timeJson || null).map((row, ri) => {
            if (row.laneCount === 1) {
              const c = row.courses[0]
              return (
                <LessonRow
                  key={ri}
                  course={c}
                  displayMode={prefs.displayMode}
                  timeJson={timeJson}
                  isGrey={isGrey}
                  scale={scale}
                  cornerRatio={cornerRatio}
                  groupRows={courses.filter((x) => x.groupId === c.groupId)}
                  useAlias={prefs.weekUseAlias}
                  onClick={() => onCourseClick?.(c)}
                />
              )
            }
            // 冲突行: laneCount 栏并排 + 栏间 0.5dp 竖线 (v7.10.10)
            const laneGap = 6 * scale
            const laneW = (containerWidth - laneGap * (row.laneCount - 1)) / row.laneCount
            const laneScale = weekLaneFontScale(laneW)
            const hideSide = weekLaneHideSideLabel(laneW)
            return (
              <div key={ri} style={{ display: 'flex', gap: laneGap, alignItems: 'stretch' }}>
                {Array.from({ length: row.laneCount }, (_, li) => (
                  <div key={li} style={{ display: 'flex', flex: 1, gap: laneGap }}>
                    {li > 0 && (
                      <div
                        style={{
                          width: 0.5,
                          background: 'color-mix(in srgb, var(--md-on-surface) 30%, transparent)',
                          alignSelf: 'stretch',
                        }}
                      />
                    )}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 * scale }}>
                      {row.courses
                        .filter((c) => row.laneOf.get(c.id) === li)
                        .map((laneCourse) => (
                          <LessonRow
                            key={laneCourse.id}
                            course={laneCourse}
                            displayMode={prefs.displayMode}
                            timeJson={timeJson}
                            isGrey={isGrey}
                            scale={scale}
                            cornerRatio={cornerRatio}
                            laneScale={laneScale}
                            hideSideLabel={hideSide}
                            groupRows={courses.filter((x) => x.groupId === laneCourse.groupId)}
                            useAlias={prefs.weekUseAlias}
                            onClick={() => onCourseClick?.(laneCourse)}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---- lane 压缩 (纯函数, v7.10.4) ---------------------------------------

/** lane 宽压缩基准: 低于它线性缩; 0.6 封底 */
export const WEEK_LANE_SCALE_BASE = 150
export const WEEK_LANE_SCALE_FLOOR = 0.6

export function weekLaneFontScale(laneW: number): number {
  if (laneW >= WEEK_LANE_SCALE_BASE) return 1
  return Math.max(laneW / WEEK_LANE_SCALE_BASE, WEEK_LANE_SCALE_FLOOR)
}

/** 极窄 lane: 侧栏节次/时间标签挤占正文 → 隐藏 */
export function weekLaneHideSideLabel(laneW: number): boolean {
  return laneW < 110
}

// ---- LessonRow --------------------------------------------------------

export function LessonRow({
  course,
  displayMode,
  timeJson,
  isGrey = false,
  scale,
  cornerRatio,
  laneScale = 1,
  hideSideLabel = false,
  groupRows,
  useAlias,
  onClick,
}: {
  course: Course
  displayMode: string
  timeJson: string
  isGrey?: boolean
  scale: number
  cornerRatio: number
  laneScale?: number
  hideSideLabel?: boolean
  groupRows: Course[]
  useAlias: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const isDark = prefs.themeMode === 'dark'
  const effScale = scale * laneScale
  const name = useAlias && course.alias ? course.alias : course.courseName
  // surfaceVariant 取自当前主题 (CourseTableView.kt:441-447 colors.surfaceVariant 同构) —
  // themeMode=system 走 isDark 同源码路径; 用 token 而非硬编码 hex (TaskBook 硬约束)
  const neutral = 'var(--md-surface-variant)'
  const bg = pickCourseColorWithGroupRows(course, groupRows, isDark, neutral, prefs.courseColorless)
  const onSurface = 'var(--md-on-surface)'
  const fgHex = textColorOn(parseHex(bg) ?? [0, 0, 0], isDark, parseHex(onSurface) ?? [0, 0, 0])
  const fg = '#' + fgHex.map((v) => v.toString(16).padStart(2, '0')).join('')

  // time 模式: 时间段在连字符后折行
  const timeParts =
    displayMode === 'time' && timeJson
      ? courseTimeParts(course.startNode, course.step, timeJson, course.ownTime, course.startTime, course.endTime)
      : null
  // nodeLabel 走 i18n: course_period_range %1$d-%2$d节 (Android 同源,
  // i18nnext 未 init 时 t() 返 undefined, fallback 中文默认)
  const nodeLabel = course.ownTime && course.startTime && course.endTime
    ? `${course.startTime}-${course.endTime}`
    : t('course_period_range', {
        v1: course.startNode,
        v2: course.startNode + course.step - 1,
        defaultValue: `${course.startNode}-${course.startNode + course.step - 1}节`,
      })

  const meta = [
    course.teacher,
    course.room,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        borderRadius: 12 * effScale * cornerRatio,
        background: bg,
        opacity: isGrey ? 0.6 : 1,
        padding: 9 * effScale,
        display: 'flex',
        gap: 8 * effScale,
        cursor: 'pointer',
        boxSizing: 'border-box',
        textDecoration: isGrey ? 'line-through' : undefined,
      }}
    >
      {!hideSideLabel && (
        <span
          style={{
            width: 42 * effScale,
            flexShrink: 0,
            fontSize: 12 * effScale,
            lineHeight: `${16 * effScale}px`,
            fontWeight: 600,
            color: fg,
            whiteSpace: timeParts ? 'pre' : 'nowrap',
          }}
        >
          {timeParts ? `${timeParts[0]}-\n${timeParts[1]}` : nodeLabel}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12 * effScale,
            lineHeight: `${16 * effScale}px`,
            fontWeight: 600,
            color: fg,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {name}
        </div>
        {meta && !hideSideLabel && (
          <div
            style={{
              fontSize: 11 * effScale,
              lineHeight: `${14 * effScale}px`,
              color: fg,
              opacity: 0.8,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {meta}
          </div>
        )}
      </div>
    </div>
  )
}
