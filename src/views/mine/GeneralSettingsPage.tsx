/**
 * GeneralSettingsPage — 通用设置 (GeneralSettingsScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 分组: ①课表显示 / ②小组件 / ③画面与导航 / ④语言 / ⑤实验室 / ⑥数据迁移。
 * 卡片均为 clip(shapes.large=16) + surfaceContainer; 折叠卡走共享 SettingsCard。
 * 平台差异: 「管理桌面小组件」入口 web 无小组件 → toast 说明; 选语言 Android recreate 重建
 * (语言卡 remember 态随之收起) → web 改语言后同步收起语言卡。
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { IconChevronRight, IconExpandMore } from '../../components/icons'
import { AlertDialog, TextButton } from '../../components/AlertDialog'
import { TimePickerField } from '../../components/DateTimePickers'
import type { Prefs } from '../../data/types'
import { exportBackup, importBackup, backupFileName, EXPORTABLE_MODULES } from '../../domain/migration/backupExecutor'
import {
  SettingsScaffold, SectionHeader, FlatCard, ToggleRow, HDiv, Switch, SettingsCard, DisplayModeOption, ExpandVisibility,
} from './shared'

const EXPANDED_KEY = 'sleepy_gss_expanded'
const TOAST_SHORT_MS = 2000
const TOAST_LONG_MS = 3500

const LANGUAGES: Array<[Prefs['lang'], string]> = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['es', 'Español'],
]

function readExpanded(): Set<string> {
  try {
    const raw = sessionStorage.getItem(EXPANDED_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function GeneralSettingsPage({ onBack, onOpenHoliday }: { onBack: () => void; onOpenHoliday: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  function showToast(msg: string, ms: number) {
    window.clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = window.setTimeout(() => setToast(''), ms)
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // 分组⑥ 数据迁移 (GeneralSettingsScreen.kt:155-246 1:1): 导出 = 组包直接下载,
  // 导入 = 文件 → 校验 → 覆盖/合并三键 AlertDialog。
  const importInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<Uint8Array | null>(null)
  const [busy, setBusy] = useState(false)

  async function onMigrationExport() {
    if (busy) return
    setBusy(true)
    try {
      const { bytes } = await exportBackup(EXPORTABLE_MODULES)
      const fileName = backupFileName()
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }))
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      showToast(t('settings_migration_export_ok'), TOAST_SHORT_MS)
    } catch {
      showToast(t('settings_migration_export_fail'), TOAST_LONG_MS)
    } finally {
      setBusy(false)
    }
  }

  function onMigrationFile(file: File) {
    file.arrayBuffer()
      // 先完整校验 (assemblePackage 在 importBackup 内), 坏包不落数据 → 弹三键确认
      .then((buf) => setPendingImport(new Uint8Array(buf)))
      .catch(() => showToast(t('settings_migration_import_fail'), TOAST_LONG_MS))
  }

  async function runMigrationImport(mode: 'OVERWRITE' | 'MERGE') {
    const bytes = pendingImport
    setPendingImport(null)
    if (!bytes) return
    setBusy(true)
    try {
      const report = await importBackup(bytes, mode)
      showToast(t('settings_migration_import_done', { v1: report.counts.timeTables, v2: report.counts.courses }), TOAST_LONG_MS)
    } catch {
      showToast(t('settings_migration_import_fail'), TOAST_LONG_MS)
    } finally {
      setBusy(false)
    }
  }

  // rememberSaveable(expandedSections) 同语义: 进节假日二级页再返回、刷新页面均保留;
  // 出栈 (返回「我的」) 即丢弃 — Navigation3 条目出栈清其 saveable 态
  const [expanded, setExpanded] = useState<Set<string>>(readExpanded)
  const keepExpandedRef = useRef(false)
  const toggleSection = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  useEffect(() => {
    try { sessionStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])) }
    catch { /* 隐私/配额失败忽略 */ }
  }, [expanded])
  useEffect(() => () => {
    if (keepExpandedRef.current) return
    try { sessionStorage.removeItem(EXPANDED_KEY) }
    catch { /* 同上 */ }
  }, [])

  function setVisibleDay(day: number, on: boolean) {
    const rest = prefs.visibleDays.filter((d) => d !== day)
    const next = on ? [...rest, day].sort((a, b) => a - b) : rest
    if (next.length > 0) void update({ visibleDays: next })
  }
  const dayNames = t('@day_names', { returnObjects: true }) as string[]

  return (
    <SettingsScaffold title={t('mine_general')} onBack={onBack}>
      {/* ── 分组① 课表显示 (2026-09-21 改名: 与③「画面与导航」拉开边界) ── */}
      <SectionHeader title={t('appearance_section_schedule_display')} />

      <FlatCard
        title={t('settings_display_mode')}
        options={[t('settings_display_node'), t('settings_display_time')]}
        selectedKey={prefs.displayMode === 'node' ? 0 : 1}
        onSelect={(i) => void update({ displayMode: i === 0 ? 'node' : 'time' })}
      />

      <FlatCard
        title={t('settings_grid_sub_info')}
        options={[t('settings_grid_sub_room'), t('settings_grid_sub_teacher'), t('settings_grid_sub_none')]}
        selectedKey={prefs.gridSubInfo === 'room' ? 0 : prefs.gridSubInfo === 'teacher' ? 1 : 2}
        onSelect={(i) => void update({ gridSubInfo: i === 0 ? 'room' : i === 1 ? 'teacher' : 'none' })}
      />

      <SettingsCard title={t('settings_pill')} expanded={expanded.has('gridScale')} onToggle={() => toggleSection('gridScale')}>
        <HDiv />
        <ToggleRow
          label={t('settings_week_two_column')}
          checked={prefs.weekTwoColumn}
          onChange={(v) => void update({ weekTwoColumn: v })}
        />
        {prefs.weekTwoColumn && (
          <>
            <HDiv />
            <DisplayModeOption
              label={t('settings_week_two_column_days')}
              selected={prefs.weekTwoColumnMode === 'days'}
              onClick={() => void update({ weekTwoColumnMode: 'days' })}
            />
            <HDiv />
            <DisplayModeOption
              label={t('settings_week_two_column_balance')}
              selected={prefs.weekTwoColumnMode === 'balance'}
              onClick={() => void update({ weekTwoColumnMode: 'balance' })}
            />
          </>
        )}
        <HDiv />
        <ToggleRow
          label={t('settings_week_hide_empty')}
          checked={prefs.weekHideEmptyDays}
          onChange={(v) => void update({ weekHideEmptyDays: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_week_alias')}
          checked={prefs.weekUseAlias}
          onChange={(v) => void update({ weekUseAlias: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_grid_alias')}
          checked={prefs.gridUseAlias}
          onChange={(v) => void update({ gridUseAlias: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_show_date')}
          checked={prefs.showDate}
          onChange={(v) => void update({ showDate: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_show_view_switcher')}
          checked={prefs.showViewSwitcher}
          onChange={(v) => void update({ showViewSwitcher: v })}
        />
      </SettingsCard>

      <SettingsCard title={t('settings_visible_days')} expanded={expanded.has('visibleDays')} onToggle={() => toggleSection('visibleDays')}>
        <div className="m3-body-small" style={{ paddingBottom: 8, color: 'var(--md-on-surface-variant)' }}>{t('settings_visible_days_sub')}</div>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const checked = prefs.visibleDays.includes(day)
          return (
            <div key={day}>
              <div
                onClick={() => setVisibleDay(day, !checked)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', cursor: 'pointer' }}
              >
                <span className="m3-body-large" style={{ color: 'var(--md-on-surface)' }}>{dayNames[day - 1] ?? ''}</span>
                {/* 点击冒泡到行 → 行内统一取反, 开关自身不重复写 */}
                <Switch checked={checked} onChange={() => {}} />
              </div>
              {day !== 7 && <HDiv />}
            </div>
          )
        })}
      </SettingsCard>

      <SingleToggleCard
        title={t('settings_course_colorless')}
        checked={prefs.courseColorless}
        onChange={(v) => void update({ courseColorless: v })}
      />

      <EntryRow
        title={t('settings_holiday_title')}
        onClick={() => {
          keepExpandedRef.current = true
          onOpenHoliday()
        }}
      />

      <HDiv />

      {/* ── 分组② 小组件 ── */}
      <SectionHeader title={t('appearance_section_widget')} />

      <SettingsCard title={t('settings_widget')} expanded={expanded.has('widget')} onToggle={() => toggleSection('widget')}>
        <ToggleRow
          label={t('settings_widget_colorless')}
          subtitle={t('settings_widget_colorless_sub')}
          checked={prefs.widgetColorless}
          onChange={(v) => void update({ widgetColorless: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_widget_separator')}
          subtitle={t('settings_widget_separator_sub')}
          checked={prefs.widgetSeparator}
          onChange={(v) => void update({ widgetSeparator: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_nearest_busy_day')}
          subtitle={t('settings_nearest_busy_day_sub')}
          checked={prefs.nearestBusyDay}
          onChange={(v) => void update({ nearestBusyDay: v })}
        />
      </SettingsCard>

      <EntryRow title={t('widget_manage_entry')} onClick={() => showToast(t('web_widget_unavailable'), TOAST_LONG_MS)} />

      <HDiv />

      {/* ── 分组③ 画面与导航 ── */}
      <SectionHeader title={t('settings_section_display_navigation')} />

      <FlatCard
        title={t('settings_start_view')}
        options={[t('settings_start_view_full'), t('settings_start_view_cards')]}
        selectedKey={prefs.startView === 'full' ? 0 : 1}
        onSelect={(i) => void update({ startView: i === 0 ? 'full' : 'cards' })}
      />

      {/* web no-op: 浏览器刷新率由系统/显示器控制, 无等价 API — 保留 1:1 形态 */}
      <SingleToggleCard
        title={t('settings_high_refresh')}
        checked={prefs.highRefresh}
        onChange={(v) => void update({ highRefresh: v })}
      />

      <FlatCard
        title={t('settings_nav_style')}
        options={[t('settings_nav_style_docked'), t('settings_nav_style_floating')]}
        selectedKey={prefs.navDock ? 1 : 0}
        onSelect={(i) => void update({ navDock: i === 1 })}
      />

      <HDiv />

      {/* ── 分组④ 语言 ── */}
      <SectionHeader title={t('settings_language')} />

      <LanguageCard lang={prefs.lang} onChange={(code) => void update({ lang: code })} />

      <HDiv />

      {/* ── 分组⑤ 实验室 ── */}
      <SectionHeader title={t('settings_lab')} />
      <div className="m3-label-small" style={{ paddingBottom: 8, color: 'var(--md-on-surface-variant)' }}>
        {t('settings_lab_sub')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 16px', borderRadius: 16, background: 'var(--md-surface-container)' }}>
        <ToggleRow
          label={t('settings_grid_adaptive_height')}
          subtitle={t('settings_grid_adaptive_height_sub')}
          checked={prefs.gridAdaptiveHeight}
          onChange={(v) => void update({ gridAdaptiveHeight: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_grid_pinch_zoom')}
          subtitle={t('settings_grid_pinch_zoom_sub')}
          checked={prefs.gridPinchZoom}
          onChange={(v) => void update({ gridPinchZoom: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_grid_auto_hide_evening')}
          subtitle={t('settings_grid_auto_hide_evening_sub')}
          checked={prefs.gridAutoHideEmptyEvening}
          onChange={(v) => void update({ gridAutoHideEmptyEvening: v })}
        />
        {prefs.gridAutoHideEmptyEvening && (
          <>
            <HDiv />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
              <span className="m3-body-large" style={{ flex: 1, color: 'var(--md-on-surface)' }}>{t('settings_grid_evening_start')}</span>
              <TimePickerField
                value={prefs.gridEveningStart}
                onValueChange={(v) => void update({ gridEveningStart: v })}
                label=""
                style={{ width: 150, flexShrink: 0 }}
              />
            </div>
          </>
        )}
        <HDiv />
        <ToggleRow
          label={t('settings_vert_punct')}
          subtitle={t('settings_vert_punct_sub')}
          checked={prefs.vertPunct}
          onChange={(v) => void update({ vertPunct: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_grid_show_separators')}
          subtitle={t('settings_grid_show_separators_sub')}
          checked={prefs.gridShowSeparators}
          onChange={(v) => void update({ gridShowSeparators: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_grid_long_break_spacing')}
          subtitle={t('settings_grid_long_break_spacing_sub')}
          checked={prefs.gridLongBreakSpacing}
          onChange={(v) => void update({ gridLongBreakSpacing: v })}
        />
      </div>

      <HDiv />

      {/* ── 分组⑥ 数据迁移 ── */}
      <SectionHeader title={t('settings_migration')} />
      <div className="m3-label-small" style={{ paddingBottom: 8, color: 'var(--md-on-surface-variant)' }}>
        {t('settings_migration_sub')}
      </div>
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--md-surface-container)' }}>
        <MigrationRow
          title={t('settings_migration_export')}
          subtitle={t('settings_migration_export_sub')}
          busy={busy}
          onClick={() => { void onMigrationExport() }}
        />
        <HDiv />
        <MigrationRow
          title={t('settings_migration_import')}
          subtitle={t('settings_migration_import_sub')}
          busy={busy}
          onClick={() => { if (!busy) importInputRef.current?.click() }}
        />
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept=".sleepybackup,application/zip,application/octet-stream"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onMigrationFile(f)
          e.target.value = ''
        }}
      />

      {pendingImport && (
        <AlertDialog
          title={t('settings_migration_import_dialog_title')}
          onDismiss={() => setPendingImport(null)}
          buttons={
            <>
              <TextButton label={t('cancel')} onClick={() => setPendingImport(null)} />
              <span style={{ display: 'flex' }}>
                <TextButton label={t('settings_migration_import_overwrite')} onClick={() => { void runMigrationImport('OVERWRITE') }} />
                <TextButton label={t('settings_migration_import_merge')} onClick={() => { void runMigrationImport('MERGE') }} />
              </span>
            </>
          }
        >
          {t('settings_migration_import_dialog_text')}
        </AlertDialog>
      )}

      {toast !== '' && (
        <div
          role="status"
          className="m3-body-medium"
          style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, maxWidth: 'calc(100vw - 32px)', padding: '10px 16px', borderRadius: 8,
            background: 'var(--md-inverse-surface, var(--md-surface-container-highest))',
            color: 'var(--md-inverse-on-surface, var(--md-on-surface))',
          }}
        >
          {toast}
        </div>
      )}
    </SettingsScaffold>
  )
}

/** 语言卡 — 折叠头只显当前语言值 (titleMedium SemiBold) + ExpandMore 24 (旋转无动画) */
function LanguageCard({ lang, onChange }: { lang: Prefs['lang']; onChange: (code: Prefs['lang']) => void }) {
  const [expanded, setExpanded] = useState(false)
  // 选语言 = Android recreate: 卡片以收起态重建, 无退出动画
  const [generation, setGeneration] = useState(0)
  const currentLabel = LANGUAGES.find(([code]) => code === lang)?.[1] ?? lang
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--md-surface-container)' }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        style={{ display: 'flex', alignItems: 'center', padding: 16, cursor: 'pointer' }}
      >
        <span className="m3-title-medium" style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--md-on-surface)' }}>
          {currentLabel}
        </span>
        <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)', transform: expanded ? 'rotate(180deg)' : undefined }}>
          <IconExpandMore size={24} />
        </span>
      </div>
      <ExpandVisibility key={generation} visible={expanded}>
        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 16px 16px' }}>
          {LANGUAGES.map(([code, label], i) => (
            <Fragment key={code}>
              <DisplayModeOption
                label={label}
                selected={lang === code}
                onClick={() => {
                  onChange(code)
                  setExpanded(false)
                  setGeneration((g) => g + 1)
                }}
              />
              {i < LANGUAGES.length - 1 && <HDiv />}
            </Fragment>
          ))}
        </div>
      </ExpandVisibility>
    </div>
  )
}

/** 单行开关卡 — Switch heightIn(max=32) 锁回本体高, 与折叠卡收起态等高 */
function SingleToggleCard({ title, checked, onChange }: { title: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'var(--md-surface-container)' }}>
      <span className="m3-title-small" style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</span>
      <Switch checked={checked} onChange={onChange} compact />
    </div>
  )
}

/** 二级页入口行 — 仅标题 titleSmall + ChevronRight 20 */
function EntryRow({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
        background: 'var(--md-surface-container)', color: 'var(--md-on-surface)',
      }}
    >
      <span className="m3-title-small" style={{ flex: 1, minWidth: 0 }}>{title}</span>
      <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)' }}>
        <IconChevronRight size={20} />
      </span>
    </div>
  )
}

function MigrationRow({ title, subtitle, busy, onClick }: { title: string; subtitle: string; busy: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', padding: 16, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-title-medium" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
      </div>
      <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)' }}>
        <IconChevronRight size={24} />
      </span>
    </div>
  )
}
