/**
 * MineView — 我的 tab: MineScreen.kt + GeneralSettingsScreen.kt + AppearanceScreen.kt 1:1
 * 主页 = Header + 统计卡 + 6 入口 + 刷新小组件按钮;
 * 二级页 = 通用(课程显示/小组件/画面/语言) + 外观(主题色彩/外观模式)。
 * Web 无小组件 → refreshWidgets 动作与 widget 分组保留开关本体(widgetSeparator/colorless/vertPunct),
 * 「管理桌面小组件」入口与「刷新小组件」按钮省略(无小组件可管, 后续发布浏览器扩展时恢复)。
 *
 * 通用设置页对齐备注 (GeneralSettingsScreen.kt):
 * - 节假日课程灰显入口行已接导航(page='holiday'); HolidayPage 本体(年份/数据源/灰显规则/区段编辑)
 *   属灰显规则域 1:1 另立任务, 此处先落同构顶栏骨架。
 * - 本页卡片(FoldCard/FlatCard/SingleToggleCard/语言卡)在组件 style 覆盖 .m3-card 默认 →
 *   surface-container + 16px 圆角 (SettingsCards.kt L71/L117 = surfaceContainer + shapes.large 16dp);
 *   禁改共享 global.css, 故覆盖落在组件层, 其余页卡片不受影响。
 * - FoldCard 折叠触发: Android SettingsCard 整卡可点折叠(展开态点内容空白区也收起);
 *   web 维持仅标题行可点(web 惯例, 误触折叠更少) — 有意取舍非遗漏。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'
import { computeCurrentWeek } from './ScheduleView'
import { localizedDay } from '../components/schedule/CardsGridView'
import { THEME_PRESETS } from '../theme/themes'
import { ExportView } from './ExportView'
import {IconEdit, IconShare, IconPalette, IconTune, IconInfo, IconAutoAwesome,
  IconCheck, IconCheckCircle, IconContentCopy, IconAdd,
  IconCalendarMonth, IconSettings,
  IconArrowBack, IconChevronRight, IconExpandLess, IconExpandMore,
} from '../components/icons'
import { duplicateTable, setDefault, insertTable } from '../data/repository'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import { EditTableView } from './EditTableView'
import type { Course, Prefs, Table } from '../data/types'

type Page = 'main' | 'general' | 'appearance' | 'holiday' | 'export' | 'alltables' | 'about'

export function MineView() {
  const [page, setPage] = useState<Page>('main')

  switch (page) {
    case 'general':
      return <GeneralSettingsPage onBack={() => setPage('main')} onOpenHoliday={() => setPage('holiday')} />
    case 'holiday':
      // HolidaySettingsScreen 的 back 回通用设置页(GSS 的二级页), 非回主页
      return <HolidayPage onBack={() => setPage('general')} />
    case 'appearance':
      return <AppearancePage onBack={() => setPage('main')} />
    case 'export':
      return <ExportView onBack={() => setPage('main')} />
    case 'alltables':
      return <AllTablesPage onBack={() => setPage('main')} />
    case 'about':
      return <AboutPage onBack={() => setPage('main')} />
    default:
      return (
        <MineMainPage
          onOpenGeneral={() => setPage('general')}
          onOpenAppearance={() => setPage('appearance')}
          onOpenExport={() => setPage('export')}
          onOpenAllTables={() => setPage('alltables')}
          onOpenAbout={() => setPage('about')}
        />
      )
  }
}

// ── 主页 — MineScreen.kt ────────────────────────────────────────────────

function MineMainPage({
  onOpenGeneral,
  onOpenAppearance,
  onOpenExport,
  onOpenAllTables,
  onOpenAbout,
}: {
  onOpenGeneral: () => void
  onOpenAppearance: () => void
  onOpenExport: () => void
  onOpenAllTables: () => void
  onOpenAbout: () => void
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
    <div style={{ padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 className="m3-headline-medium" style={{ margin: '0 0 4px' }}>{t('tab_mine')}</h1>
      <p className="m3-body-medium" style={{ margin: '0 0 16px', color: 'var(--md-on-surface-variant)' }}>
        {t('mine_subtitle')}
      </p>

      {/* 统计卡 */}
      <div className="m3-card" style={{ display: 'flex', padding: '18px 8px', justifyContent: 'space-evenly', alignItems: 'center' }}>
        <StatItem value={String(tables.length)} label={t('mine_stat_tables')} />
        <VDivider />
        <StatItem value={String(courseCount)} label={t('mine_stat_courses')} />
        <VDivider />
        <StatItem value={String(currentWeek)} label={t('mine_stat_week')} />
      </div>

      <div style={{ height: 16 }} />

      {/* 设置入口列表 — SettingsItem 序列 1:1 */}
      <div className="m3-card" style={{ padding: 0 }}>
        <SettingsItem icon={<IconEdit size={20} />} label={t('all_tables')} onClick={onOpenAllTables} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconShare size={20} />} label={t('mine_export')} onClick={onOpenExport} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconPalette size={20} />} label={t('mine_appearance')} onClick={onOpenAppearance} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconTune size={20} />} label={t('mine_general')} onClick={onOpenGeneral} />
        <HDiv inset={72} />
        <SettingsItem icon={<IconInfo size={20} />} label={t('about_title')} onClick={onOpenAbout} />
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

// ── 通用设置 — GeneralSettingsScreen.kt ────────────────────────────────

function GeneralSettingsPage({ onBack, onOpenHoliday }: { onBack: () => void; onOpenHoliday: () => void }) {
  const { t, i18n } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  // 折叠卡展开态跨页保真 — 局部 useState 离页即丢, 提升到页级 (audit 偏好默认值 low)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (title: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  const languages: Array<[Prefs['lang'], string]> = [
    ['zh-CN', '简体中文'],
    ['zh-TW', '繁體中文'],
    ['en', 'English'],
    ['ja', '日本語'],
    ['es', 'Español'],
  ]

  return (
    <SettingsScaffold title={t('mine_general')} onBack={onBack}>
      {/* ── 分组① 课程显示 ── */}
      <SectionHeader title={t('appearance_section_display')} />

      {/* 课程时间显示: 节次/时间 — 标题行右侧 tab 切换 */}
      <FlatCard
        title={t('settings_display_mode')}
        options={[t('settings_display_node'), t('settings_display_time')]}
        selectedKey={prefs.displayMode === 'node' ? 0 : 1}
        onSelect={(i) => void update({ displayMode: i === 0 ? 'node' : 'time' })}
      />

      {/* 网格卡片副信息: 教室/教师/无 */}
      <FlatCard
        title={t('settings_grid_sub_info')}
        options={[t('settings_grid_sub_room'), t('settings_grid_sub_teacher'), t('settings_grid_sub_none')]}
        selectedKey={prefs.gridSubInfo === 'room' ? 0 : prefs.gridSubInfo === 'teacher' ? 1 : 2}
        onSelect={(i) => void update({ gridSubInfo: (['room', 'teacher', 'none'] as const)[i] })}
      />

      {/* 主页显示(issue#8): 缩放/圆角/两栏/别名/表头日期 */}
      <FoldCard title={t('settings_pill')} expanded={expanded.has('settings_pill')} onToggle={() => toggleExpanded('settings_pill')}>
        <SliderRow
          label={t('settings_pill_scale')}
          value={prefs.gridScale}
          min={0.7} max={1.3}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => void update({ gridScale: v })}
        />
        <HDiv />
        <SliderRow
          label={t('settings_pill_week_scale')}
          value={prefs.weekScale}
          min={0.7} max={1.3}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => void update({ weekScale: v })}
        />
        <HDiv />
        <SliderRow
          label={t('settings_pill_corner')}
          value={prefs.gridCornerRatio}
          min={0} max={2}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => void update({ gridCornerRatio: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_week_two_column')}
          checked={prefs.weekTwoColumn}
          onChange={(v) => void update({ weekTwoColumn: v })}
        />
        {prefs.weekTwoColumn && (
          <>
            <HDiv />
            <OptionRow
              label={t('settings_week_two_column_days')}
              subtitle=""
              selected={prefs.weekTwoColumnMode === 'days'}
              onClick={() => void update({ weekTwoColumnMode: 'days' })}
            />
            <HDiv />
            <OptionRow
              label={t('settings_week_two_column_balance')}
              subtitle=""
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
      </FoldCard>

      {/* 冲突课程样式: 叠层/折角/竖轨 + 各自专属滑杆 */}
      <FoldCard title={t('settings_conflict_style')} expanded={expanded.has('settings_conflict_style')} onToggle={() => toggleExpanded('settings_conflict_style')}>
        <OptionRow
          label={t('settings_conflict_stack')}
          subtitle={t('settings_conflict_stack_sub')}
          selected={prefs.conflictStyle === 'stack'}
          onClick={() => void update({ conflictStyle: 'stack' })}
        />
        <HDiv />
        <OptionRow
          label={t('settings_conflict_fold')}
          subtitle={t('settings_conflict_fold_sub')}
          selected={prefs.conflictStyle === 'fold'}
          onClick={() => void update({ conflictStyle: 'fold' })}
        />
        <HDiv />
        <OptionRow
          label={t('settings_conflict_rail')}
          subtitle={t('settings_conflict_rail_sub')}
          selected={prefs.conflictStyle === 'rail'}
          onClick={() => void update({ conflictStyle: 'rail' })}
        />
        {prefs.conflictStyle === 'fold' && (
          <>
            <HDiv />
            <SliderRow
              label={t('settings_conflict_fold_size')}
              value={prefs.conflictFoldSize}
              min={8} max={28} step={1}
              format={(v) => `${Math.round(v)}dp`}
              onChange={(v) => void update({ conflictFoldSize: v })}
            />
          </>
        )}
        {prefs.conflictStyle === 'stack' && (
          <>
            <HDiv />
            <SliderRow
              label={t('settings_conflict_stack_inset')}
              value={prefs.conflictStackInset}
              min={4} max={20} step={1}
              format={(v) => `${Math.round(v)}dp`}
              onChange={(v) => void update({ conflictStackInset: v })}
            />
          </>
        )}
        {prefs.conflictStyle === 'rail' && (
          <>
            <HDiv />
            <SliderRow
              label={t('settings_conflict_rail_inset')}
              value={prefs.conflictRailInset}
              min={4} max={20} step={1}
              format={(v) => `${Math.round(v)}dp`}
              onChange={(v) => void update({ conflictRailInset: v })}
            />
          </>
        )}
      </FoldCard>

      {/* 显示星期: 周一~周日多选, 禁止全取消(GeneralSettingsScreen L437) */}
      <FoldCard title={t('settings_visible_days')} expanded={expanded.has('settings_visible_days')} onToggle={() => toggleExpanded('settings_visible_days')}>
        <p className="m3-body-small" style={{ margin: '0 0 8px', color: 'var(--md-on-surface-variant)' }}>
          {t('settings_visible_days_sub')}
        </p>
        {DAYS.map((day) => {
          const checked = prefs.visibleDays.includes(day)
          const toggle = (on: boolean) => {
            const n = on ? [...prefs.visibleDays, day] : prefs.visibleDays.filter((d) => d !== day)
            if (n.length > 0) void update({ visibleDays: n.sort((a, b) => a - b) })
          }
          return (
            <div key={day}>
              <ToggleRow label={localizedDay(day, i18n.language)} checked={checked} onChange={toggle} />
              {day !== 7 && <HDiv />}
            </div>
          )
        })}
      </FoldCard>

      {/* 启动默认页: 周视图/网格 */}
      <FlatCard
        title={t('settings_start_view')}
        options={[t('settings_start_view_full'), t('settings_start_view_cards')]}
        selectedKey={prefs.startView === 'full' ? 0 : 1}
        onSelect={(i) => void update({ startView: i === 0 ? 'full' : 'cards' })}
      />

      {/* 课程胶囊统一底色: 单开关卡 */}
      <SingleToggleCard
        title={t('settings_course_colorless')}
        checked={prefs.courseColorless}
        onChange={(v) => void update({ courseColorless: v })}
      />

      {/* 节假日课程灰显: 入口行 → 二级页 (GSS L496-522; HolidayPage 本体按 HolidaySettingsScreen.kt) */}
      <div
        onClick={onOpenHoliday}
        className="m3-card"
        style={{
          background: 'var(--md-surface-container)', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer',
        }}
      >
        <span className="m3-title-small">{t('settings_holiday_title')}</span>
        <span style={{ color: 'var(--md-on-surface-variant)', display: 'inline-flex' }}>
          <IconChevronRight size={20} />
        </span>
      </div>

      <HDiv />

      {/* ── 分组② 小组件 ── */}
      <SectionHeader title={t('appearance_section_widget')} />

      <FoldCard title={t('settings_widget')} expanded={expanded.has('settings_widget')} onToggle={() => toggleExpanded('settings_widget')}>
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
          label={t('settings_vert_punct')}
          subtitle={t('settings_vert_punct_sub')}
          checked={prefs.vertPunct}
          onChange={(v) => void update({ vertPunct: v })}
        />
      </FoldCard>

      <HDiv />

      {/* ── 分组③ 画面 ── */}
      <SectionHeader title={t('settings_section_display')} />

      {/* web no-op: 浏览器刷新率由系统/显示器控制, 无等价 API — 保留 1:1 形态, 防误判漏接 */}
      <SingleToggleCard
        title={t('settings_high_refresh')}
        checked={prefs.highRefresh}
        onChange={(v) => void update({ highRefresh: v })}
      />

      {/* 底栏样式: 贴底/悬浮 */}
      <FlatCard
        title={t('settings_nav_style')}
        options={[t('settings_nav_style_docked'), t('settings_nav_style_floating')]}
        selectedKey={prefs.navDock ? 1 : 0}
        onSelect={(i) => void update({ navDock: i === 1 })}
      />

      <HDiv />

      {/* ── 分组④ 语言 ── */}
      <SectionHeader title={t('settings_language')} />

      <div className="m3-card" style={{ padding: 16 }}>
        {languages.map(([code, label], i) => (
          <div key={code}>
            <div
              onClick={() => void update({ lang: code })}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 4px', cursor: 'pointer',
              }}
            >
              <span className="m3-body-large" style={{ color: prefs.lang === code ? 'var(--md-primary)' : 'var(--md-on-surface)' }}>
                {label}
              </span>
              {prefs.lang === code && <CheckIcon />}
            </div>
            {i < languages.length - 1 && <HDiv />}
          </div>
        ))}
      </div>
    </SettingsScaffold>
  )
}

// ── 外观 — AppearanceScreen.kt ─────────────────────────────────────────

function AppearancePage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  const isDark = document.documentElement.dataset.mode === 'dark'

  const modes: Array<[Prefs['themeMode'], string]> = [
    ['system', t('theme_mode_system')],
    ['light', t('theme_mode_light')],
    ['dark', t('theme_mode_dark')],
  ]

  return (
    <SettingsScaffold title={t('mine_appearance')} onBack={onBack}>
      <SectionHeader title={t('appearance_section_theme')} />

      {/* 跟随系统卡 (SystemThemeCard) — 独立语义 KEY_SYSTEM, 不落 default 预设;
          web 无壁纸取色, applyTheme('system') 回落默认色板 = Android Material You 平台最近等价 */}
      <div
        onClick={() => void update({ theme: 'system' as Prefs['theme'] })}
        className="m3-card"
        style={{
          borderRadius: 16,
          background: (prefs.theme as string) === 'system' ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
          display: 'flex', alignItems: 'center', gap: 16, padding: 16, cursor: 'pointer',
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: 'var(--md-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          color: 'var(--md-on-primary-container)', flexShrink: 0,
        }}><IconAutoAwesome size={28} /></div>
        <div style={{ flex: 1 }}>
          <div className="m3-title-medium">{t('theme_system')}</div>
          <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-on-surface-variant)' }}>{t('theme_system_desc')}</div>
        </div>
        {(prefs.theme as string) === 'system' && <CheckIcon size={24} />}
      </div>

      {/* 2 列网格 — 5 预设卡(default 淡紫 + spring/ocean/peach/slate, AppearanceScreen.kt:132-137)
          自定义卡与加号尾位卡省略: CustomSchemeDeriver/customSchemeDeriver.ts + CustomThemeEditor
          属 src/theme/ 与 prefsStore 配套改动, 跨出本分区文件边界, 待对应区 agent 移植后补齐 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {Object.values(THEME_PRESETS).map((preset) => {
          const selected = prefs.theme === preset.key
          const scheme = isDark ? preset.dark : preset.light
          return (
            <div
              key={preset.key}
              onClick={() => void update({ theme: preset.key as Prefs['theme'] })}
              className="m3-card"
              style={{
                flex: '1 1 calc(50% - 6px)',
                boxSizing: 'border-box',
                borderRadius: 16,
                background: selected ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
                padding: 16, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <Swatch color={scheme.primary} />
                <Swatch color={scheme.secondary} />
                <Swatch color={scheme.tertiary} />
              </div>
              <div style={{ height: 12 }} />
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="m3-title-small" style={{ flex: 1 }}>{t(`theme_name_${preset.key}`)}</span>
                {selected && <CheckIcon size={20} />}
              </div>
            </div>
          )
        })}
      </div>

      {/* 外观模式三态分段 — clip(shapes.medium)=12dp 外层 */}
      <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('theme_appearance')}</div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--md-surface-container)' }}>
        {modes.map(([mode, label]) => {
          const sel = mode === prefs.themeMode
          return (
            <div
              key={mode}
              onClick={() => void update({ themeMode: mode })}
              style={{
                flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 9,
                background: sel ? 'var(--md-primary)' : 'transparent',
                color: sel ? 'var(--md-on-primary)' : 'var(--md-on-surface-variant)',
                fontWeight: sel ? 600 : 500,
                cursor: 'pointer',
              }}
              className="m3-label-large"
            >
              {label}
            </div>
          )
        })}
      </div>
    </SettingsScaffold>
  )
}

function Swatch({ color }: { color: string }) {
  return <div style={{ width: 28, height: 28, borderRadius: 8, background: color }} />
}

// ── 全部课表 — AllTablesScreen.kt 1:1 ───────────────────────────────────

function AllTablesPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const selectedId = useLiveQuery(async () => (await db.timetables.where('isDefault').equals(1).first())?.id)
  const [editingId, setEditingId] = useState<number | null>(null)

  if (editingId !== null) {
    return (
      <EditTableView
        tableId={editingId}
        onBack={() => setEditingId(null)}
        onSaved={() => setEditingId(null)}
        onDeleted={() => setEditingId(null)}
      />
    )
  }

  return (
    <SettingsScaffold title={t('all_tables')} onBack={onBack}>
      {tables.map((tb: Table) => {
        const isCurrent = tb.id === selectedId
        return (
          <div
            key={tb.id}
            onClick={() => {
              if (!isCurrent) void setDefault(tb.id)
            }}
            className="m3-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer',
              background: isCurrent ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
            }}
          >
            {isCurrent ? (
              <span style={{ color: 'var(--md-primary)', flexShrink: 0 }}><IconCheckCircle size={24} /></span>
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--md-outline-variant)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-title-small" style={{ fontWeight: 600 }}>{tb.name}</div>
              <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                {isCurrent ? formatWeekLine(tb) : startDateLine(tb)}
              </div>
              {tb.createdAt > 0 && (
                <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                  {formatCreatedAt(tb.createdAt)}
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); void duplicateTable(tb.id) }}
              aria-label={t('all_tables_duplicate')}
              style={iconBtnStyle}
            >
              <IconContentCopy size={20} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setEditingId(tb.id) }}
              aria-label={t('action_settings')}
              style={iconBtnStyle}
            >
              <IconSettings size={20} />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => {
          const n = tables.length + 1
          void insertTable({ name: `课表 ${n}`, startDate: '', timeJson: DEFAULT_TIME_JSON, isDefault: tables.length === 0 ? 1 : 0, maxWeek: 20, createdAt: Date.now(), smartConfigJson: '', nodeCount: 12 })
        }}
        className="m3-card"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: 14, cursor: 'pointer', border: 'none', width: '100%',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
        }}
      >
        <IconAdd size={20} />
        <span className="m3-label-large">{t('all_tables_new')}</span>
      </button>
    </SettingsScaffold>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', background: 'transparent',
  color: 'var(--md-on-surface-variant)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

function formatWeekLine(tb: Table): string {
  return t2('current_table_week', { v1: computeCurrentWeek(tb.startDate, tb.maxWeek || 20) })
}
function startDateLine(tb: Table): string {
  return t2('table_start_date', { v1: tb.startDate || '—' })
}
function formatCreatedAt(ms: number): string {
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return t2('table_created_at', { v1: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` })
}
/** AllTables 行副标题专用 — 组件顶层外禁 hook, 用 i18next 实例轻量包装 */
function t2(key: string, opts?: Record<string, unknown>): string {
  return i18next.t(key, opts)
}

// ── 节假日灰显 — HolidaySettingsScreen.kt 1:1 (三开关 + 样式分段) ──────
// 开关接 prefs 独立 4 键 holidayGreyHoliday/GreyWeekend/IgnoreWorkday/Style
// (此前 conflation courseColorless = 已知 P3; HolidayRuleEditor 本体属节假日规则域另立文件)
// 灰显样式: grey=半透明 / strikethrough=删除线 (ScheduleView greyDays 消费方)

function HolidayPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  return (
    <SettingsScaffold title={t('settings_holiday_title')} onBack={onBack}>
      {/* 三开关卡 (HolidaySettingsScreen.kt:276-307 同构) */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ToggleRow
          label={t('settings_holiday_holiday')}
          subtitle={t('settings_holiday_holiday_sub')}
          checked={prefs.holidayGreyHoliday}
          onChange={(v) => void update({ holidayGreyHoliday: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_holiday_weekend')}
          subtitle={t('settings_holiday_weekend_sub')}
          checked={prefs.holidayGreyWeekend}
          onChange={(v) => void update({ holidayGreyWeekend: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_holiday_workday')}
          subtitle={t('settings_holiday_workday_sub')}
          checked={prefs.holidayIgnoreWorkday}
          onChange={(v) => void update({ holidayIgnoreWorkday: v })}
        />
      </div>
      {/* 灰显样式分段 (HolidaySettingsScreen.kt:309-321 同构) */}
      <FlatCard
        title={t('settings_holiday_style')}
        options={[t('settings_holiday_style_grey'), t('settings_holiday_style_strikethrough')]}
        selectedKey={prefs.holidayStyle === 'strikethrough' ? 1 : 0}
        onSelect={(i) => void update({ holidayStyle: i === 1 ? 'strikethrough' : 'grey' })}
      />
      {/* HolidayRuleEditor 本体占位 — 用户范围化覆盖 (KEY_HOLIDAY_OVERRIDES), 另立分区移植 */}
      <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 8 }}>
        {t('settings_holiday_editor_placeholder', { defaultValue: '节假日规则编辑器尚未移植' })}
      </div>
    </SettingsScaffold>
  )
}

// ── 关于 — AboutScreen.kt 1:1 核心 (web 无应用内更新检查, 省更新卡) ────

function AboutPage({ onBack }: { onBack: () => void }) {
  const t = useTranslation().t
  const version = '1.0.53'

  return (
    <SettingsScaffold title={t('about_title')} onBack={onBack}>
      <div className="m3-card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 12px',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCalendarMonth size={32} />
        </div>
        <div className="m3-headline-small" style={{ fontWeight: 700 }}>{t('app_name')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
          {t('about_version_detail', { v1: '1.0.53', v2: '53' })}
        </div>
      </div>

      <div className="m3-card" style={{ padding: 0 }}>
        <InfoRow label={t('about_version')} value={`${version} (53)`} />
        <HDiv inset={16} />
        <InfoRow label={t('about_author')} value={t('about_author_name')} />
        <HDiv inset={16} />
        <InfoRow
          label={t('about_source')}
          value={t('about_source_url')}
          href={`https://${t('about_source_url')}`}
        />
      </div>

      <div className="m3-card" style={{ padding: 16 }}>
        <div className="m3-title-medium" style={{ marginBottom: 8 }}>{t('about_feedback')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('about_feedback_detail')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <a
            href="https://github.com/lingion/sleepy/issues"
            target="_blank" rel="noreferrer"
            className="m3-label-large"
            style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 20,
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
              textDecoration: 'none',
            }}
          >
            {t('about_feedback_github')}
          </a>
          <a
            href="mailto:lingion@hrbeu.edu.cn?subject=%5BSleepy%20%E5%8F%8D%E9%A6%88%5D"
            className="m3-label-large"
            style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 20,
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
              textDecoration: 'none',
            }}
          >
            {t('about_feedback_email')}
 </a>
        </div>
      </div>

      <div className="m3-card" style={{ padding: 16 }}>
        <div className="m3-title-medium" style={{ marginBottom: 8 }}>{t('about_license_title')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'pre-line' }}>
          {t('about_license_body')}
        </div>
      </div>
    </SettingsScaffold>
  )
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', gap: 12 }}>
      <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', flexShrink: 0 }}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="m3-body-medium" style={{ color: 'var(--md-primary)', textAlign: 'right' }}>{value}</a>
      ) : (
        <span className="m3-body-medium" style={{ textAlign: 'right' }}>{value}</span>
      )}
    </div>
  )
}

// ── 通用组件 — SettingsCards.kt 1:1 ────────────────────────────────────

const DAYS = [1, 2, 3, 4, 5, 6, 7]

function SettingsScaffold({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 8px 6px' }}>
        <button
          onClick={onBack}
          aria-label={title}
          style={{
            width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent',
            color: 'var(--md-on-background)', cursor: 'pointer',
          }}
        >
          <IconArrowBack size={20} />
        </button>
        <span className="m3-title-large">{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        {children}
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <div className="m3-title-small" style={{ fontWeight: 600, paddingTop: 8 }}>{title}</div>
}

/** 平铺设置卡 — 标题行右侧内嵌 SegmentedSwitcher (SettingsFlatCard options 形态) */
function FlatCard({
  title, options, selectedKey, onSelect,
}: {
  title: string
  options: string[]
  selectedKey: number
  onSelect: (i: number) => void
}) {
  return (
    <div className="m3-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
      <span className="m3-title-small" style={{ fontWeight: 600, flex: 1 }}>{title}</span>
      <SegmentedSwitcher options={options} selected={selectedKey} onSelect={onSelect} compact />
    </div>
  )
}

/** 折叠设置卡 (SettingsCard) — 默认收起, 箭头随展开旋转 */
function FoldCard({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="m3-card" style={{ padding: 16 }}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        <span className="m3-title-small" style={{ fontWeight: 600, flex: 1 }}>{title}</span>
        <span
          style={{
            color: 'var(--md-on-surface-variant)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 180ms',
            display: 'inline-flex',
          }}
        >
          {expanded ? <IconExpandLess size={18} /> : <IconExpandMore size={18} />}
        </span>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>{children}</div>
      )}
    </div>
  )
}

/** 单开关卡 — 仅标题 + 右侧开关 */
function SingleToggleCard({
  title, checked, onChange,
}: {
  title: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="m3-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
      <span className="m3-title-small" style={{ fontWeight: 600, flex: 1 }}>{title}</span>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function ToggleRow({
  label, subtitle, checked, onChange,
}: {
  label: string
  subtitle?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 4px' }}>
      <div style={{ flex: 1 }}>
        <div className="m3-body-large">{label}</div>
        {subtitle && <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function OptionRow({
  label, subtitle, selected, onClick,
}: {
  label: string
  subtitle: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 4px', cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1 }}>
        <div className="m3-body-large" style={{ color: selected ? 'var(--md-primary)' : 'var(--md-on-surface)' }}>{label}</div>
        {subtitle && <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>}
      </div>
      {selected && <CheckIcon />}
    </div>
  )
}

/** 滑杆行 — label + 百分比/dp 值 + input[range]; 5% 步进对应 Android roundToInt(v*20)/20 */
function SliderRow({
  label, value, min, max, step, format, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const [local, setLocal] = useState<number | null>(null)
  const shown = local ?? value
  return (
    <div style={{ padding: '4px 0' }}>
      <div className="m3-body-large" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="m3-label-large" style={{ minWidth: 52, color: 'var(--md-primary)' }}>{format(shown)}</span>
        <input
          type="range"
          min={min} max={max} step={step ?? (max - min) / 20}
          value={shown}
          style={{ flex: 1, accentColor: 'var(--md-primary)' }}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => { if (local !== null) { onChange(local); setLocal(null) } }}
          onTouchEnd={() => { if (local !== null) { onChange(local); setLocal(null) } }}
          onKeyUp={() => { if (local !== null) { onChange(local); setLocal(null) } }}
        />
      </div>
    </div>
  )
}

/** M3 Switch — checkedTrack=primary / checkedThumb=onPrimary (SwitchDefaults.colors 同参) */
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 52, height: 32, borderRadius: 16,
        background: checked ? 'var(--md-primary)' : 'var(--md-surface-container-highest)',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background 150ms',
      }}
    >
      <div
        style={{
          width: checked ? 24 : 16, height: checked ? 24 : 16, borderRadius: 16,
          background: checked ? 'var(--md-on-primary)' : 'var(--md-outline)',
          position: 'absolute', top: 4,
          left: checked ? 24 : 4,
          transition: 'all 150ms',
        }}
      />
    </div>
  )
}

function CheckIcon({ size = 20 }: { size?: number }) {
  // Icons.Outlined.Check 对应 — 矢量图标, tint=primary (禁文本符号)
  return (
    <span style={{ color: 'var(--md-primary)', lineHeight: 1, display: 'inline-flex' }}>
      <IconCheck size={size} />
    </span>
  )
}

/** 分隔线 — HorizontalDivider hairline alpha */
function HDiv({ inset = 0 }: { inset?: number }) {
  return (
    <div
      style={{
        height: 1, marginLeft: inset,
        background: 'color-mix(in srgb, var(--md-outline-variant) 30%, transparent)',
      }}
    />
  )
}

/** SegmentedSwitcher — 轨道 + secondaryContainer thumb 色块滑动 */
function SegmentedSwitcher({
  options, selected, onSelect, compact = false,
}: {
  options: string[]
  selected: number
  onSelect: (i: number) => void
  compact?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex', gap: 3, padding: 3, borderRadius: 12,
        background: 'var(--md-surface-container-highest)', height: compact ? 36 : 42,
      }}
    >
      {options.map((label, i) => {
        const sel = i === selected
        return (
          <div
            key={i}
            onClick={() => onSelect(i)}
            className="m3-label-large"
            style={{
              padding: '0 14px', display: 'flex', alignItems: 'center', borderRadius: 9,
              background: sel ? 'var(--md-secondary-container)' : 'transparent',
              color: sel ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
              fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        )
      })}
    </div>
  )
}
