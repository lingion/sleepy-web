import './mealBreak.css'
/**
 * CardsGridView — 网格视图 (CourseTableView.kt CardsGridView 1:1)
 * 双层架构: 时间栏 (renderSlots 逐行) + 课程卡绝对定位 (非簇单卡 + 冲突簇整簇)。
 */

import { useLayoutEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Course } from '../../data/types'
import { usePrefsStore, resolveIsDark } from '../../state/prefsStore'
import { courseNeutralTokens } from '../../theme/themes'
import { findClusters, conflictClusterKey, layoutCluster } from '../../domain/conflictLayout'
import { pickCourseColorWithGroupRows, textColorOn, parseHex } from '../../domain/courseColor'
import { timeToFractionalRows, type RenderSlotPlan } from '../../domain/timeTable'
import { buildGridGeometry, singleCardGeom, slotIndexOf, yOfRows, rowHeightAt } from './gridGeometry'
import { GridClusterCard } from './GridClusterCard'
import {
  fitPeriodHeaderColumn,
  estimatePeriodHeaderTextWidth,
  type PeriodHeaderTextLine,
  type PeriodHeaderLayout,
  type PeriodHeaderStyle,
} from './periodHeader'

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
  const hideTime=!!(prefs as typeof prefs & {periodHeaderHideTime?:boolean}).periodHeaderHideTime

  const sortedDays = useMemo(
    () => prefs.visibleDays.filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b),
    [prefs.visibleDays]
  )
  const dayCount = Math.max(1, sortedDays.length)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const style = getComputedStyle(root)
      const width = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      if (width > 0) setMeasuredWidth(width)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [prefs.gridScale])
  const geo = useMemo(
    () => buildGridGeometry(
      courses,
      timeJson,
      dayCount,
      Math.max(measuredWidth ?? containerWidth, 1),
      prefs.gridScale,
      {
        adaptiveHeight: prefs.gridAdaptiveHeight,
        availableHeight: typeof window === 'undefined' ? undefined : Math.max(0, window.innerHeight - 180),
        autoHideEmptyEvening: prefs.gridAutoHideEmptyEvening,
        eveningStart: prefs.gridEveningStart,
        rowScale: prefs.gridPinchZoom ? prefs.gridRowScale : 1,
        longBreakSpacing: prefs.gridLongBreakSpacing,
        periodHeaderLayout: prefs.periodHeaderLayout,
        periodHeaderStyle: prefs.periodHeaderStyle,
        periodHeaderHanging: prefs.periodHeaderHanging,
        periodHeaderShowX: prefs.periodHeaderShowX,
        periodHeaderHideTime: hideTime,
        periodHeaderTimeAlignment:prefs.periodHeaderTimeAlignment,
      },
    ),
    [courses, timeJson, dayCount, containerWidth, measuredWidth, prefs.gridScale, prefs.gridAdaptiveHeight, prefs.gridAutoHideEmptyEvening, prefs.gridEveningStart, prefs.gridPinchZoom, prefs.gridRowScale, prefs.gridLongBreakSpacing, prefs.periodHeaderLayout, prefs.periodHeaderStyle, prefs.periodHeaderHanging, prefs.periodHeaderShowX,hideTime,prefs.periodHeaderTimeAlignment]
  )
  const today = useMemo(() => new Date(), [])
  const updatePrefs = usePrefsStore((s) => s.update)
  const pinch = useRef<{ distance: number } | null>(null)
  // ref sleepy#287: 捏合缩放时锚定两指中点下的行, 缩放后回写滚动位置, 中点内容不漂移。
  const pinchAnchor = useRef<{
    acc: number
    rowH0: number
    scale0: number
    gridTop: number
    midLocal: number
    scroller: HTMLElement
  } | null>(null)
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!prefs.gridPinchZoom || event.touches.length !== 2) return
    const t0 = event.touches[0]
    const t1 = event.touches[1]
    pinch.current = { distance: Math.abs(t0.clientY - t1.clientY) }
    const root = rootRef.current
    const scroller = root ? findVerticalScroller(root) : null
    if (!root || !scroller) {
      pinchAnchor.current = null
      return
    }
    const sRect = scroller.getBoundingClientRect()
    const gRect = root.getBoundingClientRect()
    const gridTop = gRect.top - sRect.top + scroller.scrollTop
    const midLocal = (t0.clientY + t1.clientY) / 2 - sRect.top
    const bodyY = scroller.scrollTop + midLocal - gridTop - geo.headH
    pinchAnchor.current = {
      acc: invertRowsToAcc(geo.plan, bodyY, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra),
      rowH0: geo.rowH,
      scale0: prefs.gridRowScale,
      gridTop,
      midLocal,
      scroller,
    }
  }
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!prefs.gridPinchZoom || !pinch.current || event.touches.length !== 2) return
    const distance = Math.abs(event.touches[0].clientY - event.touches[1].clientY)
    const delta = (distance - pinch.current.distance) / 180
    if (Math.abs(delta) < 0.03) return
    pinch.current.distance = distance
    const a = pinchAnchor.current
    const newScale = Math.min(1.8, Math.max(0.7, prefs.gridRowScale + delta))
    void updatePrefs({ gridRowScale: newScale })
    if (a && a.scale0 > 0) {
      // 行距 = 行高 + 固定间隙: 只按比例缩放行高部分 (与 gridGeometry 的 rowH 构造一致)
      const newRowH = (a.rowH0 - geo.gapH) * (newScale / a.scale0) + geo.gapH
      const y =
        yOfRows(geo.plan, a.acc, newRowH, geo.mealBreakAfterRows, geo.mealGapExtra) +
        geo.headH + a.gridTop - a.midLocal
      a.scroller.scrollTop = Math.max(0, y)
    }
  }
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinch.current = null
    if (event.touches.length === 0) pinchAnchor.current = null
  }
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!prefs.gridPinchZoom || !event.ctrlKey) return
    event.preventDefault()
    void updatePrefs({ gridRowScale: prefs.gridRowScale - event.deltaY / 800 })
  }

  const maxNode = geo.slots.length

  const headerLines = useMemo(() => {
    const slots = geo.slots.filter(slot => !slot.isPlaceholder)
    const minHeight = Math.min(...geo.slots.flatMap((slot, i) => slot.isPlaceholder ? [] : [rowHeightAt(geo.plan, i, geo.rowH) - geo.gapH]))
    return fitPeriodHeaderColumn(slots, geo.timeW, Number.isFinite(minHeight) ? minHeight : 52 * prefs.gridScale, prefs.gridScale, {
      layout: prefs.periodHeaderLayout,
      style: prefs.periodHeaderStyle,
      hanging: prefs.periodHeaderHanging,
      showX: prefs.periodHeaderShowX,
      hideTime,
      timeAlignment: prefs.periodHeaderTimeAlignment,
    })
  }, [geo, prefs.gridScale, prefs.periodHeaderLayout, prefs.periodHeaderStyle, prefs.periodHeaderHanging, prefs.periodHeaderShowX, hideTime, prefs.periodHeaderTimeAlignment])

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
      ref={rootRef}
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
              width={geo.colW}
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
        <div data-grid-week={currentWeek} data-grid-days={JSON.stringify(sortedDays)} data-grid-time={geo.timeW} data-grid-gap={geo.gapW} data-grid-col={geo.colW}
          data-grid-rows={JSON.stringify(geo.slots.filter((slot) => !slot.isPlaceholder).map((slot) => { const i=geo.slots.indexOf(slot); return { node:slot.nodeStart,y:yOfRows(geo.plan,i,geo.rowH,geo.mealBreakAfterRows,geo.mealGapExtra),height:rowHeightAt(geo.plan,i,geo.rowH)-geo.gapH } }))}
          style={{ position: 'relative', height: geo.gridH }}>
          {prefs.gridShowSeparators && <GridSeparators geo={geo} dayCount={dayCount} />}
          {[...geo.mealBreakAfterRows].map((row) => <div key={`meal-${row}`} className="meal-break-band" style={{ position: 'absolute', top: yOfRows(geo.plan,row+1,geo.rowH,geo.mealBreakAfterRows,geo.mealGapExtra)-geo.mealGapExtra, height:geo.mealGapExtra,left:0,right:0 }}><span>{Number(geo.slots[row].end.slice(0,2)) < 15 ? '午餐' : '晚餐'}</span><i /></div>)}
          {/* 时间栏 */}
          {geo.slots.map((slot, i) => (
            <div
              key={`row-${i}`}
              style={{
                position: 'absolute',
                top: yOfRows(geo.plan, i, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra),
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
                width={geo.timeW}
                height={rowHeightAt(geo.plan, i, geo.rowH) - geo.gapH}
                scale={prefs.gridScale}
                cornerRatio={prefs.gridCornerRatio}
                layout={prefs.periodHeaderLayout}
                style={prefs.periodHeaderStyle}
                hanging={prefs.periodHeaderHanging}
                showX={prefs.periodHeaderShowX}
                hideTime={hideTime}
                timeAlignment={prefs.periodHeaderTimeAlignment}
                lines={headerLines[geo.slots.slice(0, i).filter((item) => !item.isPlaceholder).length]}
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
            const cardY = yOfRows(geo.plan, anchorRow, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra)
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
                yOfRowsFn={(r) => yOfRows(geo.plan, r, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra)}
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

function GridSeparators({ geo, dayCount }: { geo: ReturnType<typeof buildGridGeometry>; dayCount: number }) {
  const vertical = Array.from({ length: dayCount + 1 }, (_, index) => geo.timeW + geo.gapW / 2 + index * (geo.colW + geo.gapW))
  const horizontal = Array.from({ length: geo.slots.length + 1 }, (_, index) => yOfRows(geo.plan, index, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra))
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color: 'var(--md-outline-variant)', opacity: 0.42 }}>
      {vertical.map((x) => <div key={`v-${x}`} style={{ position: 'absolute', top: 0, bottom: 0, left: x, borderLeft: '0.7px solid currentColor' }} />)}
      {horizontal.map((y) => <div key={`h-${y}`} style={{ position: 'absolute', left: geo.timeW, right: 0, top: y, borderTop: '0.7px solid currentColor' }} />)}
      {[...geo.mealBreakAfterRows].map((row) => {
        const top = yOfRows(geo.plan, row + 1, geo.rowH, geo.mealBreakAfterRows, geo.mealGapExtra) - geo.mealGapExtra
        return <div key={`b-${row}`} style={{ position: 'absolute', left: geo.timeW, right: 0, top, height: geo.mealGapExtra, borderTop: '0.7px solid currentColor' }} />
      })}
    </div>
  )
}
// ---- 子组件 -----------------------------------------------------------

export function SingleTimeHeadCell({
  slot, width, height = 52, scale, cornerRatio, layout, style, hanging, showX,
  hideTime = false, timeAlignment = 'dash', lines: sharedLines,
}: {
  slot: { label: string; displayStart: string; displayEnd: string; nodeStart?: number; nodeEnd?: number; isPlaceholder?: boolean }
  width: number
  height?: number
  scale: number
  cornerRatio: number
  layout: PeriodHeaderLayout
  style: PeriodHeaderStyle
  hanging: number
  showX: boolean
  hideTime?: boolean
  timeAlignment?: 'dash' | 'center'
  lines?: PeriodHeaderTextLine[]
}) {
  const isPh = !!slot.isPlaceholder
  const lines = sharedLines ?? fitPeriodHeaderColumn([slot], width, height, scale, {
    layout, style, hanging, showX, hideTime, timeAlignment,
  })[0]
  return (
    <div
      data-period-header-hanging={layout === 'three_line' ? hanging : undefined}
      data-period-header-hide-time={layout === 'legacy' && hideTime ? true : undefined}
      style={{
        width, flexShrink: 0, minWidth: 0, height: '100%', position: 'relative',
        borderRadius: 8 * scale * Math.min(1, cornerRatio),
        background: isPh ? 'color-mix(in srgb, var(--md-surface-container-low) 50%, transparent)' : 'var(--md-surface-container-low)',
      }}
    >
      {!isPh && lines.map(line => (
        <span
          key={line.kind}
          data-period-header-line={line.kind}
          className="m3-label-small"
          style={{
            position: 'absolute', left: line.left, top: line.top,
            fontSize: line.size, lineHeight: `${line.lineHeight}px`, letterSpacing: line.tracking,
            fontWeight: line.kind === 'label' ? 600 : 500, whiteSpace: 'nowrap',
            color: line.kind === 'label' ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
          }}
        >{line.text}</span>
      ))}
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
  // CourseColorUtil.pickCourseColorComposeWithGroupRows 同源取色;
  // 统一底色 neutral/onSurface 单一事实来源 courseNeutralTokens — Android 权威源
  // = colors.secondaryContainer/onSurface (CourseTableView.kt:859,1521)。
  // isDark 走 resolveIsDark (system 模式跟随系统, 与 Android isPaletteDark 同构)
  const isDark = resolveIsDark(prefs)
  const { neutral, onSurface } = useMemo(() => courseNeutralTokens(isDark), [isDark, prefs.theme])
  const bg = pickCourseColorWithGroupRows(course, groupRows, isDark, neutral, prefs.courseColorless)
  const fg = textColorOnHex(bg, isDark, onSurface)
  const subInfo = prefs.gridSubInfo
  // issue#26: 网格别名 — gridUseAlias 开且别名非空才显示别名
  const name = prefs.gridUseAlias && course.alias ? course.alias : course.courseName
  const subText = subInfo === 'room' ? course.room : subInfo === 'teacher' ? course.teacher : ''
  const alpha = isGrey ? 0.6 : 1

  return (
    <div
      onClick={onClick}
      data-course-id={course.id} data-course-day={course.day} data-course-node={course.startNode} data-course-step={course.step}
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
              textAlign: 'center',
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
  width,
  isToday,
  isGrey,
  courseCount,
  dateStr,
  scale,
  cornerRatio,
}: {
  day: number
  width: number
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
  const detail = dateStr ?? (courseCount === 0 ? t('no_course') : t('course_count_format', { v1: courseCount }))
  const textFit = Math.min(1, width / Math.max(
    estimatePeriodHeaderTextWidth(dayLabel, 14 * scale, 600, 0.1),
    estimatePeriodHeaderTextWidth(detail, (dateStr ? 10 : 9) * scale),
    1,
  ))
  // CourseTableView.kt:903-906 DayHeadCell 1:1: radius (10*scale*cornerRatio@max1), v-padding date?4:3
  const vPad = (dateStr ? 4 : 3) * scale

  return (
    <div
      data-day-header={day}
      style={{
        width,
        flexShrink: 0,
        minWidth: 0,
        height: (dateStr ? 56 : 52) * scale,
        borderRadius: 10 * scale * Math.min(1, cornerRatio),
        background: bg,
        padding: `${vPad}px 0`,
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
        style={{ fontWeight: 600, fontSize: 14 * scale * textFit, lineHeight: `${20 * scale}px`, letterSpacing: 0.1 * textFit, color: fg, whiteSpace: 'nowrap' }}
      >
        {dayLabel}
      </span>
      {dateStr ? (
        <span className="m3-label-small" style={{ fontSize: 10 * scale * textFit, lineHeight: `${11 * scale}px`, letterSpacing: 0.5 * textFit, color: subFg, whiteSpace: 'nowrap' }}>
          {dateStr}
        </span>
      ) : (
        <span className="m3-label-small" style={{ fontSize: 9 * scale * textFit, lineHeight: `${11 * scale}px`, letterSpacing: 0.5 * textFit, color: subFg, whiteSpace: 'nowrap' }}>
          {detail}
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

/** ref sleepy#191: 固定中文 M月d日 格式 (Android DateUtils.shortDateChinese), 不随语言变化 */
/** 向上找最近的可垂直滚动祖先 (捏合锚点用)。 */
function findVerticalScroller(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node
    node = node.parentElement
  }
  return null
}

/** yOfRows 的反函数: 给定网格体内 y 偏移, 求小数行号 acc ∈ [0, slots]。 */
export function invertRowsToAcc(
  plan: RenderSlotPlan,
  y: number,
  rowH: number,
  mealBreakAfterRows: Set<number>,
  mealGapExtra: number
): number {
  if (y <= 0) return 0
  const ws = plan.slotWeights
  const n = plan.slots.length
  let cum = 0
  for (let i = 0; i < n; i++) {
    const seg = rowH * (ws?.[i] ?? 1) + (mealBreakAfterRows.has(i) ? mealGapExtra : 0)
    if (y <= cum + seg) return seg > 0 ? i + (y - cum) / seg : i
    cum += seg
  }
  return n
}

export function shortDateChinese(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** Compare calendar dates, ignoring time-of-day. */
export function isDateToday(date: Date | null, today = new Date()): boolean {
  return date != null && date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
}

export { parseHex }
