/**
 * FilledTextField — M3 TextField + SleepyTheme.fieldShape(12) + fieldColors() 同构。
 * 容器 surfaceContainerHighest、无指示线; 标签浮于框内 (空且未聚焦=居中 bodyLarge,
 * 否则顶部 bodySmall), 标签色 onSurfaceVariant / 聚焦 primary / isError error。
 */

import { useState, type CSSProperties } from 'react'

export function FilledTextField({
  label, value, onChange, isError = false, inputMode, readOnly = false, style,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  isError?: boolean
  inputMode?: 'text' | 'numeric'
  /** enabled = false + fieldColors (disabled 色与常态同值): 不可聚焦、不可输入 */
  readOnly?: boolean
  style?: CSSProperties
}) {
  const [focusedState, setFocused] = useState(false)
  const focused = focusedState && !readOnly
  const floated = focused || value !== ''
  const labelColor = isError ? 'var(--md-error)' : focused ? 'var(--md-primary)' : 'var(--md-on-surface-variant)'
  return (
    <label
      style={{
        position: 'relative', display: 'block', height: 56, borderRadius: 12,
        background: 'var(--md-surface-container-highest)',
        // M3 errorIndicatorColor: fieldColors 只把常态/聚焦指示线设透明, 错误态仍画 error 底线
        boxShadow: isError ? `inset 0 -${focused ? 2 : 1}px 0 var(--md-error)` : undefined,
        ...style,
      }}
    >
      <span
        className={floated ? 'm3-body-small' : 'm3-body-large'}
        style={{
          position: 'absolute', left: 16, right: 16, top: floated ? 8 : 16, color: labelColor,
          pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'top 150ms ease, font-size 150ms ease, line-height 150ms ease',
        }}
      >
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="m3-body-large"
        style={{
          display: 'block', width: '100%', height: '100%', boxSizing: 'border-box',
          padding: '24px 16px 8px', border: 'none', outline: 'none', background: 'transparent',
          cursor: readOnly ? 'pointer' : undefined,
          fontFamily: 'inherit', color: 'var(--md-on-surface)', caretColor: isError ? 'var(--md-error)' : 'var(--md-primary)',
        }}
      />
    </label>
  )
}
