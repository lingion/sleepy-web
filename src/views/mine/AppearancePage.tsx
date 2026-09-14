/**
 * AppearancePage — 外观 (AppearanceScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 主题色彩 (跟随系统卡 + 2 列预设网格) + 外观模式三态分段。
 * 自定义卡与加号尾位卡省略: CustomSchemeDeriver + CustomThemeEditor 属 src/theme/ 与
 * prefsStore 配套改动, 待对应区 agent 移植后补齐 (#/我的/外观/自定义主题 路由已预注册)。
 */

import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { THEME_PRESETS } from '../../theme/themes'
import { SleepyLogo } from '../../components/icons'
import type { Prefs } from '../../data/types'
import { SettingsScaffold, SectionHeader, CheckIcon } from './shared'


export function AppearancePage({ onBack }: { onBack: () => void }) {
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
        }}><SleepyLogo size={40} /></div>
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
