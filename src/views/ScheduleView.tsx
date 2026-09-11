/**
 * ScheduleView — 课表主 tab (Week strip + Detail cards / Grid 双显示模式)
 * Android ScheduleScreen + CourseTableView 同构; 当前为骨架, Week2 完善布局。
 */

import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'

export function ScheduleView() {
  const { t } = useTranslation()
  const displayMode = usePrefsStore((s) => s.prefs.displayMode)
  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const courses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : [],
    [defaultTable?.id]
  )

  return (
    <div style={{ padding: 16 }}>
      <h1 className="m3-title-large" style={{ marginTop: 0 }}>
        {t('tab_schedule')}
      </h1>
      {!defaultTable ? (
        <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('schedule_empty_create_table')}
        </p>
      ) : (
        <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
          {defaultTable.name} · {courses?.length ?? 0} 门课 · {displayMode === 'full' ? t('display_full', '周视图') : t('display_cards', '卡片视图')}
        </p>
      )}
    </div>
  )
}
