/** MineScreen.kt at Android 77b878fd: header, statistics, three headings and four settings groups. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { IconEdit, IconPalette, IconTune, IconInfo, IconNotifications, IconSchedule } from '../../components/icons'
import type { Course } from '../../data/types'
import { getCachedUpdate, maybeCheckOnStart } from '../../domain/update/updateChecker'
import pkg from '../../../package.json'
import './MineHome.css'

export function MineHome({
  navExtraBottom = 0, onOpenGeneral, onOpenHoliday, onOpenBackup, onOpenWidgets,
  onOpenAppearance, onOpenAllTables, onOpenPeriodTables, onOpenAbout, onOpenReminder, onOpenCourseList,
}: {
  navExtraBottom?: number
  onOpenHoliday?: () => void
  onOpenBackup?: () => void
  onOpenWidgets?: () => void
  onOpenGeneral: () => void
  onOpenAppearance: () => void
  onOpenExport: () => void
  onOpenAllTables: () => void
  onOpenPeriodTables: () => void
  onOpenAbout: () => void
  onOpenReminder: () => void
  onOpenCourseList: () => void
}) {
  const { t } = useTranslation()
  const [, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    void maybeCheckOnStart(pkg.version).then(() => { if (active) setRefresh(c => c + 1) })
    return () => { active = false }
  }, [])
  const updateNoticeVisible = getCachedUpdate() !== null
  const tables = useLiveQuery(() => db.timetables.toArray(), []) ?? []
  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const courses = useLiveQuery(
    async () => defaultTable ? db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id],
  )
  const periodCount = useLiveQuery(() => db.periodTables.count(), []) ?? 0
  const courseCount = useMemo(
    () => new Set((courses ?? []).map(c => c.courseName.trim() === '' ? `#${c.groupId}` : c.courseName)).size,
    [courses],
  )

  return (
    <div className="mine-home" style={{ paddingBottom: 16 + navExtraBottom }}>
      <header className="mine-home-header">
        <h1 className="m3-headline-medium">{t('tab_mine')}</h1>
        <p className="m3-body-medium">{t('mine_subtitle')}</p>
      </header>
      <section className="mine-home-stats" aria-label={t('mine_subtitle')}>
        <StatItem value={tables.length} label={t('mine_stat_tables')} onClick={onOpenAllTables} />
        <span className="mine-home-stat-divider" aria-hidden="true" />
        <StatItem value={courseCount} label={t('mine_stat_courses')} onClick={onOpenCourseList} />
        <span className="mine-home-stat-divider" aria-hidden="true" />
        <StatItem value={periodCount} label={t('mine_stat_period_tables')} onClick={onOpenPeriodTables} />
      </section>
      <h2 id="mine-schedule-heading" className="mine-home-section m3-title-small">{t('settings_schedule_management')}</h2>
      <div className="mine-home-group" role="group" aria-labelledby="mine-schedule-heading">
        <SettingsItem icon={<IconEdit size={20} />} label={t('all_tables')} onClick={onOpenAllTables} />
        <Divider />
        <SettingsItem icon={<IconSchedule size={20} />} label={t('mine_period_tables')} onClick={onOpenPeriodTables} />
        <Divider />
        <SettingsItem icon={<MineIcon name="DateRange" />} label={t('settings_holidays')} onClick={() => onOpenHoliday?.()} />
      </div>
      <h2 id="mine-application-heading" className="mine-home-section m3-title-small">{t('settings_application')}</h2>
      <div className="mine-home-group" role="group" aria-labelledby="mine-application-heading">
        <SettingsItem icon={<IconNotifications size={20} />} label={t('reminder_title')} onClick={onOpenReminder} />
        <Divider />
        <SettingsItem icon={<IconPalette size={20} />} label={t('mine_appearance')} onClick={onOpenAppearance} />
        <Divider />
        <SettingsItem icon={<IconTune size={20} />} label={t('mine_general')} onClick={onOpenGeneral} />
        <Divider />
        <SettingsItem icon={<MineIcon name="Widgets" />} label={t('mine_widget')} onClick={() => onOpenWidgets?.()} />
      </div>
      <h2 id="mine-data-heading" className="mine-home-section m3-title-small">{t('settings_data')}</h2>
      <div className="mine-home-group" role="group" aria-labelledby="mine-data-heading">
        <SettingsItem icon={<MineIcon name="SaveAlt" />} label={t('settings_backup')} onClick={() => onOpenBackup?.()} />
      </div>
      <div className="mine-home-group" role="group" aria-label={t('about_title')}>
        <SettingsItem icon={<IconInfo size={20} />} label={t('about_title')} onClick={onOpenAbout} highlighted={updateNoticeVisible} />
      </div>
    </div>
  )
}

function StatItem({ value, label, onClick }: { value: number; label: string; onClick: () => void }) {
  return <button type="button" className="mine-home-stat" data-glass-plain onClick={onClick}>
    <span className="mine-home-stat-value m3-headline-medium">{value}</span>
    <span className="mine-home-stat-label m3-label-small">{label}</span>
  </button>
}

function Divider() {
  return <div className="mine-home-divider" aria-hidden="true" />
}

function SettingsItem({ icon, label, onClick, highlighted = false }: { icon: ReactNode; label: string; onClick: () => void; highlighted?: boolean }) {
  return <button type="button" className="mine-home-item" data-glass-plain data-highlighted={highlighted || undefined} onClick={onClick}>
    <span className="mine-home-item-icon">{icon}</span>
    <span className="mine-home-item-label m3-body-large">{label}</span>
  </button>
}

// Google Material Outlined paths, Apache-2.0; local to this screen's Android icon mapping.
const MINE_ICONS = {
  DateRange: 'M7 11h2v2H7v-2zm14-5v14c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2l.01-14c0-1.1.88-2 1.99-2h1V2h2v2h8V2h2v2h1c1.1 0 2 .9 2 2zM5 8h14V6H5v2zm14 12V10H5v10h14zm-4-7h2v-2h-2v2zm-4 0h2v-2h-2v2z',
  Widgets: 'M16.66 4.52l2.83 2.83-2.83 2.83-2.83-2.83 2.83-2.83M9 5v4H5V5h4m10 10v4h-4v-4h4M9 15v4H5v-4h4m7.66-13.31L11 7.34 16.66 13l5.66-5.66-5.66-5.65zM11 3H3v8h8V3zm10 10h-8v8h8v-8zm-10 0H3v8h8v-8z',
  SaveAlt: 'M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z',
}
function MineIcon({ name }: { name: keyof typeof MINE_ICONS }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-icon={name}><path d={MINE_ICONS[name]} /></svg>
}
