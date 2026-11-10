import { useRef, useState, type KeyboardEvent } from 'react'
import { haptic } from './glass/physics'
import {useGlassLens} from './glass/useGlassLens'
import './IntRangeSlider.css'

/** Two independent ghost handles: moving one endpoint never moves the other. */
export function IntRangeSlider({ label, min = 1, max, start, end, initialStart, initialEnd, onChange }: {
  label: string; min?: number; max: number; start: number; end: number; initialStart?: number; initialEnd?: number; onChange: (start: number, end: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useRef<'start' | 'end' | null>(null)
  const startThumb=useRef<HTMLSpanElement>(null),endThumb=useRef<HTMLSpanElement>(null)
  const startLens=useGlassLens(startThumb,{kind:'slider',index:(start-min)/Math.max(1,max-min)}),endLens=useGlassLens(endThumb,{kind:'slider',index:(end-min)/Math.max(1,max-min)})
  const release=()=>{startLens.release();endLens.release();active.current=null;setHeld(null)}
  const [held, setHeld] = useState<'start' | 'end' | null>(null)
  const values = useRef({ start, end })
  values.current = { start, end }
  const percent = (v: number) => `${(v - min) / Math.max(1, max - min) * 100}%`
  const ghostStart = Math.max(min, Math.min(max, initialStart ?? min))
  const ghostEnd = Math.max(ghostStart, Math.min(max, initialEnd ?? min))
  const ghost = initialStart !== undefined && initialEnd !== undefined && (ghostStart !== start || ghostEnd !== end)
  const change = (endpoint: 'start' | 'end', value: number) => {
    const current = values.current
    const a = endpoint === 'start' ? Math.max(min, Math.min(current.end, value)) : current.start
    const b = endpoint === 'end' ? Math.min(max, Math.max(current.start, value)) : current.end
    if (a !== current.start || b !== current.end) { values.current = { start: a, end: b }; haptic(); onChange(a, b) }
  }
  const key = (e: KeyboardEvent, endpoint: 'start' | 'end') => {
    let value = values.current[endpoint]
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') value++
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') value--
    else if (e.key === 'Home') value = min
    else if (e.key === 'End') value = max
    else return
    e.preventDefault(); change(endpoint, value)
  }
  return <div className="range-field">
    <div className="m3-label-large">{label}</div>
    <div ref={ref} className="int-range" data-held={held ?? ''} data-glass-motion="off"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const r = ref.current!.getBoundingClientRect()
        const value = min + (e.clientX - r.left) / r.width * (max - min)
        active.current = (e.target as HTMLElement).dataset.endpoint as 'start' | 'end' || (Math.abs(value - start) <= Math.abs(value - end) ? 'start' : 'end')
        setHeld(active.current); (active.current==='start'?startLens:endLens).press(e.clientX,e.clientY); e.currentTarget.setPointerCapture?.(e.pointerId)
        change(active.current, Math.round(value))
      }}
      onPointerMove={(e) => { if (!active.current) return; (active.current==='start'?startLens:endLens).move(e.clientX,e.clientY); const r = ref.current!.getBoundingClientRect(); change(active.current, Math.round(min + (e.clientX - r.left) / r.width * (max - min))) }}
      onPointerUp={release} onPointerCancel={release}>
      <span className="int-range-track" />
      {ghost && <span aria-hidden data-range-ghost className="int-range-ghost">
        <span className="int-range-fill" style={{ left: percent(ghostStart), right: percent(max - ghostEnd + min) }} />
        <span className="int-range-thumb" style={{ left: percent(ghostStart) }} />
        <span className="int-range-thumb" style={{ left: percent(ghostEnd) }} />
      </span>}
      <span className="int-range-fill" style={{ left: percent(start), right: percent(max - end + min) }} />
      {(['start', 'end'] as const).map((endpoint) => <span ref={endpoint==='start'?startThumb:endThumb} key={endpoint} role="slider" tabIndex={0} data-endpoint={endpoint}
        aria-label={`${label} ${endpoint === 'start' ? '开始' : '结束'}`} aria-valuemin={endpoint === 'end' ? start : min} aria-valuemax={endpoint === 'start' ? end : max} aria-valuenow={endpoint === 'start' ? start : end}
        onKeyDown={(e) => key(e, endpoint)} className="int-range-thumb" style={{ left: percent(endpoint === 'start' ? start : end) }}>
        <span>{endpoint === 'start' ? start : end}</span>
      </span>)}
    </div>
  </div>
}
