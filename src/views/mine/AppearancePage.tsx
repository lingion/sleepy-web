/**
 * AppearancePage — 外观 (AppearanceScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 主题色彩 (跟随系统卡 + 2 列网格: 5 预设 → 各自定义卡 → 加号新建卡永远最后) + 外观模式三态分段。
 * 网格顺序是不变量(2026-09-11 用户定稿): 自定义卡与预设卡同列紧密堆积, 加号只排整个网格末尾。
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { THEME_PRESETS, resolveThemeScheme, type ThemePreset } from '../../theme/themes'
import { deriveCustomScheme } from '../../theme/customSchemeDeriver'
import { CUSTOM_KEY_PREFIX, getAllThemes, type CustomTheme } from '../../data/customThemeStore'
import { IconAdd, IconAutoAwesome, IconChevronRight, IconEdit } from '../../components/icons'
import type { Prefs } from '../../data/types'
import { SettingsScaffold, SectionHeader, CheckIcon, onActivateKey } from './shared'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'
import { FlatCard, SliderRow } from './shared'
import { refreshCourseHues } from '../../data/courseHueStore'
import { resolveIsDark } from '../../state/prefsStore'
import { db } from '../../data/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { courseNeutralTokens } from '../../theme/themes'
import { pickCourseColor, textColorOn, parseHex, rgbToHex } from '../../domain/courseColor'
import { courseColorAnchor } from '../../domain/courseHarmony'

type ThemeGridCell =
  | { kind: 'preset'; preset: ThemePreset }
  | { kind: 'custom'; theme: CustomTheme }
  | { kind: 'new' }

function chunked<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export function AppearancePage({ onBack, onOpenThemeEditor, onOpenScheduleDisplay }: { onBack: () => void; onOpenThemeEditor?: (id: string | null) => void; onOpenPeriodHeader?: () => void; onOpenScheduleDisplay?: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  const isDark = document.documentElement.dataset.mode === 'dark'
  // 每次渲染重读 — 编辑器保存/删除后返回本页即见最新 (Android customListVersion 同效)
  const customThemes: CustomTheme[] = getAllThemes()

  const cells: ThemeGridCell[] = [
    ...Object.values(THEME_PRESETS).map((preset): ThemeGridCell => ({ kind: 'preset', preset })),
    ...customThemes.map((theme): ThemeGridCell => ({ kind: 'custom', theme })),
    { kind: 'new' },
  ]

  const modes: Array<[Prefs['themeMode'], string]> = [
    ['system', t('theme_mode_system')],
    ['light', t('theme_mode_light')],
    ['dark', t('theme_mode_dark')],
  ]

  return (
    <SettingsScaffold title={t('mine_appearance')} onBack={onBack} gap={12}>
      <SectionHeader title={t('theme_appearance')} />
      <SegmentedSwitcher options={modes.map(([, label]) => label)} selected={modes.findIndex(([mode]) => mode === prefs.themeMode)} onSelect={(i) => void update({ themeMode: modes[i][0] })} />

      {/* ── Section① 主题色彩 ── */}
      <SectionHeader title={t('appearance_section_theme')} />

      {/* 跟随系统卡 — 独立语义 KEY_SYSTEM, 不落 default 预设;
          web 无壁纸取色, applyTheme('system') 回落默认色板 = Android Material You 平台最近等价 */}
      <SystemThemeCard
        selected={(prefs.theme as string) === 'system'}
        onClick={() => void update({ theme: 'system' as Prefs['theme'] })}
      />

      {/* 2 列网格: cells.chunked(2) 每行 Row(spacedBy 12) + 单格行补空 Box; Row 顶对齐不拉伸 (新建格 96 高) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chunked(cells, 2).map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {row.map((cell) => (
              <div
                key={cell.kind === 'preset' ? cell.preset.key : cell.kind === 'custom' ? cell.theme.id : 'new'}
                style={{ flex: 1, minWidth: 0 }}
              >
                {cell.kind === 'preset' ? (
                  <PresetThemeCard
                    preset={cell.preset}
                    isDark={isDark}
                    selected={prefs.theme === cell.preset.key}
                    onClick={() => void update({ theme: cell.preset.key as Prefs['theme'] })}
                  />
                ) : cell.kind === 'custom' ? (
                  <CustomThemeCard
                    theme={cell.theme}
                    isDark={isDark}
                    selected={prefs.theme === CUSTOM_KEY_PREFIX + cell.theme.id}
                    onClick={() => void update({ theme: CUSTOM_KEY_PREFIX + cell.theme.id })}
                    onEdit={() => onOpenThemeEditor?.(cell.theme.id)}
                  />
                ) : (
                  <NewThemeCard onClick={() => onOpenThemeEditor?.(null)} />
                )}
              </div>
            ))}
            {row.length === 1 && <div style={{ flex: 1, minWidth: 0 }} aria-hidden />}
          </div>
        ))}
      </div>

      <SectionHeader title={t('settings_appearance_navigation', '导航')} />
      <FlatCard title={t('settings_nav_style')} options={[t('settings_nav_style_docked'), t('settings_nav_style_floating')]} selectedKey={prefs.navDock ? 1 : 0} onSelect={(i) => void update({ navDock: i === 1 })} />
      <SectionHeader title={t('appearance_section_dock_theme', '界面风格')} />
      <SegmentedSwitcher options={[t('dock_theme_classic', '经典'), t('dock_theme_liquid_glass', '液态玻璃')]} selected={prefs.uiStyle === 'liquid_glass' ? 1 : 0} onSelect={(i) => void update({ uiStyle: i === 1 ? 'liquid_glass' : 'classic' })} />
      <SectionHeader title={t('appearance_section_course_color', '课程配色')} />
      <CourseColorSettings />
      <AppearanceNavigationRow title={t('appearance_section_schedule_display')} onClick={() => onOpenScheduleDisplay?.()} />
    </SettingsScaffold>
  )
}

/** 主题卡外壳 — Surface r16, 选中 primaryContainer / 否则 surfaceContainer (全 app 纯色块禁描线) */
function ThemeSurface({ selected, onClick, children, padding = 16 }: { selected: boolean; onClick: () => void; children: ReactNode; padding?: number }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => onActivateKey(e, onClick)}
      style={{
        boxSizing: 'border-box', width: '100%', borderRadius: 16, padding, cursor: 'pointer',
        background: selected ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
        color: 'var(--md-on-surface)',
      }}
    >
      {children}
    </div>
  )
}

function SystemThemeCard({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <ThemeSurface selected={selected} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, flexShrink: 0, background: 'var(--md-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-on-primary-container)',
        }}>
          <IconAutoAwesome size={28} />
        </div>
        <div style={{ width: 16, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="m3-title-medium" style={{ color: 'var(--md-on-surface)' }}>{t('theme_system')}</div>
          <div style={{ height: 2 }} />
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('theme_system_desc_web')}</div>
        </div>
        {selected && <CheckIcon size={24} label={t('selected')} />}
      </div>
    </ThemeSurface>
  )
}

function Swatch({ color }: { color: string }) {
  return <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: color }} />
}

/**
 * 名称行: titleSmall Medium onSurface + 恒定 20×20 ✓槽位 — 条件渲染会让选中卡比未选中卡高
 * (AppearanceScreen.kt:309-312 禁改回裸 if; 占位而非透明隐藏, 读屏不误播"已选中")
 */
function NameRow({ name, selected, ellipsis }: { name: string; selected: boolean; ellipsis?: boolean }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span
        className="m3-title-small"
        style={{
          flex: 1, minWidth: 0, fontWeight: 500, color: 'var(--md-on-surface)',
          ...(ellipsis ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : null),
        }}
      >
        {name}
      </span>
      <span style={{ width: 20, height: 20, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {selected && <CheckIcon size={20} label={t('selected')} />}
      </span>
    </div>
  )
}

function PresetThemeCard({ preset, isDark, selected, onClick }: { preset: ThemePreset; isDark: boolean; selected: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const scheme = isDark ? preset.dark : preset.light
  return (
    <ThemeSurface selected={selected} onClick={onClick}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Swatch color={scheme.primary} />
        <Swatch color={scheme.secondary} />
        <Swatch color={scheme.tertiary} />
      </div>
      <div style={{ height: 12 }} />
      <NameRow name={t(`theme_name_${preset.key}`)} selected={selected} />
    </ThemeSurface>
  )
}

/** 「新建主题」入口 — 裸虚线圆圈+加号, 无卡无背景无文字 (2026-09-11 用户定稿), fillMaxWidth × 96 */
function NewThemeCard({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('theme_new')}
      onClick={onClick}
      onKeyDown={(e) => onActivateKey(e, onClick)}
      style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <DashedCircleWithPlus size={40} />
    </div>
  )
}

/** 虚线圆 (stroke 1.5, dash 6/5, r=(size-stroke)/2) + 中心 Add (size/2), 均 onSurface */
function DashedCircleWithPlus({ size }: { size: number }) {
  const stroke = 1.5
  return (
    <div style={{ position: 'relative', width: size, height: size, color: 'var(--md-on-surface)' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ display: 'block' }}>
        <circle
          cx={size / 2} cy={size / 2} r={(size - stroke) / 2} fill="none"
          stroke="currentColor" strokeWidth={stroke} strokeDasharray="6 5"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconAdd size={size / 2} />
      </div>
    </div>
  )
}

/**
 * 自定义主题卡 — 与预设卡完全同构(三色板+名称+选中对勾, 大小一致)。
 * edit 色块在色板行右端: 28 r8 surfaceContainerHighest 与色板同高, 首行不撑高 (2026-09-13 用户定稿)。
 */
function CustomThemeCard({
  theme,
  isDark,
  selected,
  onClick,
  onEdit,
}: {
  theme: CustomTheme
  isDark: boolean
  selected: boolean
  onClick: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  const scheme = deriveCustomScheme(theme, isDark)
  return (
    <ThemeSurface selected={selected} onClick={onClick}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Swatch color={scheme.primary} />
        <Swatch color={scheme.secondary} />
        <Swatch color={scheme.tertiary} />
        <div style={{ flex: 1 }} />
        <div
          role="button"
          tabIndex={0}
          aria-label={t('theme_custom_edit')}
          title={t('theme_custom_edit')}
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          onKeyDown={(e) => { e.stopPropagation(); onActivateKey(e, onEdit) }}
          style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'var(--md-surface-container-highest)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--md-on-surface-variant)', cursor: 'pointer',
          }}
        >
          <IconEdit size={16} />
        </div>
      </div>
      <div style={{ height: 12 }} />
      <NameRow name={theme.name.trim() === '' ? t('theme_new') : theme.name} selected={selected} ellipsis />
    </ThemeSurface>
  )
}

/** AppearanceNavigationRow.kt — surfaceContainer r12, padding 16/16, bodyLarge onSurface + ChevronRight onSurfaceVariant */
function AppearanceNavigationRow({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => onActivateKey(e, onClick)}
      style={{
        display: 'flex', alignItems: 'center', padding: 16, borderRadius: 12, cursor: 'pointer',
        background: 'var(--md-surface-container)',
      }}
    >
      <span className="m3-body-large" style={{ flex: 1, minWidth: 0, color: 'var(--md-on-surface)' }}>{title}</span>
      <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)' }}>
        <IconChevronRight size={24} />
      </span>
    </div>
  )
}

function CourseColorSettings() {
  const { t } = useTranslation()
  const prefs = usePrefsStore(s => s.prefs)
  const update = usePrefsStore(s => s.update)
  const courses = useLiveQuery(() => db.courses.orderBy('id').toArray(), []) ?? []
  const preview = [...new Map(courses.map(c => [c.groupId, c])).values()].slice(0, 6)
  const neutral = courseNeutralTokens(resolveIsDark(prefs)).neutral
  return <div style={{ padding: 16, borderRadius: 16, background: 'var(--md-surface-container)', display: 'grid', gap: 12 }}>
    <SegmentedSwitcher options={[t('course_color_uniform', '统一底色'), t('course_color_classic', '经典'), t('course_color_follow_theme', '跟随主题'), t('course_color_custom_seed', '自定色相')]} selected={prefs.courseColorless ? 0 : prefs.courseColorMode + 1} onSelect={(i) => void update(i === 0 ? { courseColorless: true } : { courseColorless: false, courseColorMode: (i - 1) as 0 | 1 | 2, ...(i === 3 && prefs.courseColorSeedHue < 0 ? { courseColorSeedHue: courseColorAnchor(1, resolveThemeScheme(prefs.theme, resolveIsDark(prefs)).primary, -1) ?? 0 } : {}) })} />
    {!prefs.courseColorless && prefs.courseColorMode === 2 && <SliderRow label={t('course_color_seed_label', '种子色相')} value={Math.max(0, prefs.courseColorSeedHue)} min={0} max={360} step={1} formatValue={v => `${Math.round(v)}°`} onCommit={courseColorSeedHue => void update({ courseColorSeedHue })} />}
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }} aria-label={t('course_color_preview', '配色预览')}>
      {preview.map(course => { const color = pickCourseColor(course, resolveIsDark(prefs), neutral, prefs.courseColorless); const text = rgbToHex(textColorOn(parseHex(color) ?? [255, 255, 255], resolveIsDark(prefs), parseHex(courseNeutralTokens(resolveIsDark(prefs)).onSurface) ?? [0, 0, 0])); return <span key={course.groupId} style={{ padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap', color: text, background: color }}>{course.courseName}</span> })}
    </div>
    {!prefs.courseColorless && <button type="button" className="m3-button-tonal" onClick={() => void refreshCourseHues(prefs, resolveIsDark(prefs), true).then(() => update({}))}>{t('course_color_recalc', '重新编排课程颜色')}</button>}
  </div>
}
