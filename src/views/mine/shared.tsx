/**
 * mine/shared — 我的分区各页共用的小组件 (SettingsCards.kt 1:1)。
 * 从 MineView.tsx 拆出: 被 ≥2 个页面使用的展示型组件集中在此, 单页专用组件留在各页文件。
 * 无状态、无副作用, 仅呈现; 各页通过 props 传入数据与回调。
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowBack, IconCheck } from '../../components/icons'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'

/**
 * 子页骨架 — Scaffold(containerColor=background) + 小型 TopAppBar (高 64, 导航钮 48 起始 4dp,
 * ArrowBack 24 onBackground, 标题 titleLarge 起 56) + 内容 PaddingValues(16) / spacedBy(16)。
 * bg: 内容区底色 (TopAppBar 下方, Android Column.background 同位); 内容区撑满剩余高度
 */
export function SettingsScaffold({ title, onBack, children, bg }: { title: string; onBack: () => void; children: ReactNode; bg?: string }) {
  const { t } = useTranslation()
  return (
    <div style={{ height: '100%', overflow: 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 64, flexShrink: 0, padding: '0 4px', color: 'var(--md-on-background)' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={t('back')}
          style={{
            width: 48, height: 48, flexShrink: 0, borderRadius: 24, border: 'none', padding: 0, background: 'transparent',
            color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <IconArrowBack size={24} />
        </button>
        <span
          className="m3-title-large"
          style={{ padding: '0 4px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, flexGrow: 1, background: bg }}>
        {children}
      </div>
    </div>
  )
}

/** SectionHeader: titleSmall SemiBold onBackground + 上距 8; 可选副标题 bodySmall onSurfaceVariant (间 2) */
export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-background)' }}>{title}</div>
      {subtitle !== undefined && (
        <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>
      )}
    </div>
  )
}

/**
 * SettingsFlatCard (options 形态) — r16 surfaceContainer, 内边距 16×14, 竖向间距 4;
 * 标题行 gap 12: 标题 weight 1 + 测宽 SegmentedSwitcher (高 36, surfaceContainerHighest)。
 */
export function FlatCard({
  title, subtitle, options, selectedKey, onSelect,
}: {
  title: string
  subtitle?: string
  options: string[]
  selectedKey: number
  onSelect: (i: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 16,
        background: 'var(--md-surface-container)', color: 'var(--md-on-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="m3-title-small" style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{title}</span>
        <SegmentedSwitcher
          options={options}
          selected={selectedKey}
          onSelect={onSelect}
          fit
          height={36}
          containerColor="var(--md-surface-container-highest)"
        />
      </div>
      {subtitle !== undefined && (
        <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</span>
      )}
    </div>
  )
}

export function SliderRow({
  label, value, min, max, step, formatValue, onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label style={{ display: 'block', padding: '8px 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span className="m3-body-large">{label}</span>
        <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{formatValue ? formatValue(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ width: '100%', accentColor: 'var(--md-primary)' }}
      />
    </label>
  )
}

export function ToggleRow({
  label, subtitle, checked, onChange,
}: {
  label: string
  subtitle?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 4px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-body-large" style={{ color: 'var(--md-on-surface)' }}>{label}</div>
        {subtitle && <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

/**
 * M3 Switch — material3 1.3.0 (compose-bom 2024.10.00) SwitchTokens 1:1:
 * 轨道 52×32; 未选中 track=surface-container-highest + 2dp outline 描边 (inset ring,
 * 不占布局); thumb 未选中 16dp@8,8=outline / 选中 24dp@4,24=onPrimary;
 * 动画 FastSpatial 300ms emphasized (MotionSchemeKeyTokens.FastSpatial)。
 * 1.3.0 默认无选中 ✓ 图标 (1.4+ expressive 才有), 故此处不画。
 * button 元素 = 键盘可聚焦 (Space/Enter 原生), 与 Android focusable 对齐。
 */
export function Switch({
  checked, onChange, uncheckedTrack = 'var(--md-surface-container-highest)',
}: { checked: boolean; onChange: (v: boolean) => void; uncheckedTrack?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 52, height: 32, borderRadius: 16, border: 'none', padding: 0,
        background: checked ? 'var(--md-primary)' : uncheckedTrack,
        // 2dp outline 描边画在轨道内侧 (Android Modifier.border(TrackOutlineWidth)); 选中时透明
        boxShadow: checked ? 'none' : 'inset 0 0 0 2px var(--md-outline)',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background 300ms cubic-bezier(0.05, 0.7, 0.1, 1), box-shadow 300ms cubic-bezier(0.05, 0.7, 0.1, 1)',
      }}
    >
      <div
        style={{
          width: checked ? 24 : 16, height: checked ? 24 : 16, borderRadius: 16,
          background: checked ? 'var(--md-on-primary)' : 'var(--md-outline)',
          position: 'absolute',
          top: checked ? 4 : 8,
          left: checked ? 24 : 8,
          transition: 'all 300ms cubic-bezier(0.05, 0.7, 0.1, 1)',
        }}
      />
    </button>
  )
}

export function CheckIcon({ size = 20 }: { size?: number }) {
  // Icons.Outlined.Check 对应 — 矢量图标, tint=primary (禁文本符号)
  return (
    <span style={{ color: 'var(--md-primary)', lineHeight: 1, display: 'inline-flex' }}>
      <IconCheck size={size} />
    </span>
  )
}

/** 分隔线 — HorizontalDivider hairline alpha */
export function HDiv({ inset = 0 }: { inset?: number }) {
  return (
    <div
      style={{
        height: 1, marginLeft: inset,
        background: 'color-mix(in srgb, var(--md-outline-variant) 30%, transparent)',
      }}
    />
  )
}
