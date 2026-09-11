/**
 * MineView — 我的 tab: MineScreen.kt + GeneralSettingsScreen.kt + AppearanceScreen.kt 1:1
 * 主页 = Header + 统计卡 + 6 入口 + 刷新小组件按钮;
 * 二级页 = 通用(课程显示/小组件/画面/语言) + 外观(主题色彩/外观模式)。
 * Web 无小组件 → refreshWidgets 动作与 widget 分组保留开关本体(widgetSeparator/colorless/vertPunct),
 * 「管理桌面小组件」入口与「刷新小组件」按钮省略(无小组件可管, 后续发布浏览器扩展时恢复)。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePrefsStore } from '../state/prefsStore'
import { computeCurrentWeek } from './ScheduleView'
import { localizedDay } from '../components/schedule/CardsGridView'
import { THEME_PRESETS } from '../theme/themes'
import type { Course, Prefs } from '../data/types'

type Page = 'main' | 'general' | 'appearance'

export function MineView() {
  const [page, setPage] = useState<Page>('main')

  switch (page) {
    case 'general':
      return <GeneralSettingsPage onBack={() => setPage('main')} />
    case 'appearance':
      return <AppearancePage onBack={() => setPage('main')} />
    default:
      return <MineMainPage onOpenGeneral={() => setPage('general')} onOpenAppearance={() => setPage('appearance')} />
  }
}

// ── 主页 — MineScreen.kt ────────────────────────────────────────────────

function MineMainPage({
  onOpenGeneral,
  onOpenAppearance,
}: {
  onOpenGeneral: () => void
  onOpenAppearance: () => void
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
        <SettingsItem icon="✎" label={t('all_tables')} onClick={() => {}} />
        <HDiv inset={72} />
        <SettingsItem icon="⇪" label={t('mine_export')} onClick={() => {}} />
        <HDiv inset={72} />
        <SettingsItem icon="✦" label={t('mine_appearance')} onClick={onOpenAppearance} />
        <HDiv inset={72} />
        <SettingsItem icon="⚙" label={t('mine_general')} onClick={onOpenGeneral} />
        <HDiv inset={72} />
        <SettingsItem icon="ⓘ" label={t('about_title')} onClick={() => {}} />
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

function SettingsItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
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

function GeneralSettingsPage({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)

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
      <FoldCard title={t('settings_pill')}>
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
      <FoldCard title={t('settings_conflict_style')}>
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
              min={8} max={28}
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
              min={4} max={20}
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
              min={4} max={20}
              format={(v) => `${Math.round(v)}dp`}
              onChange={(v) => void update({ conflictRailInset: v })}
            />
          </>
        )}
      </FoldCard>

      {/* 显示星期: 周一~周日多选, 禁止全取消(GeneralSettingsScreen L437) */}
      <FoldCard title={t('settings_visible_days')}>
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

      <HDiv />

      {/* ── 分组② 小组件 ── */}
      <SectionHeader title={t('appearance_section_widget')} />

      <FoldCard title={t('settings_widget')}>
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

      {/* 跟随系统卡 (SystemThemeCard) */}
      <div
        onClick={() => void update({ theme: 'default' })}
        className="m3-card"
        style={{
          background: prefs.theme === 'default' ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
          display: 'flex', alignItems: 'center', gap: 16, padding: 16, cursor: 'pointer',
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: 'var(--md-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          color: 'var(--md-on-primary-container)', flexShrink: 0,
        }}>✦</div>
        <div style={{ flex: 1 }}>
          <div className="m3-title-medium">{t('theme_system')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('theme_system_desc')}</div>
        </div>
        {prefs.theme === 'default' && <CheckIcon size={24} />}
      </div>

      {/* 2 列网格 5 套预设 (custom 主题暂缺, 加号入口省略至 CustomThemeEditor 移植) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {Object.values(THEME_PRESETS).filter((p) => p.key !== 'default').map((preset) => {
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

      {/* 外观模式三态分段 */}
      <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('theme_appearance')}</div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 14, background: 'var(--md-surface-container)' }}>
        {modes.map(([mode, label]) => {
          const sel = mode === prefs.themeMode
          return (
            <div
              key={mode}
              onClick={() => void update({ themeMode: mode })}
              style={{
                flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: 12,
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
            color: 'var(--md-on-background)', fontSize: 20, cursor: 'pointer',
          }}
        >
          ‹
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
function FoldCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="m3-card" style={{ padding: 16 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        <span className="m3-title-small" style={{ fontWeight: 600, flex: 1 }}>{title}</span>
        <span
          style={{
            color: 'var(--md-on-surface-variant)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 180ms',
          }}
        >
          ⌄
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
  label, value, min, max, format, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
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
          min={min} max={max} step={(max - min) / 20}
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
  return (
    <span style={{ color: 'var(--md-primary)', fontSize: size, lineHeight: 1 }}>✓</span>
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
