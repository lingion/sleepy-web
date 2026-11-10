import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { toolbarLayout } from './toolbarLayout'

export function ScheduleToolbar({ children, onGroupedChange }: { children: ReactNode; onGroupedChange?: (grouped: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current!
    const measure = () => {
      const [start, center, end] = Array.from(root.children) as HTMLElement[]
      if (!start || !center || !end) return
      const tight = (el: HTMLElement) => Array.from(el.children).reduce((sum, c) => sum + (c as HTMLElement).offsetWidth, 0)
      const natural = (el:HTMLElement)=>tight(el)+Math.max(0,el.children.length-1)*8
      const text=center.querySelector<HTMLElement>('[data-week-text]')?.offsetWidth ?? 48
      const centerWidth=96+16+28+text
      const layout = toolbarLayout(root.clientWidth, natural(start), natural(end), centerWidth,64+2+16+text,tight(start),tight(end))
      root.dataset.grouped = String(layout.grouped)
      onGroupedChange?.(layout.grouped)
      root.style.setProperty('--toolbar-inset', `${layout.inset}px`)
      root.style.setProperty('--toolbar-gap', `${layout.internal}px`)
      root.style.setProperty('--toolbar-side-scale', String(layout.sideScale * layout.fitScale))
      root.style.setProperty('--toolbar-fit-scale', String(layout.fitScale))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    const mutations = new MutationObserver(measure)
    mutations.observe(root, { childList: true, subtree: true, characterData: true })
    measure()
    document.fonts?.ready.then(measure)
    return () => { ro.disconnect(); mutations.disconnect() }
  }, [onGroupedChange])
  return <div ref={ref} className="schedule-toolbar">{children}</div>
}
