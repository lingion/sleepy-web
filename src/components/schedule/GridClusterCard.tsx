/**
 * GridClusterCard — 冲突簇卡 (ConflictCard.kt ConflictClusterCard 1:1)
 * STACK: 顶卡缩左上 / 底卡缩右下; FOLD: 折角; RAIL: 顶收窄底全宽。
 * N≥3: 右上 +N 气泡 (层数-2), 点露出带轮换推进。
 *
 * 簇几何 (ref #146 #147, Android 2b5882be/v1.0.61 定稿): 外层锚点在 baseRowFrac,
 * 簇内容经 clusterYOffset = (min − base) 回退到最早行, 每卡按自身起始行定位 —
 * 1-2 + 2-4 同格 → 两卡分别落第 1、2 行, 不再整簇同点互相压死。
 * 一切 dp 换算走加权轴 yOfRowsFn (占位行/小数行成员与外层 yOfRows 同一真值)。
 */

import type { Course } from '../../data/types'
import type { ClusterRowGeom, ConflictRect, ConflictVariant, LaidOutCourse } from '../../domain/conflictLayout'
import { usePrefsStore } from '../../state/prefsStore'
import {
  clusterRowGeom,
  clusterYOffset,
  conflictCardRectFrac,
  conflictMarkRectFrac,
  clusterLanePlan,
  hiddenLayerCount,
  overrideAwareLayerOrder,
  applyLayerRotation,
  memberToLayerRep,
} from '../../domain/conflictLayout'
import {
  parseHex,
  rgbToHex,
  conflictBorderColor,
  pickCourseColorWithGroupRows,
} from '../../domain/courseColor'
import { CourseOverlayCard } from './CardsGridView'
import { timeToFractionalRows } from '../../domain/timeTable'
import type { TimeSlot } from '../../domain/timeTable'

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
  slots: TimeSlot[]
  gapH: number
  isGrey: boolean
  containerWidth: number
  offsetX: number
  offsetY: number
  yOfRowsFn: (r: number) => number
}

/** 簇形态 (clusterForm 1:1): 首个 hidden variant 优先; rail → RAIL; fold → FOLD; 否则 STACK */
export function clusterFormOf(style: string, firstHiddenVariant: ConflictVariant | null): ConflictVariant {
  if (firstHiddenVariant) return firstHiddenVariant
  if (style === 'rail') return 'RAIL'
  if (style === 'fold') return 'FOLD'
  return 'STACK'
}

/** 每课行几何: fracOf = 分钟比例 (ownTime 真值), 由渲染层注入 */
export function clusterRowGeoms(
  courses: Course[],
  slots: TimeSlot[],
): Map<number, ClusterRowGeom> {
  const out = new Map<number, ClusterRowGeom>()
  for (const c of courses) {
    out.set(c.id, clusterRowGeom(c, slots, (s, e) => timeToFractionalRows(s, e, slots)))
  }
  return out
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
    offsetX,
    offsetY,
    onPickTop,
    yOfRowsFn,
  } = props

  const prefs = usePrefsStore((s) => s.prefs)

  // N≥3 气泡徽标: 层数 - 2 (按层计, 轮换中恒定)
  const layerCount = cluster.courses.length >= 2 ? countLayers(laidOut) : 1
  const badge = hiddenLayerCount(layerCount)

  // 加权轴与 Android spanDpOf 同构: 行差 → yOfRows 差 (无占位行时 = 裸 rowH 历史行为)
  const spanDpOf = (from: number, to: number) => yOfRowsFn(to) - yOfRowsFn(from)

  // 簇行几何 (rowGeomOf 1:1): ownTime 分钟比例, 常规课整行
  const geoms = clusterRowGeoms(laidOut.map((l) => l.course), slots)
  const geomOf = (id: number): ClusterRowGeom => geoms.get(id) ?? { startFrac: 0, spanFrac: 1 }

  // baseRowFrac = 主课判定序首位课 (调用方以它定位, override 不改变该锚点);
  // 簇内容原点回退到 minStartRow。
  const anchor = cluster.courses[0]
  const baseRowFrac = geomOf(anchor.id).startFrac
  const minStartRow = Math.min(...laidOut.map((l) => geomOf(l.course.id).startFrac))
  const maxEndRow = Math.max(...laidOut.map((l) => {
    const g = geomOf(l.course.id)
    return g.startFrac + g.spanFrac
  }))
  const clusterH = spanDpOf(minStartRow, maxEndRow) - gapH
  // ref #146: 偏移 = min − base (负值向上), 主分支与兜底同号由 clusterYOffset 保证。
  const yOffset = clusterYOffset(rowH, baseRowFrac, minStartRow, spanDpOf)
  const cardYOf = (course: Course) => spanDpOf(minStartRow, geomOf(course.id).startFrac)

  // 顶卡收窄量按 style 分流 (ConflictCard.kt:591-593 同构: RAIL→RailInset, else→StackInset);
  // 折角幅度走用户拖杆 (ConflictCard.kt:596 foldSize)。此前硬编码 12/16 = 滑杆零消费 (audit 偏好默认值 high)
  const form = clusterFormOf(style, laidOut.find((l) => l.hidden)?.variant ?? null)
  const inset = form === 'RAIL' ? prefs.conflictRailInset : prefs.conflictStackInset
  const foldSize = prefs.conflictFoldSize

  // 课色(描边/虚线/flap 取色, 含 isGrey 灰显, 与卡渲染取同一色) — ConflictCard.kt:526
  // courseColorOf 1:1: pickCourseColorWithGroupRows + isGrey→alpha 0.6 (SleepyTheme.Alpha.inactive)
  const isDark = prefs.themeMode === 'dark'
  const neutral = isDark ? '#49454F' : '#E7E0EC'
  const courseColorOf = (course: Course): string => {
    const bg = pickCourseColorWithGroupRows(course, cluster.courses, isDark, neutral, prefs.courseColorless)
    return isGrey ? rgbaCss(bg, 0.6) : bg
  }

  function cardRect(l: LaidOutCourse, isTop: boolean) {
    return conflictCardRectFrac(geomOf(l.course.id), isTop, form, colW, rowH, gapH, minStartRow, inset, spanDpOf)
  }

  // laneMode (ConflictCard.kt 012fbb69, ref #142): 含 ownTime 小数行成员的簇 →
  // 并排分栏全部同时可见, 不层叠。「多出来的课程覆盖在课表之上」报障的根治分支。
  const lanePlan = clusterLanePlan(
    laidOut,
    geoms,
    new Set(laidOut.filter((l) => l.course.ownTime && l.course.startTime && l.course.endTime).map((l) => l.course.id)),
  )
  if (lanePlan && lanePlan.laneCount >= 2) {
    const laneW = colW / lanePlan.laneCount
    return (
      <div data-grid-cluster style={{ position: 'absolute', left: offsetX, top: offsetY, width: colW }}>
        <div data-grid-cluster-lanes style={{ position: 'absolute', left: 0, top: yOffset, width: colW, height: clusterH }}>
          {laidOut.map((l) => {
            const lane = lanePlan.laneOf.get(l.course.id) ?? 0
            const r = conflictCardRectFrac(geomOf(l.course.id), false, 'NONE', laneW, rowH, gapH, minStartRow, inset, spanDpOf)
            const borderColor = conflictBorderColor(parseHex(courseColorOf(l.course)) ?? [0, 0, 0])
            return (
              <div
                key={l.course.id}
                data-grid-cluster-card={l.course.id}
                style={{ position: 'absolute', top: r.y, left: laneW * lane, width: laneW, height: r.height }}
              >
                <CourseOverlayCard
                  course={l.course}
                  groupRows={cluster.courses}
                  isGrey={isGrey}
                  scale={1}
                  cornerRatio={1}
                  onClick={() => onCourseClick?.(l.course)}
                  x={0}
                  y={0}
                  w={laneW}
                  h={r.height}
                  border={`1px solid ${rgbToHex(borderColor)}`}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div data-grid-cluster style={{ position: 'absolute', left: offsetX, top: offsetY, width: colW }}>
      {/* 簇内容 Box: 锚点 Box 经 yOffset 回退到 minStartRow (Android .offset(y = clusterYOffset)) */}
      <div style={{ position: 'absolute', left: 0, top: yOffset, width: colW, height: clusterH }}>
      {/* 绘制顺序 = 非顶 → 顶 → Mark (ConflictCard.kt drawingOrder) */}
      {laidOut.map((l) => (
        <ClusterItem
          key={l.course.id}
          item={l}
          form={form}
          rect={cardRect(l, !l.hidden && (l.zRank === 0 || l.chainFront))}
          markRect={l.hidden && form !== 'FOLD' ? conflictMarkRectFrac(geomOf(l.course.id), form, colW, rowH, gapH, minStartRow, spanDpOf) : null}
          cardY={cardYOf(l.course)}
          gapH={gapH}
          isGrey={isGrey}
          colW={colW}
          foldSize={foldSize}
          allCourses={cluster.courses}
          onCourseClick={onCourseClick}
          onRotate={onRotate}
          onPickTop={onPickTop}
          borderColorOf={courseColorOf}
        />
      ))}
      {/* FOLD 虚线轮廓 = hidden 课视觉本体, 锚自身区间 (v7.10.16o: 全遮也画) */}
      {form === 'FOLD' && laidOut.filter((l) => l.hidden).map((l) => {
        const ownH = cardRect(l, true).height
        return (
          <div
            key={`dash-${l.course.id}`}
            data-grid-cluster-mark={l.course.id}
            onClick={(e) => {
              e.stopPropagation()
              onRotate()
            }}
            style={{
              position: 'absolute',
              top: cardYOf(l.course) + 2,
              left: 2,
              width: colW - 4,
              height: Math.max(0, ownH - 4),
              borderRadius: 12,
              border: `1.5px dashed ${rgbToHex(conflictBorderColor(parseHex(courseColorOf(l.course)) ?? [0, 0, 0]))}`,
              cursor: 'pointer',
              zIndex: 10 + l.zRank,
            }}
          />
        )
      })}
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
    </div>
  )
}

/** hex → rgba(css) — isGrey 灰显 (SleepyTheme.Alpha.inactive=0.6, Android bg.copy(alpha)) */
function rgbaCss(hex: string, alpha: number): string {
  const rgb = parseHex(hex)
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : hex
}

function countLayers(laidOut: LaidOutCourse[]): number {
  // zRank 分层 = 图层数 (每层成员共享层身份; 简化: 不同 zRank 数)
  return new Set(laidOut.map((l) => l.zRank)).size
}

function ClusterItem({
  item,
  form,
  rect,
  markRect,
  cardY,
  gapH,
  isGrey,
  colW,
  foldSize,
  allCourses,
  onCourseClick,
  onRotate,
  onPickTop,
  borderColorOf,
}: {
  item: LaidOutCourse
  form: ConflictVariant
  rect: ConflictRect
  /** hidden 课命中区 (STACK/RAIL 自身区间右下 36dp); null = 无独立命中区 */
  markRect: ConflictRect | null
  cardY: number
  gapH: number
  isGrey: boolean
  colW: number
  foldSize: number
  allCourses: Course[]
  onCourseClick?: (c: Course) => void
  onRotate: () => void
  onPickTop: (courseId: number | null) => void
  borderColorOf: (c: Course) => string
}) {
  const { course, zRank, hidden, chainFront } = item
  // 顶层链组成员(chainFront)按顶卡形态 (Android v7.8: isFrontCard = chainFront || zRank===0)
  const isFrontCard = chainFront || zRank === 0
  // FOLD hidden 课视觉本体 = 簇级虚线 (v7.10.16n), 真卡不渲染 — 裸真卡尾巴就是 #147 报的「重叠错位」
  if (hidden && form === 'FOLD') return null

  // 真卡 1px 自派生描边 (ConflictCard.kt:1003 .border(CARD_BORDER_DP=1dp,
  // conflictBorderColor(effectiveBg)) 同构) — 亮压暗/暗提亮,与自身填充/网格底有对比
  const borderColor = conflictBorderColor(parseHex(borderColorOf(course)) ?? [0, 0, 0])
  // FOLD 顶卡折角 (cardIsFolded = form==FOLD && isFront, v7.4 F3 链组每成员都折)
  const showFlap = form === 'FOLD' && isFrontCard

  return (
    <>
      <div
        data-grid-cluster-card={course.id}
        style={{
          position: 'absolute',
          top: rect.y,
          left: rect.x,
          width: rect.width,
          height: rect.height,
          zIndex: 20 + zRank,
        }}
      >
        <CourseOverlayCard
          course={course}
          groupRows={allCourses}
          isGrey={isGrey}
          scale={1}
          cornerRatio={1}
          onClick={() => (isFrontCard ? onCourseClick?.(course) : onPickTop(course.id))}
          x={0}
          y={0}
          w={rect.width}
          h={rect.height}
          border={`1px solid ${rgbToHex(borderColor)}`}
        />
        {showFlap && (
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
              pointerEvents: 'none',
            }}
          />
        )}
        {form === 'STACK' && !isFrontCard && (
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: 2,
              background: 'color-mix(in srgb, var(--md-on-surface) 30%, transparent)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      {/* Mark = hidden 课命中区, 锚自身区间右下 (v5: 锚簇格位是错的——短课命中区伸进不占节次) */}
      {markRect && (
        <div
          data-grid-cluster-mark-hit={course.id}
          onClick={(e) => {
            e.stopPropagation()
            onRotate()
          }}
          style={{
            position: 'absolute',
            top: markRect.y,
            left: markRect.x,
            width: markRect.width,
            height: markRect.height,
            zIndex: 10 + zRank,
            cursor: 'pointer',
          }}
        />
      )}
      {/* RAIL/FOLD 露出带点击轮换的旧语义保留: hidden 露边点击 = 该课置顶 */}
      {hidden && form !== 'FOLD' && !markRect && (
        <div
          onClick={(e) => {
            e.stopPropagation()
            onRotate()
          }}
          style={{
            position: 'absolute',
            top: cardY + 2,
            left: 2,
            width: colW - 4,
            height: Math.max(0, rect.height - 4 - gapH * 0),
            zIndex: 10 + zRank,
            cursor: 'pointer',
          }}
        />
      )}
    </>
  )
}

/** 轮换基准序 (ScheduleScreen 同源): 置顶感知序 + 会话步数循环左移 */
export function rotatedLayerOrder(courses: Course[], topRepId: number | null, steps: number): number[] {
  const baseline = overrideAwareLayerOrder(courses, topRepId)
  return applyLayerRotation(baseline, steps)
}

export { memberToLayerRep }
