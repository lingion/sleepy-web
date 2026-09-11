/**
 * CourseDetailSheet — Kotlin ui/component/CourseDetailSheet.kt 1:1 移植
 * 课程详情底部弹层: Header/时间 chip/明细行/默认置顶选择(仅 ≥2 图层冲突簇)/编辑按钮。
 * 簇信息带 timeJson 走分钟域(与网格一致), ownTime 课先归一化 (用户报障 2026-09-10)。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../state/prefsStore'
import { findClusters, chainGroups, conflictClusterKeyOf } from '../domain/conflictLayout'
import { normalizeNode } from '../data/types'
import type { Course } from '../data/types'
import { localizedDay } from './schedule/CardsGridView'

export function shortNodeString(c: Course): string {
  if (c.ownTime && c.startTime.trim() !== '' && c.endTime.trim() !== '') {
    return `${c.startTime}-${c.endTime}`
  }
  return c.startNode === c.startNode + c.step - 1
    ? `第${c.startNode}节`
    : `第${c.startNode}-${c.startNode + c.step - 1}节`
}

export function CourseDetailSheet({
  course,
  timeString,
  allCourses,
  timeJson,
  onDismiss,
  onEdit,
}: {
  course: Course
  timeString?: string
  allCourses: Course[]
  timeJson?: string | null
  onDismiss: () => void
  onEdit?: (c: Course) => void
}) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)

  // course 所在冲突簇 — 带 timeJson 走分钟域, ownTime 先归一化
  const clusterInfo = useMemo(() => {
    const sameDay = allCourses
      .filter((c) => c.day === course.day)
      .map((c) => (timeJson ? normalizeNode(c, timeJson) : c))
    const clusters = findClusters(sameDay, timeJson ?? null)
    const hit = clusters.find((cl) => cl.courses.some((c) => c.id === course.id))
    return hit && hit.courses.length >= 2 ? hit : null
  }, [course, allCourses, timeJson])

  const layers = useMemo(
    () => (clusterInfo ? chainGroups(clusterInfo.courses) : []),
    [clusterInfo],
  )
  const clusterKey = clusterInfo ? conflictClusterKeyOf(clusterInfo) : ''
  const savedRepId = prefs.conflictDefaultTop[clusterKey]

  async function setDefaultTop(repId: number | null) {
    const next = { ...prefs.conflictDefaultTop }
    if (repId === null) delete next[clusterKey]
    else next[clusterKey] = repId
    await update({ conflictDefaultTop: next })
  }

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('course_detail_title')}
        onClick={(e) => e.stopPropagation()}
        className="m3-card"
        style={{
          width: '100%', maxWidth: 560, borderRadius: '28px 28px 0 0',
          paddingBottom: 24, maxHeight: '85vh', overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'var(--md-surface-container)', padding: '16px 20px 12px',
            borderRadius: '28px 28px 0 0',
          }}
        >
          <div className="m3-title-large">{course.courseName || t('course_detail_title')}</div>
        </div>

        <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {timeString && (
            <span
              className="m3-label-medium"
              style={{
                alignSelf: 'flex-start', background: 'var(--md-secondary-container)',
                color: 'var(--md-on-secondary-container)', padding: '6px 12px', borderRadius: 10,
              }}
            >
              {timeString}
            </span>
          )}

          <DetailRow label={t('course_field_name')} value={course.courseName || '—'} />
          {course.teacher.trim() !== '' && <DetailRow label={t('course_field_teacher')} value={course.teacher} />}
          {course.room.trim() !== '' && <DetailRow label={t('course_field_room')} value={course.room} />}
          <DetailRow
            label={t('course_field_week')}
            value={t('course_week_range', { v1: shortNodeString(course), v2: course.startWeek, v3: course.endWeek })}
          />
          {course.note.trim() !== '' && <DetailRow label={t('course_field_note')} value={course.note} />}

          {/* 默认置顶选择区 — 仅 ≥2 图层冲突簇显示 (v7.10.16p) */}
          {clusterInfo && layers.length >= 2 && (
            <div role="radiogroup" aria-label={t('conflict_default_top_title')} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
              <div className="m3-title-small" style={{ fontWeight: 600, padding: '4px 0' }}>
                {t('conflict_default_top_title')}
              </div>
              {layers.map((layer) => {
                const layerRepId = layer[0].id
                const label = layer.map((c) => c.courseName || '—').join('、')
                const selected = savedRepId === layerRepId
                return (
                  <label
                    key={layerRepId}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name={`conflict-top-${clusterKey}`}
                      checked={selected}
                      onChange={() => void setDefaultTop(selected ? null : layerRepId)}
                    />
                    <span className="m3-body-medium" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {onEdit && (
            <button
              onClick={() => onEdit(course)}
              style={{
                padding: 12, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'var(--md-primary)', color: 'var(--md-on-primary)',
                fontSize: 14, fontWeight: 600,
              }}
            >
              {t('course_detail_edit_course')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', width: 54, flexShrink: 0 }}>
        {label}
      </span>
      <span className="m3-body-medium" style={{ flex: 1 }}>{value}</span>
    </div>
  )
}

/** localizedDay re-export 帮助本文件内使用一致性 (i18n.language 由调用方组装) */
export { localizedDay }
