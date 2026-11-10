import { forwardRef, useRef, useState } from 'react'
import { haptic } from './physics'

type Item = { key: string; label: string; icon: (p: { size?: number }) => JSX.Element }
export const GlassNavigation = forwardRef<HTMLElement, { items: Item[]; current: string; dock: boolean; onSelect: (key: string) => void }>(function GlassNavigation({ items, current, dock, onSelect }, ref) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState(false)
  const last = useRef(current)
  const selectAt = (x: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return
    const item = items[Math.max(0, Math.min(items.length - 1, Math.floor((x - r.left) / r.width * items.length)))]
    if (item.key !== last.current) { last.current = item.key; haptic(); onSelect(item.key) }
  }
  return <nav ref={ref} className={`app-navigation ${dock ? 'is-dock' : ''}`} aria-label="主导航">
    <div ref={trackRef} className="navigation-track" data-held={held}
      onPointerDown={(e) => { if (e.button !== 0) return; setHeld(true); last.current = current; e.currentTarget.setPointerCapture?.(e.pointerId); selectAt(e.clientX) }}
      onPointerMove={(e) => { if (held) selectAt(e.clientX) }}
      onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)}>
      <span aria-hidden className="navigation-lens" style={{ left: `calc(${items.findIndex((item) => item.key === current)} * (100% - 16px) / ${items.length} + 8px)`, width: `calc((100% - 16px) / ${items.length})` }} />
      {items.map(({ key, label, icon: Icon }) => <button key={key} data-tab={key} aria-current={current === key ? 'page' : undefined} onClick={() => onSelect(key)}>
        <span className="navigation-icon"><Icon size={24} /></span>
        <span className="m3-label-small">{label}</span>
      </button>)}
    </div>
  </nav>
})
