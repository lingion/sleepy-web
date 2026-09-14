/**
 * AppearancePage — 外观 (AppearanceScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 主题色彩 (跟随系统卡 + 2 列网格: 5 预设 → 各自定义卡 → 加号新建卡永远最后) + 外观模式三态分段。
 * 网格顺序是不变量(2026-09-11 用户定稿): 自定义卡与预设卡同列紧密堆积, 加号只排整个网格末尾。
 */

import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { THEME_PRESETS } from '../../theme/themes'
import { deriveCustomScheme } from '../../theme/customSchemeDeriver'
import { CUSTOM_KEY_PREFIX, getAllThemes, type CustomTheme } from '../../data/customThemeStore'
import { SleepyLogo } from '../../components/icons'
import type { Prefs } from '../../data/types'
import { SettingsScaffold, SectionHeader, CheckIcon } from './shared'


export function AppearancePage({ onBack, onOpenThemeEditor }: { onBack: () => void; onOpenThemeEditor?: (id: string | null) => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  const isDark = document.documentElement.dataset.mode === 'dark'
  // 每次渲染重读 — 编辑器保存/删除后返回本页即见最新 (Android customListVersion 同效)
  const customThemes: CustomTheme[] = getAllThemes()

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
        }}><SleepyLogo size={40} /></div>
        <div style={{ flex: 1 }}>
          <div className="m3-title-medium">{t('theme_system')}</div>
          <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-on-surface-variant)' }}>{t('theme_system_desc')}</div>
        </div>
        {(prefs.theme as string) === 'system' && <CheckIcon size={24} />}
      </div>

      {/* 2 列网格 — 5 预设卡 → 各自定义卡 → 加号新建卡永远最后 (AppearanceScreen cells 序列同构)。
          奇数尾行补空位, 保证最后一张卡保持半宽不撑满 (Android 空 Box 同构)。 */}
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
        {customThemes.map((theme) => (
          <CustomThemeCard
            key={theme.id}
            theme={theme}
            isDark={isDark}
            selected={prefs.theme === CUSTOM_KEY_PREFIX + theme.id}
            onClick={() => void update({ theme: CUSTOM_KEY_PREFIX + theme.id })}
            onEdit={() => onOpenThemeEditor?.(theme.id)}
          />
        ))}
        {/* 新建主题 — 虚线卡, 恒为网格最后一格 (不变量, 非快照) */}
        <div
          onClick={() => onOpenThemeEditor?.(null)}
          style={{
            flex: '1 1 calc(50% - 6px)', boxSizing: 'border-box', borderRadius: 16,
            border: '1.5px dashed var(--md-outline)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, minHeight: 96,
            cursor: 'pointer', color: 'var(--md-on-surface-variant)',
          }}
        >
          <span style={{ fontSize: 24 }}>＋</span>
          <span className="m3-title-small">{t('theme_new')}</span>
        </div>
        {(Object.keys(THEME_PRESETS).length + customThemes.length + 1) % 2 === 1 && (
          <div style={{ flex: '1 1 calc(50% - 6px)' }} aria-hidden />
        )}
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

/**
 * 自定义主题卡 — 与预设卡完全同构(三色板+名称+选中对勾)。
 * edit 图标在色板行右端: 24dp 色块包裹嵌 28dp 色板行, 不撑高卡片 (2026-09-13 用户定稿)。
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
    <div
      onClick={onClick}
      className="m3-card"
      style={{
        flex: '1 1 calc(50% - 6px)',
        boxSizing: 'border-box',
        borderRadius: 16,
        background: selected ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
        padding: 16, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Swatch color={scheme.primary} />
        <Swatch color={scheme.secondary} />
        <Swatch color={scheme.tertiary} />
        <div style={{ flex: 1 }} />
        <div
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          title={t('theme_custom_edit')}
          aria-label={t('theme_custom_edit')}
          style={{
            width: 24, height: 24, borderRadius: 6, background: 'var(--md-surface-container-highest)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--md-on-surface-variant)', fontSize: 13, cursor: 'pointer', flexShrink: 0,
          }}
        >
          ✎
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          className="m3-title-small"
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {theme.name.trim() === '' ? t('theme_new') : theme.name}
        </span>
        {selected && <CheckIcon size={20} />}
      </div>
    </div>
  )
}
