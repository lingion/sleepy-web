import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../../data/db'
import { normalizeNode, type Course } from '../../data/types'
import { SettingsScaffold, SectionHeader } from './shared'

export function CourseListPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const table = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const courses = useLiveQuery(() => table ? db.courses.where('tableId').equals(table.id).toArray() : Promise.resolve([] as Course[]), [table?.id])
  const groups = useMemo(() => {
    const map = new Map<string, Course[]>()
    for (const source of courses ?? []) {
      const course = table?.timeJson ? normalizeNode(source, table.timeJson) : source
      const key = `${course.courseName || course.groupId}\u0000${course.teacher.trim()}`
      const list = map.get(key) ?? []
      list.push(course)
      map.set(key, list)
    }
    return [...map.entries()].sort(([, a], [, b]) => (a[0].courseName || a[0].groupId).localeCompare(b[0].courseName || b[0].groupId))
  }, [courses, table])

  return <SettingsScaffold title={t('mine_course_list', '课程清单')} onBack={onBack}>
    <SectionHeader title={table?.name ?? t('mine_course_list', '课程清单')} />
    {groups.length === 0 ? <div className="m3-card" style={{ padding: 20, color: 'var(--md-on-surface-variant)' }}>{t('mine_course_list_empty_all', '当前课表无任何课程')}</div> : groups.map(([key, items]) => {
      const first = items[0]
      const byRoom = new Map<string, Course[]>()
      for (const course of items) {
        const room = course.room.trim()
        const roomItems = byRoom.get(room) ?? []
        roomItems.push(course)
        byRoom.set(room, roomItems)
      }
      const locations = [...byRoom.entries()]
      return <div className="m3-card" key={key} style={{ padding: 16 }}>
        <div className="m3-title-medium">{first.courseName || first.groupId}</div>
        {first.teacher && <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', marginTop: 6 }}>{first.teacher}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {locations.map(([room, roomItems]) => <div key={room}>
            {room && <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{room}</div>}
            <div className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>{t('course_list_arrangements', { count: roomItems.length, defaultValue: `${roomItems.length} 个上课安排` })}</div>
            {roomItems.map((course) => <div key={course.id} className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
              {t('course_weekday_period', { day: course.day, start: course.startNode, startWeek: course.startWeek, end: course.endWeek, defaultValue: `周${course.day} · 第 ${course.startNode} 节 (${course.startWeek}-${course.endWeek}周)` })}
            </div>)}
          </div>)}
        </div>
      </div>
    })}
  </SettingsScaffold>
}
