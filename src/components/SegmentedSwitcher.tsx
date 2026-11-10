/**
 * SegmentedSwitcher — ui/component/SegmentedSwitcher.kt 1:1。
 * 容器 高 42 (调用方 height 覆盖) r14 内边距 4, 底色默认 surfaceContainer (嵌 surfaceContainer 卡时传
 * containerColor=surfaceContainerHighest 降一级); 单个 thumb (secondaryContainer r12) 在轨道上滑动
 * (SleepyThumbSpring NoBouncy/StiffnessHigh ≈150ms 收束); 字 labelLarge, 选中 SemiBold onSecondaryContainer,
 * 其余 Medium onSurfaceVariant, thumb 越过段中点即换色 (thumbXState 取整同语义)。
 * 宽: 默认撑满 (各调用点 fillMaxWidth); fit = SettingsFlatCard 测宽 n × (最宽段 SemiBold 字宽 + 32) + 8。
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

import {useGlassLens} from './glass/useGlassLens'
import {haptic} from './glass/physics'
import {LensLabels} from './glass/LensLabels'

const THUMB_TRANSITION = '150ms cubic-bezier(0.2, 0, 0, 1)'

export function SegmentedSwitcher({
  options, selected, onSelect, containerColor, height = 42, fit = false, style,
}: {
  options: string[]
  selected: number
  onSelect: (index: number) => void
  containerColor?: string
  height?: number
  fit?: boolean
  style?: CSSProperties
}) {
  const [held, setHeld] = useState(false)
  const lastSelected=useRef(selected)
  lastSelected.current=selected
  const dragSelect = (x: number) => { const r = rootRef.current?.getBoundingClientRect(); if (r && r.width > 0) {const next=Math.max(0, Math.min(options.length-1,Math.floor((x-r.left)/r.width*options.length)));if(next!==lastSelected.current){lastSelected.current=next;haptic();onSelect(next)}} }
  const count = Math.max(1, options.length)
  const index = Math.min(Math.max(0, selected), count - 1)
  const rootRef = useRef<HTMLDivElement>(null)
  const lens=useGlassLens(rootRef,{kind:'segment',index,count,inset:4,onSelect})
  const segmentWidth = useMeasuredSegmentWidth(rootRef, fit ? options : null)
  const width = fit ? (segmentWidth === null ? 'max-content' : segmentWidth * count + 8) : '100%'

  return (
    <div
      ref={rootRef}
      className="segmented-track" data-glass-motion="off"
      data-held={held}
      onPointerDown={(e) => { if (e.button !== 0) return; setHeld(true);lens.press(e.clientX,e.clientY); e.currentTarget.setPointerCapture?.(e.pointerId); if(document.documentElement.dataset.uiStyle!=='liquid_glass')dragSelect(e.clientX) }}
      onPointerMove={(e) => { if (held) {if(document.documentElement.dataset.uiStyle!=='liquid_glass')dragSelect(e.clientX);lens.move(e.clientX,e.clientY)} }}
      onPointerUp={() => {setHeld(false);lens.release()}} onPointerCancel={() => {setHeld(false);lens.release(true)}}
      style={{
        '--segment-backing':containerColor,
        position: 'relative', display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr',
        width, height, flexShrink: 0, boxSizing: 'border-box', padding: 4, borderRadius: 14,
        background: containerColor ?? 'var(--md-surface-container)',
        ...style,
      } as CSSProperties}
    >
        <div
        aria-hidden
        className="segment-lens"
        style={{
          position: 'absolute', top: 4, bottom: 4, borderRadius: 12, background: 'var(--md-secondary-container)',
          left: `calc(4px + var(--lens-position,${index}) * (100% - 8px) / ${count})`, width: `calc((100% - 8px) / ${count})`,
          transition: `left ${THUMB_TRANSITION}`,
        }}
      />
      {options.map((label, i) => {
        const sel = i === index
        return (
          <button
            key={i}
            type="button"
            aria-pressed={sel}
            onClick={() => lens.click(i)}
            className="m3-label-large segment-button"
            style={{
              position: 'relative', minWidth: 0, padding: fit && segmentWidth === null ? '0 16px' : 0,
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              fontWeight: sel ? 600 : 500,
              color: sel ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
              transition: `color ${THUMB_TRANSITION}`,
            }}
          >
            <span className="semantic-destination">{label}</span>
          </button>
        )
      })}
      <LensLabels>{options.map((label,i)=><span key={i} className="glass-label-seat glass-label-copy m3-label-large" data-selected={i===index} data-label={label}/>)}</LensLabels>
    </div>
  )
}

/** TextMeasurer 同位: 以 SemiBold labelLarge 实测最宽段 (+32 段内边距); 选中态字重变化不改宽; 测不到 (无布局) 返回 null */
function useMeasuredSegmentWidth(rootRef: RefObject<HTMLDivElement | null>, labels: string[] | null): number | null {
  const [width, setWidth] = useState<number | null>(null)
  const key = labels === null ? null : JSON.stringify(labels)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (key === null || root === null) return
    const texts = JSON.parse(key) as string[]
    let cancelled = false
    const measure = () => {
      if (cancelled) return
      const probe = document.createElement('span')
      probe.className = 'm3-label-large'
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:600;left:0;top:0'
      root.appendChild(probe)
      let max = 0
      for (const text of texts) {
        probe.textContent = text
        max = Math.max(max, probe.getBoundingClientRect().width)
      }
      probe.remove()
      setWidth(max > 0 ? Math.ceil(max) + 32 : null)
    }
    measure()
    void document.fonts?.ready.then(measure)
    return () => {
      cancelled = true
    }
  }, [rootRef, key])
  return width
}
