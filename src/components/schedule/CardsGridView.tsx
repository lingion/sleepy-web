/**
 * CardsGridView — 网格视图 (CourseTableView.kt CardsGridView 1:1)
 * 双层架构: 时间栏 (renderSlots 逐行) + 课程卡绝对定位 (非簇单卡 + 冲突簇整簇)。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course } from '../../data/types'
import { usePrefsStore } from '../../state/prefsStore'
import { findClusters, conflictClusterKey, layoutCluster } from '../../domain/conflictLayout'
import { pickCourseColorWithGroupRows, textColorOn, parseHex } from '../../domain/courseColor'
import { timeToFractionalRows } from '../../domain/timeTable'
import { buildGridGeometry, singleCardGeom, slotIndexOf, yOfRows, rowHeightAt } from './gridGeometry'
import { GridClusterCard } from './GridClusterCard'

export interface CardsGridViewProps {
  courses: Course[]
  timeJson: string
  /** 学期开始周一 (yyyy-MM-dd); 空串 = 不显示日期 */
  startDate: string
  currentWeek: number
  containerWidth: number
  /** 节假日灰显天 */
  greyDays?: Set<number>
  onCourseClick?: (c: Course) => void
  /** 簇键 → 会话级置顶课 id (rotation override) */
  topOverrides?: Record<string, number>
  onSetTopOverride?: (key: string, courseId: number | null) => void
  /** 簇键 → 轮换步数 (会话级) */
  rotationSteps?: Record<string, number>
  onRotationStep?: (key: string, step: number) => void
}

export function CardsGridView(props: CardsGridViewProps) {
  const {
    courses,
    timeJson,
    startDate,
    currentWeek,
    containerWidth,
    greyDays = new Set(),
    onCourseClick,
    topOverrides = {},
    onSetTopOverride,
    rotationSteps = {},
    onRotationStep,
  } = props

  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)

  const sortedDays = useMemo(
    () => prefs.visibleDays.filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b),
    [prefs.visibleDays]
  )
  const dayCount = Math.max(1, sortedDays.length)
  const geo = useMemo(
    () => buildGridGeometry(courses, timeJson, dayCount, Math.max(containerWidth, 320), prefs.gridScale),
    [courses, timeJson, dayCount, containerWidth, prefs.gridScale]
  )
  const today = useMemo(() => {
    const jsDay = new Date().getDay() // 0=周日
    return jsDay === 0 ? 7 : jsDay
  }, [])

  const maxNode = geo.slots.length

  // 簇: 时间域聚簇 (2026-09-09 假冲突修复同源)
  const clusters = useMemo(() => findClusters(courses, timeJson), [courses, timeJson])
  const clusteredIds = useMemo(() => new Set(clusters.flatMap((c) => c.courses.map((x) => x.id))), [clusters])

  function dayDateStr(day: number): string | null {
    if (!prefs.showDate || !startDate) return null
    const d = dateOfWeek(startDate, currentWeek, day)
    return d ? shortDate(d) : null
  }

  return (
    <div
      style={{
        background: 'var(--md-surface-container-high)',
        borderRadius: 28 * prefs.gridScale,
        padding: 8 * prefs.gridScale,
        overflowX: 'auto',
      }}
    >
      <div style={{ minWidth: geo.timeW + geo.gapW * (dayCount + 1) + geo.colW * dayCount }}>
        {/* 表头 */}
        <div style={{ display: 'flex', gap: geo.gapW, height: geo.headH, alignItems: 'center' }}>
          <div style={{ width: geo.timeW, flexShrink: 0 }} />
          {sortedDays.map((day) => (
            <DayHeadCell
              key={day}
              day={day}
              isToday={day === today}
              isGrey={greyDays.has(day)}
              courseCount={courses.filter((c) => c.day === day).length}
              dateStr={dayDateStr(day)}
              scale={prefs.gridScale}
              cornerRatio={prefs.gridCornerRatio}
            />
          ))}
        </div>
        <div style={{ height: geo.gapH }} />

        {/* 网格主体: 绝对定位 */}
        <div style={{ position: 'relative', height: geo.gridH }}>
          {/* 时间栏 */}
          {geo.slots.map((slot, i) => (
            <div
              key={`row-${i}`}
              style={{
                position: 'absolute',
                top: yOfRows(geo.plan, i, geo.rowH),
                height: rowHeightAt(geo.plan, i, geo.rowH) - geo.gapH,
                left: 0,
                right: 0,
                display: 'flex',
                gap: geo.gapW,
                alignItems: 'stretch',
              }}
            >
              <SingleTimeHeadCell slot={slot} scale={prefs.gridScale} cornerRatio={prefs.gridCornerRatio} />
            </div>
          ))}

          {/* 冲突簇 */}
          {clusters.map((cluster) => {
            if (!sortedDays.includes(cluster.day)) return null
            const inGrid = cluster.courses.filter((c) => slotIndexOf(geo.slots, c.startNode) >= 0)
            if (inGrid.length === 0) return null
            const anchor = cluster.courses[0]
            const dayIdx = sortedDays.indexOf(cluster.day)
            const anchorFrac =
              anchor.ownTime && anchor.startTime && anchor.endTime
                ? timeToFractionalRows(anchor.startTime, anchor.endTime, geo.slots)
                : null
            const anchorRow = anchorFrac ? anchorFrac[0] : Math.max(0, slotIndexOf(geo.slots, anchor.startNode))
            const cardY = yOfRows(geo.plan, anchorRow, geo.rowH)
            const cardX = geo.timeW + geo.gapW + (geo.colW + geo.gapW) * dayIdx
            const key = conflictClusterKey(anchor)
            const laidOut = layoutCluster(
              cluster,
              prefs.conflictStyle,
              topOverrides[key] ?? null,
              maxNode,
              null
            )
            const rotationStep = rotationSteps[key] ?? 0
            return (
              <GridClusterCard
                key={`cluster-${key}`}
                cluster={cluster}
                laidOut={laidOut}
                style={prefs.conflictStyle}
                rotationStep={rotationStep}
                onRotate={() => onRotationStep?.(key, rotationStep + 1)}
                onPickTop={(id) => onSetTopOverride?.(key, id)}
                onCourseClick={onCourseClick}
                colW={geo.colW}
                rowH={geo.rowH}
                maxNode={maxNode}
                slots={geo.slots}
                gapH={geo.gapH}
                isGrey={greyDays.has(cluster.day)}
                containerWidth={geo.colW}
                offsetY={cardY}
                offsetX={cardX}
                yOfRowsFn={(r) => yOfRows(geo.plan, r, geo.rowH)}
              />
            )
          })}

          {/* 非簇单卡 */}
          {courses.map((course) => {
            if (!sortedDays.includes(course.day)) return null
            if (clusteredIds.has(course.id)) return null
            const dayIdx = sortedDays.indexOf(course.day)
            const g = singleCardGeom(course, geo, dayIdx, true)
            if (!g) return null
            return (
              <CourseOverlayCard
                key={`card-${course.id}`}
                course={course}
                groupRows={courses.filter((c) => c.groupId === course.groupId)}
                isGrey={greyDays.has(course.day)}
                scale={prefs.gridScale}
                cornerRatio={prefs.gridCornerRatio}
                onClick={() => onCourseClick?.(course)}
                x={g.x}
                y={g.y}
                w={g.w}
                h={g.h}
              />
            )
          })}
        </div>
      </div>
      {courses.length === 0 && (
        <div
          className="m3-body-medium"
          style={{ textAlign: 'center', color: 'var(--md-on-surface-variant)', padding: 32 }}
        >
          {t('no_course')}
        </div>
      )}
    </div>
  )
}

// ---- 子组件 -----------------------------------------------------------

function SingleTimeHeadCell({
  slot,
  scale,
  cornerRatio,
}: {
  slot: { label: string; displayStart: string; displayEnd: string; isPlaceholder?: boolean }
  scale: number
  cornerRatio: number
}) {
  const isPh = !!slot.isPlaceholder
  return (
    <div style={{ width: 68 * scale, padding: 2 * scale, display: 'flex' }}>
      <div
        style={{
          flex: 1,
          borderRadius: 12 * scale * cornerRatio,
          background: isPh ? 'color-mix(in srgb, var(--md-surface-container-low) 50%, transparent)' : 'var(--md-surface-container-low)',
          padding: 4 * scale,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1 * scale,
          overflow: 'hidden',
        }}
      >
        {!isPh && (
          <span
            className="m3-label-small"
            style={{ fontWeight: 600, fontSize: 10 * scale, lineHeight: `${14 * scale}px`, color: 'var(--md-on-surface)' }}
          >
            第 {slot.label} 节
          </span>
        )}
        <span
          className="m3-label-small"
          style={{ fontSize: 9 * scale, lineHeight: `${11 * scale}px`, color: 'var(--md-on-surface-variant)' }}
        >
          {slot.displayStart}-{slot.displayEnd}
        </span>
      </div>
    </div>
  )
}

export function CourseOverlayCard({
  course,
  groupRows,
  isGrey,
  scale,
  cornerRatio,
  onClick,
  x,
  y,
  w,
  h,
}: {
  course: Course
  groupRows: Course[]
  isGrey: boolean
  scale: number
  cornerRatio: number
  onClick?: () => void
  x: number
  y: number
  w: number
  h: number
}) {
  const prefs = usePrefsStore((s) => s.prefs)
  const neutral = prefs.themeMode === 'dark' ? '#49454F' : '#E7E0EC'
  // CourseColorUtil.pickCourseColorComposeWithGroupRows 同源取色
  const bg = pickCourseColorWithGroupRows(course, groupRows, prefs.themeMode === 'dark', neutral, false)
  const onSurface = prefs.themeMode === 'dark' ? '#E6E0E9' : '#1D1B20'
  const fg = textColorOnHex(bg, prefs.themeMode === 'dark', onSurface)
  const subInfo = prefs.gridSubInfo
  // issue#26: 网格别名 — gridUseAlias 开且别名非空才显示别名
  const name = prefs.gridUseAlias && course.alias ? course.alias : course.courseName
  const subText = subInfo === 'room' ? course.room : subInfo === 'teacher' ? course.teacher : ''
  const alpha = isGrey ? 0.6 : 1

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        padding: 2 * scale,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 12 * scale * cornerRatio,
          background: bg,
          opacity: alpha,
          padding: 4 * scale,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: subText ? 'space-between' : 'center',
          alignItems: 'center',
          cursor: 'pointer',
          overflow: 'hidden',
          textDecoration: isGrey ? 'line-through' : undefined,
        }}
      >
        <div
          style={{
            flex: subText ? 1 : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <span
            className="m3-label-small"
            style={{
              fontWeight: 600,
              fontSize: 10 * scale,
              lineHeight: `${13 * scale}px`,
              color: fg,
              display: '-webkit-box',
              WebkitLineClamp: 6,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {name}
          </span>
        </div>
        {subText && (
          <span
            className="m3-label-small"
            style={{
              fontSize: 9 * scale,
              lineHeight: `${11 * scale}px`,
              color: fg,
              opacity: 0.8,
              textAlign: 'center',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {subText}
          </span>
        )}
      </div>
    </div>
  )
}

function DayHeadCell({
  day,
  isToday,
  isGrey,
  courseCount,
  dateStr,
  scale,
  cornerRatio,
}: {
  day: number
  isToday: boolean
  isGrey: boolean
  courseCount: number
  dateStr: string | null
  scale: number
  cornerRatio: number
}) {
  const { t, i18n } = useTranslation()
  const bg = isToday ? 'var(--md-primary-container)' : 'var(--md-surface)'
  const fg = isGrey
    ? 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)'
    : isToday
      ? 'var(--md-on-primary-container)'
      : 'var(--md-on-surface)'
  const subFg = isGrey
    ? 'color-mix(in srgb, var(--md-on-surface-variant) 60%, transparent)'
    : isToday
      ? 'color-mix(in srgb, var(--md-on-primary-container) 80%, transparent)'
      : 'var(--md-on-surface-variant)'
  const dayLabel = localizedDay(day, i18n.language)

  return (
    <div
      style={{
        flex: 1,
        height: (dateStr ? 56 : 52) * scale,
        borderRadius: 16 * scale * cornerRatio,
        background: bg,
        padding: `${6 * scale}px 0`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1 * scale,
        overflow: 'hidden',
      }}
    >
      <span
        className="m3-label-large"
        style={{ fontWeight: 600, fontSize: 14 * scale, lineHeight: `${20 * scale}px`, color: fg }}
      >
        {dayLabel}
      </span>
      {dateStr ? (
        <span className="m3-label-small" style={{ fontSize: 10 * scale, lineHeight: `${11 * scale}px`, color: subFg }}>
          {dateStr}
        </span>
      ) : (
        <span className="m3-label-small" style={{ fontSize: 9 * scale, lineHeight: `${11 * scale}px`, color: subFg }}>
          {courseCount === 0 ? t('no_course') : t('course_count_format', { v1: courseCount })}
        </span>
      )}
    </div>
  )
}

// ---- 工具 -------------------------------------------------------------

function textColorOnHex(bg: string, isDark: boolean, onSurface: string): string {
  const rgb = parseHex(bg)
  if (!rgb) return onSurface
  const out = textColorOn(rgb, isDark, parseHex(onSurface) ?? [0, 0, 0])
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function localizedDay(day: number, lang: string): string {
  const zh = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const en = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const ja = ['月', '火', '水', '木', '金', '土', '日']
  const es = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  if (lang.startsWith('zh')) return zh[day - 1]
  if (lang.startsWith('ja')) return ja[day - 1]
  if (lang.startsWith('es')) return es[day - 1]
  return en[day - 1]
}

export function dateOfWeek(startDate: string, week: number, day: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + (week - 1) * 7 + (day - 1))
  return d
}

export function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export { parseHex }
