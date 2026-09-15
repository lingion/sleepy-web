/**
 * mine/shared — 我的分区各页共用的小组件 (SettingsCards.kt 1:1)。
 * 从 MineView.tsx 拆出: 被 ≥2 个页面使用的展示型组件集中在此, 单页专用组件留在各页文件。
 * 无状态、无副作用, 仅呈现; 各页通过 props 传入数据与回调。
 */

import type { ReactNode } from 'react'
import { IconArrowBack, IconCheck } from '../../components/icons'

export function SettingsScaffold({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div style={{ height: '100%', overflow: 'auto', boxSizing: 'border-box', paddingBottom: 16 }}>
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

export function SectionHeader({ title }: { title: string }) {
  return <div className="m3-title-small" style={{ fontWeight: 600, paddingTop: 8 }}>{title}</div>
}

/** 平铺设置卡 — 标题行右侧内嵌 SegmentedSwitcher (SettingsFlatCard options 形态) */
export function FlatCard({
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
      <div style={{ flex: 1 }}>
        <div className="m3-body-large">{label}</div>
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
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 52, height: 32, borderRadius: 16, border: 'none', padding: 0,
        background: checked ? 'var(--md-primary)' : 'var(--md-surface-container-highest)',
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

/** SegmentedSwitcher — 轨道 + secondaryContainer thumb 色块滑动 */
export function SegmentedSwitcher({
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
