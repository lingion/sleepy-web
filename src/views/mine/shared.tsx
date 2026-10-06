/**
 * mine/shared — 我的分区各页共用的小组件 (SettingsCards.kt 1:1)。
 * 从 MineView.tsx 拆出: 被 ≥2 个页面使用的展示型组件集中在此, 单页专用组件留在各页文件。
 * 仅呈现 (ExpandVisibility 只持有动画态); 各页通过 props 传入数据与回调。
 */

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowBack, IconCheck, IconExpandMore } from '../../components/icons'
import { SegmentedSwitcher } from '../../components/SegmentedSwitcher'

// AnimatedVisibility 默认 expandVertically/fadeIn = spring(StiffnessMediumLow) 临界阻尼 ≈330ms 收束
const EXPAND_MS = 330
const EXPAND_EASE = 'cubic-bezier(0.2, 0, 0, 1)'

/** AnimatedVisibility(expandVertically + fadeIn / shrinkVertically + fadeOut): 退场动画结束后才卸载内容 */
export function ExpandVisibility({ visible, children }: { visible: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(visible)
  const [open, setOpen] = useState(visible)
  useLayoutEffect(() => {
    if (visible) {
      setMounted(true)
      return
    }
    setOpen(false)
    const id = window.setTimeout(() => setMounted(false), EXPAND_MS)
    return () => window.clearTimeout(id)
  }, [visible])
  useLayoutEffect(() => {
    if (!visible || !mounted || open) return
    // 先强制按 0fr 排版一次, 再切 1fr 才会走过渡
    void ref.current?.offsetHeight
    setOpen(true)
  }, [visible, mounted, open])
  if (!mounted) return null
  return (
    <div
      ref={ref}
      style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0,
        transition: `grid-template-rows ${EXPAND_MS}ms ${EXPAND_EASE}, opacity ${EXPAND_MS}ms ${EXPAND_EASE}`,
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function onActivateKey(e: KeyboardEvent, action: () => void) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  action()
}

/**
 * SettingsCard 折叠卡 — r16 surfaceContainer, 内边距 16, 整卡可点切换; 标题 titleSmall SemiBold onSurface
 * + ExpandMore 20 onSurfaceVariant 随展开转 180°; 内容 AnimatedVisibility, 与标题行间距 4 + Spacer 4。
 * 平台差异: Android 内容区未被子项消费的点击也会收起卡片, web 内容区点击不冒泡到卡片。
 */
export function SettingsCard({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onToggle}
      style={{ padding: 16, borderRadius: 16, background: 'var(--md-surface-container)', color: 'var(--md-on-surface)', cursor: 'pointer' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => onActivateKey(e, onToggle)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span className="m3-title-small" style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{title}</span>
        <span
          style={{
            display: 'inline-flex', color: 'var(--md-on-surface-variant)',
            transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 170ms cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          <IconExpandMore size={20} />
        </span>
      </div>
      <ExpandVisibility visible={expanded}>
        <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', paddingTop: 8, cursor: 'auto' }}>
          {children}
        </div>
      </ExpandVisibility>
    </div>
  )
}

/** DisplayModeOption — 行内边距 10×4, bodyLarge (选中 primary), 可选副标题 bodySmall, 选中尾随 Check 20 primary */
export function DisplayModeOption({ label, subtitle, selected, onClick }: { label: string; subtitle?: string; selected: boolean; onClick: () => void }) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => onActivateKey(e, onClick)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', cursor: 'pointer' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-body-large" style={{ color: selected ? 'var(--md-primary)' : 'var(--md-on-surface)' }}>{label}</div>
        {subtitle ? <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{subtitle}</div> : null}
      </div>
      {selected && <CheckIcon />}
    </div>
  )
}

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
 * 布局高: minimumInteractiveComponentSize 把 Switch 撑到 48 (上下各留 8); compact = heightIn(max = 32)。
 */
export function Switch({
  checked, onChange, uncheckedTrack = 'var(--md-surface-container-highest)', compact = false,
}: { checked: boolean; onChange: (v: boolean) => void; uncheckedTrack?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 52, height: 32, margin: compact ? 0 : '8px 0', borderRadius: 16, border: 'none', padding: 0,
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
