/**
 * AlertDialog — material3 AlertDialog(confirmButton = {}, text = { … DialogActionButtons }) 形态。
 * 容器 surfaceContainerHigh、shapes.extraLarge(28)、内边距 24、宽 280–560;
 * 标题 headlineSmall onSurface + 下距 16; 正文区 bodyMedium onSurfaceVariant + 下距 24
 * (TextPadding; 空 buttons 行高 0, 故正文末尾到卡底 = 24 + 24)。点遮罩 = onDismissRequest。
 */

import type { ReactNode } from 'react'

export function AlertDialog({ title, onDismiss, children }: { title: string; onDismiss: () => void; children: ReactNode }) {
  return (
    <div
      className="m3-scrim-overlay"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          minWidth: 280, maxWidth: 560, width: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
          padding: 24, borderRadius: 28, background: 'var(--md-surface-container-high)',
        }}
      >
        <div className="m3-headline-small" style={{ color: 'var(--md-on-surface)', paddingBottom: 16 }}>{title}</div>
        <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', paddingBottom: 24 }}>{children}</div>
      </div>
    </div>
  )
}
