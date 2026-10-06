/**
 * DialogActionButtons — ui/component/DialogActionButtons.kt 1:1。
 * 全 app 弹窗 confirm/dismiss 唯一入口 (2026-09-16 用户: 裸 TextButton 无边界
 * 无色块): 确认键 primary 色块 / 取消 secondaryContainer / destructive errorContainer,
 * 高度 SleepyTheme.Buttons.regularHeight(48) 圆角 large(16)。
 * 布局自适应 (DialogButtonsLayoutPolicy): 按估算文字宽 (字符数×14 + 32 padding,
 * 间隙 8) 判断行宽够不够 → 够=横排按必需宽比例分权重, 不够=整组竖排全宽, 禁截断。
 */

import { useLayoutEffect, useRef, useState } from 'react'

const BUTTON_H_PADDING = 32
const ROW_GAP = 8
const FONT_DP_PER_CHAR = 14

function buttonTextWidth(label: string): number {
  return label.length * FONT_DP_PER_CHAR + BUTTON_H_PADDING
}

export function DialogActionButtons({
  confirmText, onConfirm, dismissText, onDismiss, thirdText, onThird,
  destructive = false, thirdDestructive = false, confirmEnabled = true,
}: {
  confirmText: string
  onConfirm: () => void
  dismissText?: string
  onDismiss?: () => void
  thirdText?: string
  onThird?: () => void
  destructive?: boolean
  thirdDestructive?: boolean
  confirmEnabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const labels = [dismissText, thirdText, confirmText].filter((x): x is string => x != null)
  const totalNeeded = labels.reduce((s, l) => s + buttonTextWidth(l), 0) + (labels.length - 1) * ROW_GAP
  const horizontal = width === 0 || totalNeeded <= width
  const weights = (() => {
    const ws = labels.map(buttonTextWidth)
    const sum = ws.reduce((a, b) => a + b, 0)
    return sum > 0 ? ws.map((w) => w / sum) : ws.map(() => 1 / ws.length)
  })()

  let wi = 0
  const flexOf = () => {
    if (!horizontal) return undefined
    const w = weights[wi] ?? 1
    wi += 1
    return { flex: `${w} 1 0%`, minWidth: 0 } as React.CSSProperties
  }

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: horizontal ? 'row' : 'column',
        gap: ROW_GAP,
      }}
    >
      {dismissText != null && (
        <BlockButton texts={dismissText} onClick={onDismiss ?? (() => {})}
          container="var(--md-secondary-container)" content="var(--md-on-secondary-container)"
          style={flexOf()} />
      )}
      {thirdText != null && (
        <BlockButton texts={thirdText} onClick={onThird ?? (() => {})}
          container={thirdDestructive ? 'var(--md-error-container)' : 'var(--md-secondary-container)'}
          content={thirdDestructive ? 'var(--md-on-error-container)' : 'var(--md-on-secondary-container)'}
          style={flexOf()} />
      )}
      <BlockButton texts={confirmText} onClick={onConfirm} enabled={confirmEnabled}
        container={destructive ? 'var(--md-error-container)' : 'var(--md-primary)'}
        content={destructive ? 'var(--md-on-error-container)' : 'var(--md-on-primary)'}
        style={flexOf()} />
    </div>
  )
}

function BlockButton({
  texts, onClick, container, content, enabled = true, style,
}: {
  texts: string
  onClick: () => void
  container: string
  content: string
  enabled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className="m3-label-large"
      style={{
        height: 48, borderRadius: 16, border: 'none',
        cursor: enabled ? 'pointer' : 'not-allowed',
        background: enabled ? container : 'var(--md-on-surface)',
        color: enabled ? content : 'var(--md-on-surface)',
        opacity: enabled ? 1 : 0.12,
        fontWeight: 500, whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px', ...style,
      }}
    >
      {texts}
    </button>
  )
}
