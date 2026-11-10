/**
 * AlertDialog — material3 AlertDialog 形态。
 * 容器 surfaceContainerHigh、shapes.extraLarge(28)、内边距 24、宽 280–560;
 * 标题 headlineSmall onSurface + 下距 16; 正文区 bodyMedium onSurfaceVariant + 下距 24 (TextPadding)。
 * buttons = confirmButton/dismissButton 槽: 右对齐 FlowRow (主轴间距 8, 换行间距 12);
 * 不传 = confirmButton = {} + 正文内 DialogActionButtons 写法 (空 buttons 行高 0, 正文末尾到卡底 24 + 24)。
 * 点遮罩 = onDismissRequest。
 */

import { useEffect, useRef, type ReactNode } from 'react'

export type OverlayGlassRole = 'regular' | 'tinted' | 'pill' | 'menu' | 'alert' | false

export function AlertDialog({ title, onDismiss, children, buttons, glassRole = 'alert' }: { title: string; onDismiss: () => void; children: ReactNode; buttons?: ReactNode; glassRole?: OverlayGlassRole }) {
  const dialog=useRef<HTMLDivElement>(null)
  const dismiss=useRef(onDismiss)
  dismiss.current=onDismiss
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null
    dialog.current?.focus()
    const escape=(event:KeyboardEvent)=>{ if(event.key==='Escape' && dialog.current?.contains(document.activeElement)) { event.preventDefault();event.stopPropagation();dismiss.current() } }
    document.addEventListener('keydown',escape)
    return ()=>{document.removeEventListener('keydown',escape);previous?.focus()}
  },[])
  return (
    <div
      className="m3-scrim-overlay"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        role="dialog"
        data-glass-role={glassRole || undefined}
        data-glass-motion={glassRole ? 'static' : undefined}
        data-glass-plain={glassRole === false ? true : undefined}
        ref={dialog}
        tabIndex={-1}
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          minWidth: 0, maxWidth: 560, width: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
          padding: 24, borderRadius: 28, background: 'var(--md-surface-container-high)',
        }}
      >
        <div className="m3-headline-small" style={{ color: 'var(--md-on-surface)', paddingBottom: 16 }}>{title}</div>
        <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', paddingBottom: 24 }}>{children}</div>
        {buttons !== undefined && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 8, rowGap: 12 }}>{buttons}</div>
        )}
      </div>
    </div>
  )
}

/** M3 TextButton — 最小 58×40, 内边距 12×8, 全圆角, labelLarge primary */
export function TextButton({ label, onClick, glassRole = 'regular' }: { label: string; onClick: () => void; glassRole?: 'regular' | false }) {
  return (
    <button
      type="button"
      data-glass-role={glassRole || undefined}
      data-glass-plain={glassRole === false ? true : undefined}
      onClick={onClick}
      className="m3-label-large"
      style={{
        minWidth: 58, minHeight: 40, padding: '8px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
        background: 'transparent', color: 'var(--md-primary)', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
