/**
 * MineHome — 我的 tab 主页 (MineScreen.kt 1:1)。
 * Header + 统计卡 + 7 入口 + 刷新小组件按钮 (FilledTonalButton 48dp, MineScreen.kt:148)。
 * Web 无小组件 → 按钮形态保留 (Android 布局节奏), onClick 以 toast 说明;
 * 「管理桌面小组件」入口省略 (无小组件可管, 后续发布浏览器扩展时恢复)。
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { computeCurrentWeek } from '../ScheduleView'
import {
  IconEdit, IconShare, IconPalette, IconTune, IconInfo,
  IconNotifications, IconSchedule, IconRefresh,
} from '../../components/icons'
import type { Course } from '../../data/types'
import { HDiv } from './shared'
import { getCachedUpdate, maybeCheckOnStart } from '../../domain/update/updateChecker'
import pkg from '../../../package.json'

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
  const [toast, setToast] = useState('')
  // updateNoticeVisible — UpdateNotifier.noticeVisible 同构: 会话首查 + 缓存命中则
  // About 行 primary@10% 高亮 (SleepyNavHost.kt:124/301 → MineScreen highlighted)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    void maybeCheckOnStart(pkg.version).then(() => setRefresh((c) => c + 1))
  }, [])
  const updateNoticeVisible = getCachedUpdate() !== null
  void refresh
  const tables = useLiveQuery(() => db.timetables.toArray(), []) ?? []
  const defaultTable = useLiveQuery(() => db.timetables.where('isDefault').equals(1).first())
  const courses = useLiveQuery(
    async () =>
      defaultTable ? await db.courses.where('tableId').equals(defaultTable.id).toArray() : ([] as Course[]),
    [defaultTable?.id]
  )
  const currentWeek = computeCurrentWeek(defaultTable?.startDate ?? '', defaultTable?.maxWeek ?? 20)
  // mine_stat_courses: distinctBy courseName.ifBlank{"#groupId"} (MineScreen.kt, 与 CourseListScreen 同口径)
  const courseCount = useMemo(
    () => new Set((courses ?? []).map((c) => (c.courseName.trim() === '' ? `#${c.groupId}` : c.courseName))).size,
    [courses]
  )

  return (
    <div style={{ padding: 16, paddingBottom: 16 + navExtraBottom, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 className="m3-headline-medium" style={{ margin: '0 0 4px' }}>{t('tab_mine')}</h1>
      <p className="m3-body-medium" style={{ margin: '0 0 16px', color: 'var(--md-on-surface-variant)' }}>
        {t('mine_subtitle')}
      </p>

      {/* 统计卡 */}
      <div style={{ display: 'flex', padding: '18px 8px', justifyContent: 'space-evenly', alignItems: 'center', borderRadius: 16, background: 'var(--md-surface-container)' }}>
        {/* 可点统计格热区 — MineScreen.kt:189-199 clip(medium)+padding(h12,v4) */}
        <button type="button" onClick={onOpenAllTables} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', padding: '4px 12px', borderRadius: 12 }}><StatItem value={String(tables.length)} label={t('mine_stat_tables')} /></button>
        <VDivider />
        <button type="button" onClick={onOpenCourseList} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'inherit', padding: '4px 12px', borderRadius: 12 }}><StatItem value={String(courseCount)} label={t('mine_stat_courses')} /></button>
        <VDivider />
        <StatItem value={String(currentWeek)} label={t('mine_stat_week')} />
      </div>

      <div style={{ height: 16 }} />

      {/* 设置入口列表 — SettingsItem 序列 1:1 (MineScreen.kt:115-125) */}
      <div style={{ padding: 0, borderRadius: 16, overflow: 'hidden', background: 'var(--md-surface-container)' }}>
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
        <SettingsItem icon={<IconInfo size={20} />} label={t('about_title')} onClick={onOpenAbout} highlighted={updateNoticeVisible} />
      </div>

      {/* 动作区 — 刷新所有小组件 (MineScreen.kt:148-163 FilledTonalButton 1:1 形态:
          fillMaxWidth × regularHeight 48dp × secondaryContainer × Buttons.shape)。
          Web 无小组件通道 → onClick 以 toast 说明, 布局节奏与 Android 一致。 */}
      <div style={{ height: 16 }} />
      <button
        type="button"
        onClick={() => {
          setToast(t('web_widget_unavailable'))
          window.setTimeout(() => setToast(''), 3000)
        }}
        className="m3-label-large"
        style={{
          width: '100%', height: 48, borderRadius: 16, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
        }}
      >
        <IconRefresh size={18} />
        {t('mine_refresh_widgets')}
      </button>

      {toast !== '' && (
        <div
          role="status"
          className="m3-body-medium"
          style={{
            marginTop: 12, padding: '12px 16px', borderRadius: 12,
            background: 'var(--md-inverse-surface, var(--md-surface-container-highest))',
            color: 'var(--md-inverse-on-surface, var(--md-on-surface))',
          }}
        >
          {toast}
        </div>
      )}
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

function SettingsItem({ icon, label, onClick, highlighted = false }: { icon: React.ReactNode; label: string; onClick: () => void; highlighted?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer',
        background: highlighted ? 'color-mix(in srgb, var(--md-primary) 10%, transparent)' : 'transparent',
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
