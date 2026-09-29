/**
 * GeneralSettingsPage — 通用设置 (GeneralSettingsScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 分组: 课程显示 / 小组件 / 画面 / 语言。
 * 卡片 style 覆盖 .m3-card 默认 → surface-container + 16px 圆角 (SettingsCards.kt L71/L117);
 * 禁改共享 global.css, 故覆盖落在组件层。FoldCard 折叠触发: web 仅标题行可点 (有意取舍非遗漏)。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { IconChevronRight, IconExpandLess, IconExpandMore } from '../../components/icons'
import type { Prefs } from '../../data/types'
import { SettingsScaffold, SectionHeader, FlatCard, ToggleRow, HDiv, CheckIcon, Switch } from './shared'

const EXPANDED_KEY = 'sleepy_gss_expanded'


export function GeneralSettingsPage({ onBack, onOpenHoliday }: { onBack: () => void; onOpenHoliday: () => void }) {
  const { t } = useTranslation()
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

  const languages: Array<[Prefs['lang'], string]> = LanguageCardLanguages
  const days = [1, 2, 3, 4, 5, 6, 7]
  // 折叠卡展开态跨页保真 — sessionStorage (Android rememberSaveable 同语义: 横配/重建保留)
  useEffect(() => {
    try { sessionStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])) }
    catch { /* 隐私/配额失败忽略 */ }
  }, [expanded])

  return (
    <SettingsScaffold title={t('mine_general')} onBack={onBack}>
      <SectionHeader title={t('appearance_section_display')} />

      {/* 显示模式: 节次 / 时间 — 二选一, 标题行右侧 tab 切换 */}
      <FlatCard
        title={t('settings_display_mode')}
        options={[t('settings_display_node'), t('settings_display_time')]}
        selectedKey={prefs.displayMode === 'node' ? 0 : 1}
        onSelect={(i) => void update({ displayMode: i === 0 ? 'node' : 'time' })}
      />

      {/* 网格副信息: 教室 / 教师 / 无 — 三选一 */}
      <FlatCard
        title={t('settings_grid_sub_info')}
        options={[t('settings_grid_sub_room'), t('settings_grid_sub_teacher'), t('settings_grid_sub_none')]}
        selectedKey={prefs.gridSubInfo === 'room' ? 0 : prefs.gridSubInfo === 'teacher' ? 1 : 2}
        onSelect={(i) => void update({ gridSubInfo: i === 0 ? 'room' : i === 1 ? 'teacher' : 'none' })}
      />

      {/* 主页显示折叠卡: 缩放/圆角(已迁外观)+两栏开关+分栏标准+隐藏无课日+别名 */}
      <FoldCard title={t('settings_pill')} expanded={expanded.has('settings_pill')} onToggle={() => toggleExpanded('settings_pill')}>
        <ToggleRow
          label={t('settings_week_two_column')}
          checked={prefs.weekTwoColumn}
          onChange={(v) => void update({ weekTwoColumn: v })}
        />
        {prefs.weekTwoColumn && (
          <>
            <HDiv />
            <FlatCard
              title={t('settings_week_two_column_mode')}
              options={[t('settings_week_two_column_days'), t('settings_week_two_column_balance')]}
              selectedKey={prefs.weekTwoColumnMode === 'balance' ? 1 : 0}
              onSelect={(i) => void update({ weekTwoColumnMode: i === 1 ? 'balance' : 'days' })}
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
      </FoldCard>

      {/* 显示星期: 周一~周日多选 */}
      <FoldCard title={t('settings_visible_days')} expanded={expanded.has('visibleDays')} onToggle={() => toggleExpanded('visibleDays')}>
        <div className="m3-body-small" style={{ padding: '4px 4px', color: 'var(--md-on-surface-variant)' }}>{t('settings_visible_days_sub')}</div>
        {days.map((day) => {
          const checked = prefs.visibleDays.includes(day)
          return (
            <div key={day}>
              <HDiv />
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 4px', cursor: 'pointer' }} onClick={() => {
                const next = checked ? prefs.visibleDays.filter((d) => d !== day) : [...prefs.visibleDays.filter((d) => d !== day), day].sort((a, b) => a - b)
                void update({ visibleDays: next })
              }}>
                <span className="m3-body-large" style={{ flex: 1 }}>{t(`day_${day}`)}</span>
                <Switch checked={checked} onChange={() => void update({ visibleDays: checked ? prefs.visibleDays.filter((d) => d !== day) : [...prefs.visibleDays, day].sort((a, b) => a - b) })} />
              </div>
            </div>
          )
        })}
      </FoldCard>

      {/* 课程胶囊统一底色: 仅标题 + 右侧开关 (GSS 课表显示组, courseColorless 同组) */}
      <div className="m3-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <span className="m3-title-small" style={{ fontWeight: 600, flex: 1 }}>{t('settings_course_colorless')}</span>
        <Switch checked={prefs.courseColorless} onChange={(v) => void update({ courseColorless: v })} />
      </div>

      {/* 节假日课程灰显: 入口行 → 二级页 (GSS L496-522) */}
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
          label={t('settings_nearest_busy_day')}
          subtitle={t('settings_nearest_busy_day_sub')}
          checked={prefs.nearestBusyDay}
          onChange={(v) => void update({ nearestBusyDay: v })}
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

      {/* ── 分组④ 语言 (v1.0.56 T4: 折叠卡 — 收起只显当前语言, 点开展开 5 项) ── */}
      <SectionHeader title={t('settings_language')} />

      <LanguageCard
        prefs={prefs}
        currentLabel={languages.find(([code]) => code === prefs.lang)?.[1] ?? prefs.lang}
        onChange={(code) => void update({ lang: code })}
      />

      {/* ── 分组⑤ 实验室 (v1.0.56: 实验性功能, 默认全关) ── */}
      <SectionHeader title={t('settings_lab')} />
      <p className="m3-body-small" style={{ margin: '0 0 8px', color: 'var(--md-on-surface-variant)' }}>
        {t('settings_lab_sub')}
      </p>
      <div className="m3-card" style={{ display: 'flex', flexDirection: 'column', padding: 16 }}>
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
              <span className="m3-body-large" style={{ flex: 1 }}>{t('settings_grid_evening_start')}</span>
              <input
                type="time"
                value={prefs.gridEveningStart}
                onChange={(e) => void update({ gridEveningStart: e.target.value })}
                aria-label={t('settings_grid_evening_start')}
                style={{ width: 150, padding: '8px 12px', background: 'var(--md-surface-container-high)', border: 'none', borderRadius: 8, color: 'var(--md-on-surface)', font: 'inherit' }}
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
      </div>
    </SettingsScaffold>
  )
}

/**
 * LanguageCard — 折叠卡: 收起只显当前语言 (v1.0.56 T4, GeneralSettingsScreen.kt L672-735 1:1)。
 * 选中语言直接写 prefs.lang (i18n.changeLang 已在 prefsStore syncSideEffects 触发)。
 */
const LanguageCardLanguages: Array<[Prefs['lang'], string]> = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['es', 'Español'],
]

function LanguageCard({ prefs, onChange, currentLabel }: {
  prefs: { lang: Prefs['lang'] }
  onChange: (code: Prefs['lang']) => void
  currentLabel: string
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const languages = LanguageCardLanguages
  return (
    <div className="m3-card" style={{ background: 'var(--md-surface-container)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', padding: 16, cursor: 'pointer' }}
      >
        <div style={{ flex: 1 }}>
          <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('settings_language')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{currentLabel}</div>
        </div>
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
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {languages.map(([code, label], i) => {
            const selected = prefs.lang === code
            return (
              <div key={code}>
                <div
                  onClick={() => onChange(code)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 4px', cursor: 'pointer',
                  }}
                >
                  <span className="m3-body-large" style={{ color: selected ? 'var(--md-primary)' : 'var(--md-on-surface)' }}>
                    {label}
                  </span>
                  {selected && <CheckIcon />}
                </div>
                {i < languages.length - 1 && <HDiv />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


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
