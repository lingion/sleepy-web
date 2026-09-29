/**
 * CardsGridView — 网格视图 (CourseTableView.kt CardsGridView 1:1)
 * 双层架构: 时间栏 (renderSlots 逐行) + 课程卡绝对定位 (非簇单卡 + 冲突簇整簇)。
 */

import { useMemo, useRef, type TouchEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course } from '../../data/types'
import { usePrefsStore } from '../../state/prefsStore'
import { findClusters, conflictClusterKey, layoutCluster } from '../../domain/conflictLayout'
import { pickCourseColorWithGroupRows, textColorOn, parseHex } from '../../domain/courseColor'
import { timeToFractionalRows } from '../../domain/timeTable'
import { buildGridGeometry, singleCardGeom, slotIndexOf, yOfRows, rowHeightAt } from './gridGeometry'
import { GridClusterCard } from './GridClusterCard'
import { periodHeaderLines, type PeriodHeaderLayout, type PeriodHeaderStyle } from './periodHeader'

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
    () => buildGridGeometry(
      courses,
      timeJson,
      dayCount,
      Math.max(containerWidth, 320),
      prefs.gridScale,
      {
        adaptiveHeight: prefs.gridAdaptiveHeight,
        availableHeight: typeof window === 'undefined' ? undefined : Math.max(0, window.innerHeight - 180),
        autoHideEmptyEvening: prefs.gridAutoHideEmptyEvening,
        eveningStart: prefs.gridEveningStart,
        rowScale: prefs.gridPinchZoom ? prefs.gridRowScale : 1,
      },
    ),
    [courses, timeJson, dayCount, containerWidth, prefs.gridScale, prefs.gridAdaptiveHeight, prefs.gridAutoHideEmptyEvening, prefs.gridEveningStart, prefs.gridPinchZoom, prefs.gridRowScale]
  )
  const today = useMemo(() => new Date(), [])
  const updatePrefs = usePrefsStore((s) => s.update)
  const pinch = useRef<{ distance: number } | null>(null)
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!prefs.gridPinchZoom || event.touches.length !== 2) return
    pinch.current = { distance: Math.abs(event.touches[0].clientY - event.touches[1].clientY) }
  }
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!prefs.gridPinchZoom || !pinch.current || event.touches.length !== 2) return
    const distance = Math.abs(event.touches[0].clientY - event.touches[1].clientY)
    const delta = (distance - pinch.current.distance) / 180
    if (Math.abs(delta) < 0.03) return
    pinch.current.distance = distance
    void updatePrefs({ gridRowScale: prefs.gridRowScale + delta })
  }
  const onTouchEnd = () => { pinch.current = null }
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!prefs.gridPinchZoom || !event.ctrlKey) return
    event.preventDefault()
    void updatePrefs({ gridRowScale: prefs.gridRowScale - event.deltaY / 800 })
  }

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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      style={{
        touchAction: prefs.gridPinchZoom ? 'pan-x pan-y' : undefined,
        background: 'var(--md-surface-container-high)',
        // Android: SleepyTheme.shapes.large = 固定 16dp (Theme.kt:286), 不乘 scale;
        // 旧值 28 * gridScale 是错的 (审计 medium #17)
        borderRadius: 16,
        padding: 8 * prefs.gridScale,
      }}
    >
      {/* 对齐安卓 CourseTableView: 列宽恒随容器宽度缩放, 无横向滚动
          (曾经的 overflowX:auto 会让浏览器把横滑判给原生滚动, pointercancel 杀死翻页手势) */}
      <div>
        {/* 表头 */}
        <div style={{ display: 'flex', gap: geo.gapW, height: geo.headH, alignItems: 'center' }}>
          <div style={{ width: geo.timeW, flexShrink: 0 }} />
          {sortedDays.map((day) => (
            <DayHeadCell
              key={day}
              day={day}
              isToday={isDateToday(dateOfWeek(startDate, currentWeek, day), today)}
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
              <SingleTimeHeadCell
                slot={slot}
                scale={prefs.gridScale}
                cornerRatio={prefs.gridCornerRatio}
                layout={prefs.periodHeaderLayout}
                style={prefs.periodHeaderStyle}
                hanging={prefs.periodHeaderHanging}
                showX={prefs.periodHeaderShowX}
              />
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
  layout,
  style,
  hanging,
  showX,
}: {
  slot: { label: string; displayStart: string; displayEnd: string; nodeStart?: number; nodeEnd?: number; isPlaceholder?: boolean }
  scale: number
  cornerRatio: number
  layout: PeriodHeaderLayout
  style: PeriodHeaderStyle
  hanging: number
  showX: boolean
}) {
  const isPh = !!slot.isPlaceholder
  const hangingOffset = hanging * 10 * scale
  return (
    <div style={{ width: 68 * scale, padding: 2 * scale, display: 'flex' }} data-period-header-hanging={hanging}>
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
          transform: layout === 'three_line' ? `translateX(${hangingOffset}px)` : undefined,
        }}
      >
        {!isPh && periodHeaderLines(slot, layout, style, showX).map((line, index) => (
          <span
            key={line}
            className="m3-label-small"
            style={{
              fontWeight: index === 1 || layout === 'legacy' && index === 0 ? 600 : undefined,
              fontSize: (index === 1 || layout === 'legacy' && index === 0 ? 10 : 9) * scale,
              lineHeight: `${(index === 1 || layout === 'legacy' && index === 0 ? 14 : 11) * scale}px`,
              color: index === 1 || layout === 'legacy' && index === 0 ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
            }}
          >
            {line}
          </span>
        ))}
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
  border,
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
  /** 冲突簇真卡 1px 自派生描边 (ConflictCard.kt:1003); 非簇单卡不传=无描边 */
  border?: string
}) {
  const prefs = usePrefsStore((s) => s.prefs)
  const neutral = 'var(--md-surface-container-lowest)'
  // CourseColorUtil.pickCourseColorComposeWithGroupRows 同源取色
  const bg = pickCourseColorWithGroupRows(course, groupRows, prefs.themeMode === 'dark', neutral, prefs.courseColorless)
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
          border,
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
  const raw = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const mondayShift = (raw.getDay() + 6) % 7
  raw.setDate(raw.getDate() - mondayShift)
  raw.setDate(raw.getDate() + (week - 1) * 7 + (day - 1))
  const d = raw
  return d
}

export function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Compare calendar dates, ignoring time-of-day. */
export function isDateToday(date: Date | null, today = new Date()): boolean {
  return date != null && date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
}

export { parseHex }
