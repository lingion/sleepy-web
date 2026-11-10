import { useEffect } from 'react'
import { GlassPressMotion, haptic } from './physics'

/** One delegated driver also covers controls inside dialogs, portals and settings pages. */
export function GlassControls({ style }: { style: 'classic' | 'liquid_glass' }) {
  useEffect(() => {
    document.documentElement.dataset.uiStyle = style
    if (style !== 'liquid_glass') return
    const enhanced = new Map<HTMLElement,string>()
    const enhance = (el:HTMLElement) => {
      if(!el.matches('button,[data-glass-control]')) return
      if(el.hasAttribute('data-glass-plain') || el.closest('[data-glass-motion="off"]')) return
      const signature=el.style.background+'|'+el.style.backgroundColor+'|'+[...el.classList].filter(name=>name!=='glass-control' && name!=='glass-moving').join(' ')
      if(enhanced.get(el)===signature) return
      el.classList.remove('glass-control')
      const computed=getComputedStyle(el)
      const background=computed.backgroundColor
      const transparent=background==='transparent' || /rgba\([^)]*,\s*0\)/.test(background)
      el.style.setProperty('--glass-control-tint',transparent ? 'var(--glass-tint)' : `color-mix(in srgb, ${background} 92%, transparent)`)
      if(computed.position==='static') el.dataset.glassStatic='true'
      el.classList.add('glass-control')
      enhanced.set(el,signature)
    }
    const scan=(node:Node)=>{if(!(node instanceof Element))return;if(node.matches('button,[data-glass-control]'))enhance(node as HTMLElement);node.querySelectorAll<HTMLElement>('button,[data-glass-control]').forEach(enhance)}
    scan(document.body)
    const observer=new MutationObserver(records=>{for(const record of records) {if(record.target===document.documentElement){for(const el of [...enhanced.keys()]){enhanced.delete(el);if(el.isConnected)enhance(el)}}else if(record.type==='attributes')enhance(record.target as HTMLElement);else {record.addedNodes.forEach(scan);if(record.removedNodes.length)for(const el of enhanced.keys())if(!el.isConnected)enhanced.delete(el)}}})
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']})
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']})
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const motions = new Map<HTMLElement, GlassPressMotion>()
    const pointers = new Map<number, { element: HTMLElement; x: number; y: number; side: number }>()
    let frame = 0
    let last = 0
    function render(now: number) {
      const dt = last ? (now - last) / 1000 : 1 / 60
      last = now
      for (const [el, motion] of motions) {
        motion.tick(dt)
        const lift = Math.max(0, Math.min(1.08, motion.lift.value))
        el.style.setProperty('--glass-lift', String(lift))
        el.style.setProperty('--glass-x', `${motion.x.value}px`)
        el.style.setProperty('--glass-y', `${motion.y.value}px`)
        el.style.setProperty('--glass-stretch', String(Math.min(.12, Math.abs(motion.x.velocity + motion.y.velocity) / 1200)))
        if (!motion.running && !motion.held) {
          el.classList.remove('glass-moving')
          motions.delete(el)
        }
      }
      frame = motions.size ? requestAnimationFrame(render) : 0
      if (!frame) last = 0
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return
      const el = e.target.closest<HTMLElement>('button, [role="switch"], [data-glass-control]')
      if (!el || el.hasAttribute('data-glass-plain') || el.matches(':disabled, [aria-disabled="true"]') || el.closest('[data-glass-motion="off"]')) return
      enhance(el)
      const rect = el.getBoundingClientRect()
      const motion = motions.get(el) ?? new GlassPressMotion()
      pointers.set(e.pointerId, { element: el, x: e.clientX, y: e.clientY, side: Math.min(rect.width, rect.height) })
      motion.press()
      motions.set(el, motion)
      el.classList.add('glass-control', 'glass-moving')
      haptic()
      if (!reduced && !frame) frame = requestAnimationFrame(render)
    }
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (p && !reduced) motions.get(p.element)?.drag(e.clientX - p.x, e.clientY - p.y, p.side)
    }
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      pointers.delete(e.pointerId)
      motions.get(p.element)?.release()
      if (reduced) { p.element.classList.remove('glass-moving'); motions.delete(p.element) }
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    return () => {
      observer.disconnect()
      for(const el of enhanced.keys()){el.classList.remove('glass-control','glass-moving');el.style.removeProperty('--glass-control-tint');delete el.dataset.glassStatic}
      cancelAnimationFrame(frame)
      for (const el of motions.keys()) {
        el.classList.remove('glass-moving')
        for (const name of ['--glass-lift', '--glass-x', '--glass-y', '--glass-stretch']) el.style.removeProperty(name)
      }
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
    }
  }, [style])
  return null
}
