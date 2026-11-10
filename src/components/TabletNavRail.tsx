/**
 * 平板宽屏 NavigationRail — SleepyNavHost.kt:519-600 + CombinedRailItem/PlainRailItem 1:1。
 * 三槽位 (Today/Manage/Mine, Tab 枚举序): 当前右栏 tab 与 Schedule 组合成"跑道胶囊"
 * (56 宽 × 上下两半图标 + 中线, 选中整组强高亮 primaryContainer), 其余两个是
 * 标准 NavigationRailItem 风格单图标+label。
 * 底栏契约 (App.test.tsx): 页面内 <nav> 数 = 底栏数 → 本组件不用 nav 标签。
 */

import { IconCalendarMonth, IconToday, IconSettings, IconPerson } from './startupIcons'

export type RailTab = 'today' | 'manage' | 'mine'

const RAIL_ICONS: Record<RailTab, (p: { size?: number; color?: string }) => JSX.Element> = {
  today: IconToday,
  manage: IconSettings,
  mine: IconPerson,
}

/** 跑道胶囊 (CombinedRailItem): 上=课表图标, 下=从 tab 图标, 中线分隔; 整组选中强高亮 */
function CombinedRailItem({
  selected,
  tab,
  label,
  onClick,
}: {
  selected: boolean
  tab: RailTab
  label: string
  onClick: () => void
}) {
  const Icon = RAIL_ICONS[tab]
  const iconColor = selected ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)'
  return (
    <button data-glass-plain
      type="button"
      onClick={onClick}
      aria-label={`课表·${label}`}
      aria-current={selected ? 'page' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 8px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 56,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderRadius: 999,
          padding: '4px 0',
          background: selected ? 'var(--md-primary-container)' : 'transparent',
          transition: 'background 120ms',
        }}
      >
        <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IconCalendarMonth size={22} color={iconColor} />
        </span>
        {/* 中线 hairline (HorizontalDivider 0.5dp, 左右 inset 10) */}
        <span
          style={{
            width: 36,
            height: 0.5,
            background: 'color-mix(in srgb, var(--md-on-surface-variant) 12%, transparent)',
          }}
        />
        <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} color={iconColor} />
        </span>
      </span>
    </button>
  )
}

/** 普通 rail 项 (PlainRailItem ≈ NavigationRailItem): 图标 pill + label */
function PlainRailItem({
  selected,
  tab,
  label,
  onClick,
}: {
  selected: boolean
  tab: RailTab
  label: string
  onClick: () => void
}) {
  const Icon = RAIL_ICONS[tab]
  return (
    <button data-glass-plain
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={selected ? 'page' : undefined}
      style={{
        width: 76,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '4px 0 8px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: selected ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)',
      }}
    >
      <span
        style={{
          width: 56,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 16,
          background: selected ? 'var(--md-secondary-container)' : 'transparent',
        }}
      >
        <Icon size={24} />
      </span>
      <span className="m3-label-small" style={{ fontWeight: selected ? 600 : 500 }}>
        {label}
      </span>
    </button>
  )
}

/**
 * 宽屏左缘 Rail (NavigationRail 80dp 同构): 槽位顺序恒为 Today/Manage/Mine,
 * effectiveRightTab 所在槽渲染跑道胶囊 (选中), 其余普通项。
 */
export function TabletNavRail({
  current,
  labels,
  onSelect,
}: {
  current: RailTab
  labels: Record<RailTab, string>
  onSelect: (tab: RailTab) => void
}) {
  const order: RailTab[] = ['today', 'manage', 'mine']
  return (
    <aside
      aria-label="导航栏"
      style={{
        width: 80,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 4,
        background: 'var(--md-surface-container)',
      }}
    >
      {order.map((key) =>
        key === current ? (
          <CombinedRailItem
            key={key}
            selected
            tab={key}
            label={labels[key]}
            onClick={() => onSelect(key)}
          />
        ) : (
          <PlainRailItem
            key={key}
            selected={false}
            tab={key}
            label={labels[key]}
            onClick={() => onSelect(key)}
          />
        ),
      )}
    </aside>
  )
}
