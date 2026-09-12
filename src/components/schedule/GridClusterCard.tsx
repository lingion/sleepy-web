/**
 * GridClusterCard — 冲突簇卡 (ConflictCard.kt ConflictClusterCard 1:1 精简版)
 * STACK: 顶卡缩左上 / 底卡缩右下; FOLD: 折角; RAIL: 顶收窄底全宽。
 * N≥3: 右上 +N 气泡 (层数-2), 点露出带轮换推进。
 */

import type { Course } from '../../data/types'
import type { LaidOutCourse } from '../../domain/conflictLayout'
import { usePrefsStore } from '../../state/prefsStore'
import {
  hiddenLayerCount,
  overrideAwareLayerOrder,
  applyLayerRotation,
  memberToLayerRep,
} from '../../domain/conflictLayout'
import { CourseOverlayCard } from './CardsGridView'

export interface GridClusterCardProps {
  cluster: { day: number; courses: Course[] }
  laidOut: LaidOutCourse[]
  style: string
  rotationStep: number
  onRotate: () => void
  onPickTop: (courseId: number | null) => void
  onCourseClick?: (c: Course) => void
  colW: number
  rowH: number
  maxNode: number
  slots: { nodeStart: number; nodeEnd: number; isPlaceholder?: boolean }[]
  gapH: number
  isGrey: boolean
  containerWidth: number
  offsetX: number
  offsetY: number
  yOfRowsFn: (r: number) => number
}

export function GridClusterCard(props: GridClusterCardProps) {
  const {
    cluster,
    laidOut,
    style,
    onRotate,
    onCourseClick,
    colW,
    rowH,
    slots,
    gapH,
    isGrey,
    containerWidth,
    offsetX,
    offsetY,
    yOfRowsFn,
  } = props

  const prefs = usePrefsStore((s) => s.prefs)

  // N≥3 气泡徽标: 层数 - 2 (按层计, 轮换中恒定)
  const layerCount = cluster.courses.length >= 2 ? countLayers(laidOut) : 1
  const badge = hiddenLayerCount(layerCount)

  // 簇内最大行区间 → 簇卡总高
  const maxEnd = Math.max(
    ...laidOut.map((l) => {
      const idx = slots.findIndex((s) => s.nodeStart === l.course.startNode)
      const steps = Math.max(1, Math.min(l.course.step, slots.length - Math.max(idx, 0)))
      return Math.max(idx, 0) + steps
    })
  )
  const clusterH = yOfRowsFn(maxEnd) - gapH
  // 顶卡收窄量按 style 分流 (ConflictCard.kt:591-593 同构: RAIL→RailInset, else→StackInset);
  // 折角幅度走用户拖杆 (ConflictCard.kt:596 foldSize)。此前硬编码 12/16 = 滑杆零消费 (audit 偏好默认值 high)
  const inset = style === 'rail' ? prefs.conflictRailInset : prefs.conflictStackInset
  const foldSize = prefs.conflictFoldSize

  return (
    <div style={{ position: 'absolute', left: offsetX, top: offsetY, width: colW, height: clusterH }}>
      {/* 绘制顺序 = 非顶 → 顶 → Mark (ConflictCard.kt drawingOrder) */}
      {laidOut.map((l) => (
        <ClusterItem
          key={l.course.id}
          item={l}
          style={style}
          rowH={rowH}
          slots={slots}
          gapH={gapH}
          isGrey={isGrey}
          containerWidth={containerWidth}
          inset={inset}
          foldSize={foldSize}
          allCourses={cluster.courses}
          onCourseClick={onCourseClick}
          onRotate={onRotate}
        />
      ))}
      {badge > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRotate()
          }}
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            border: 'none',
            background: 'var(--md-primary)',
            color: 'var(--md-on-primary)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            zIndex: 100,
          }}
        >
          +{badge}
        </button>
      )}
    </div>
  )
}

function countLayers(laidOut: LaidOutCourse[]): number {
  // zRank 分层 = 图层数 (每层成员共享层身份; 简化: 不同 zRank 数)
  return new Set(laidOut.map((l) => l.zRank)).size
}

function ClusterItem({
  item,
  style,
  rowH,
  slots,
  gapH,
  isGrey,
  containerWidth,
  inset,
  foldSize,
  allCourses,
  onCourseClick,
  onRotate,
}: {
  item: LaidOutCourse
  style: string
  rowH: number
  slots: { nodeStart: number; nodeEnd: number; isPlaceholder?: boolean }[]
  gapH: number
  isGrey: boolean
  containerWidth: number
  inset: number
  foldSize: number
  allCourses: Course[]
  onCourseClick?: (c: Course) => void
  onRotate: () => void
}) {
  const { course, zRank, hidden, variant, chainFront } = item
  const isTop = zRank === 0

  if (hidden) {
    // Mark: 虚线轮廓 + 折角 (FOLD) / 缩进小条 (RAIL) — 不可点透, 点按=轮换
    return (
      <div
        onClick={(e) => {
          e.stopPropagation()
          onRotate()
        }}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 12,
          border:
            variant === 'FOLD'
              ? '1.5px dashed color-mix(in srgb, var(--md-on-surface) 45%, transparent)'
              : 'none',
          background:
            variant === 'RAIL'
              ? 'color-mix(in srgb, var(--md-surface-variant) 55%, transparent)'
              : 'transparent',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: 3,
          cursor: 'pointer',
          zIndex: 10 + zRank,
        }}
      >
        {variant === 'FOLD' && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: foldSize,
              height: foldSize,
              background: 'var(--md-surface-container-high)',
              borderBottomLeftRadius: 12,
              boxShadow: '-1px 1px 2px rgba(0,0,0,0.12)',
            }}
          />
        )}
        {variant === 'STACK' && zRank > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: 2,
              background: 'color-mix(in srgb, var(--md-on-surface) 30%, transparent)',
            }}
          />
        )}
      </div>
    )
  }

  // 露出真卡: STACK 沉底缩小右下 / 置顶或链前正常 / RAIL 沉底全宽胶囊
  const stackSink = style === 'stack' && !isTop && !chainFront
  const railSink = style === 'rail' && !isTop && !chainFront
  const innerStyle: React.CSSProperties = stackSink
    ? {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: containerWidth - inset,
      }
    : railSink
      ? { width: '100%' }
      : {}

  const idx = slots.findIndex((s) => s.nodeStart === course.startNode)
  const steps = Math.max(1, Math.min(course.step, Math.max(1, slots.length - Math.max(idx, 0))))
  const h = Math.max(20, steps * rowH - gapH)

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h, zIndex: 20 + zRank, ...innerStyle }}>
      <CourseOverlayCard
        course={course}
        groupRows={allCourses}
        isGrey={isGrey}
        scale={1}
        cornerRatio={1}
        onClick={() => onCourseClick?.(course)}
        x={0}
        y={0}
        w={stackSink ? containerWidth - inset : containerWidth}
        h={h}
      />
    </div>
  )
}

/** 轮换基准序 (ScheduleScreen 同源): 置顶感知序 + 会话步数循环左移 */
export function rotatedLayerOrder(courses: Course[], topRepId: number | null, steps: number): number[] {
  const baseline = overrideAwareLayerOrder(courses, topRepId)
  return applyLayerRotation(baseline, steps)
}

export { memberToLayerRep }
