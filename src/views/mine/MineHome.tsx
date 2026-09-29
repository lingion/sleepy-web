/**
 * MineHome — 我的 tab 主页 (MineScreen.kt 1:1)。
 * Header + 统计卡 + 6 入口 + 刷新小组件按钮。从 MineView.tsx 拆出。
 * Web 无小组件 → refreshWidgets 动作与 widget 分组保留开关本体, 「管理桌面小组件」入口
 * 与「刷新小组件」按钮省略(无小组件可管, 后续发布浏览器扩展时恢复)。
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { computeCurrentWeek } from '../ScheduleView'
import {
  IconEdit, IconShare, IconPalette, IconTune, IconInfo,
  IconNotifications, IconSchedule,
} from '../../components/icons'
import type { Course } from '../../data/types'
import { HDiv } from './shared'

export function MineHome({
  navExtraBottom = 0,
  onOpenGeneral,
  onOpenAppearance,
  onOpenExport,
  onOpenAllTables,
  onOpenPeriodTables,
  onOpenAbout,
  onOpenReminder,
  onOpenCourseList,
}: {
  navExtraBottom?: number
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
  const tables = useLiveQuery(() => db.timetables.toArray(), []) ?? []
  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const courses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id]
  )
  const currentWeek = computeCurrentWeek(defaultTable?.startDate ?? '', defaultTable?.maxWeek ?? 20)
  // mine_stat_courses: distinctBy courseName (MineScreen.kt L102)
  const courseCount = useMemo(
    () => new Set((courses ?? []).map((c) => c.courseName)).size,
    [courses]
  )

  return (
    <div style={{ padding: 16, paddingBottom: 16 + navExtraBottom, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 className="m3-headline-medium" style={{ margin: '0 0 4px' }}>{t('tab_mine')}</h1>
      <p className="m3-body-medium" style={{ margin: '0 0 16px', color: 'var(--md-on-surface-variant)' }}>
        {t('mine_subtitle')}
      </p>

      {/* 统计卡 */}
      <div className="m3-card" style={{ display: 'flex', padding: '18px 8px', justifyContent: 'space-evenly', alignItems: 'center' }}>
        <button type="button" onClick={onOpenAllTables} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit' }}><StatItem value={String(tables.length)} label={t('mine_stat_tables')} /></button>
        <VDivider />
        <button type="button" onClick={onOpenCourseList} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit' }}><StatItem value={String(courseCount)} label={t('mine_stat_courses')} /></button>
        <VDivider />
        <StatItem value={String(currentWeek)} label={t('mine_stat_week')} />
      </div>

      <div style={{ height: 16 }} />

      {/* 设置入口列表 — SettingsItem 序列 1:1 (MineScreen.kt:115-125) */}
      <div className="m3-card" style={{ padding: 0 }}>
        <SettingsItem icon={<IconEdit size={20} />} label={t('all_tables')} onClick={onOpenAllTables} />
        <HDiv inset={72} />
        {/* issue#40: 时间节次表入口 — 与课表管理并列 (MineScreen.kt:119 SettingsItem 同位) */}
        <SettingsItem icon={<IconSchedule size={20} />} label={t('mine_period_tables')} onClick={onOpenPeriodTables} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconShare size={20} />} label={t('mine_export')} onClick={onOpenExport} />
        <HDiv inset={72} />
        {/* 提醒 — web 无系统通知通道, 入口保留接通 to-do 占位页 */}
        <SettingsItem icon={<IconNotifications size={20} />} label={t('reminder_title')} onClick={onOpenReminder} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconPalette size={20} />} label={t('mine_appearance')} onClick={onOpenAppearance} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconTune size={20} />} label={t('mine_general')} onClick={onOpenGeneral} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconInfo size={20} />} label={t('about_title')} onClick={onOpenAbout} />
      </div>

      <div className="m3-card" style={{ padding: 16, color: 'var(--md-on-surface-variant)' }}>
        <div className="m3-title-small">{t('settings_widget', '小组件')}</div>
        <div className="m3-body-small" style={{ marginTop: 6 }}>{t('web_widget_unavailable', 'Web 不提供 Android 桌面小组件；课表数据会在本页面实时更新。')}</div>
      </div>
    </div>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="m3-headline-medium" style={{ fontWeight: 700, color: 'var(--md-primary)' }}>{value}</div>
      <div className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</div>
    </div>
  )
}

function VDivider() {
  return <div style={{ height: 36, width: 1, background: 'color-mix(in srgb, var(--md-outline) 30%, transparent)' }} />
}

function SettingsItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 40, height: 40, borderRadius: 12, background: 'var(--md-primary-container)',
          color: 'var(--md-on-primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <span className="m3-body-large" style={{ marginLeft: 16 }}>{label}</span>
    </div>
  )
}
