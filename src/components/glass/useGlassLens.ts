import { useEffect, useRef, type RefObject } from 'react'
import { GlassControlMotion, GlassPressMotion, haptic, rubberBand } from './physics'
import { installLensOptics } from './optics'

type LensKind = 'segment' | 'dock' | 'switch' | 'slider'
interface Selection {
  enabled?: boolean
  kind?: LensKind
  index: number
  count?: number
  inset?: number
  onSelect?: (index: number) => void
}
export function lensGeometry(kind: LensKind, width: number, height: number, count: number, position: number, lift: number, stretch: number) {
  let pitch = (width - 8) / count, inset = 4, baseWidth = pitch, w: number, h: number, center: number
  if (kind === 'dock') {
    const span = width - 8
    pitch = (span - 8) / count
    baseWidth = pitch + 8
    if (baseWidth < 84 && count > 1) {
      baseWidth = Math.min(84, span)
      pitch = (span - baseWidth) / (count - 1)
      inset = 4 + (baseWidth - pitch) / 2
    } else inset = 8
    w = (baseWidth + 16 * lift) * (1 + stretch)
    h = (height - 8 + 16 * lift) * (1 - stretch * 1.35)
    center = inset + (position + .5) * pitch
  } else if (kind === 'switch') {
    w = (37 + 16 * lift) * (1 + .2 * lift) * (1 + stretch)
    h = Math.max(24 + 6 * lift, (24 + 6 * lift) * (1 + .2 * lift) * (1 - stretch * 1.35))
    center = width / 2 + (position - .5) * 22
  } else if (kind === 'slider') {
    w = (16 + 12 * lift) * (1 + stretch)
    h = (24 + 16 * lift) * (1 - stretch * 1.35)
    center = width / 2
  } else {
    w = (pitch + 16 * lift) * (1 + stretch)
    h = Math.max(height - 8 + 10 * lift, (height - 8 + 18 * lift) * (1 - stretch * 1.35))
    center = inset + (position + .5) * pitch
  }
  return { left: center - w / 2, top: (height - h) / 2, width: w, height: h, pitch, inset }
}
function holePath(width: number, height: number, x: number, y: number, w: number, h: number) {
  const r = Math.min(w, h) / 2
  return `M -100 -100 H ${width + 100} V ${height + 100} H -100 Z M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
}

/** Independent backing and glyph lenses; neither samples its own replay. */
export function useGlassLens(track: RefObject<HTMLElement | null>, selection?: Selection) {
  const config = useRef(selection); config.current = selection
  const motion = useRef(new GlassControlMotion(selection?.index ?? 0))
  const pull = useRef(new GlassPressMotion())
  const origin = useRef({ x: 0, y: 0, side: 32, index: 0, dragging: false })
  const candidate = useRef(Math.round(selection?.index ?? 0))
  const optical = useRef<ReturnType<typeof installLensOptics>[]>([])
  const frame = useRef(0), previous = useRef(0), suppressClick = useRef(0)
  const kind = () => config.current?.kind ?? (track.current?.classList.contains('navigation-track') ? 'dock'
    : track.current?.classList.contains('segmented-track') || config.current?.count && config.current.kind !== 'switch' ? 'segment'
      : track.current?.classList.contains('switch-track') ? 'switch' : 'slider')
  const isGlass = () => config.current?.enabled !== false && document.documentElement.dataset.uiStyle === 'liquid_glass'
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const paint = () => {
    const el = track.current
    if (!el) return
    const m = motion.current, k = kind(), c = config.current
    const bounds=el.getBoundingClientRect()
    const rootW = el.offsetWidth || bounds.width || 16, rootH = el.offsetHeight || bounds.height || 24
    const g = lensGeometry(k, rootW, rootH, c?.count ?? 1, m.position.value, m.lift, m.stretch)
    el.style.setProperty('--lens-lift', String(m.lift))
    el.style.setProperty('--lens-position', String(m.position.value))
    el.style.setProperty('--lens-stretch', String(m.stretch))
    el.style.setProperty('--lens-y', `${pull.current.y.value}px`)
    el.style.setProperty('--lens-x', `${pull.current.x.value}px`)
    el.style.setProperty('--lens-width', `${g.width}px`)
    el.style.setProperty('--lens-height', `${g.height}px`)
    el.style.setProperty('--lens-top', `${g.top + pull.current.y.value}px`)
    el.style.setProperty('--lens-left', `${g.left}px`)
    el.style.setProperty('--source-width', `${rootW}px`)
    el.style.setProperty('--source-height', `${rootH}px`)
    el.style.setProperty('--seat-pitch', `${g.pitch}px`)
    el.style.setProperty('--seat-inset', `${g.inset}px`)
    el.dataset.lensRaised = String(m.lift > .001)
    const outside = el.querySelector<HTMLElement>('.glass-destinations')
    if (outside) outside.style.clipPath = m.lift > .001 || k === 'dock'
      ? `path(evenodd, "${holePath(rootW, rootH, g.left, g.top + pull.current.y.value, g.width, g.height)}")` : ''
    for (const optics of optical.current) optics.update(m.lift)
  }
  const render = (now: number) => {
    const dt = previous.current ? (now - previous.current) / 1000 : 1 / 60
    previous.current = now
    motion.current.tick(dt); pull.current.tick(dt); paint()
    if (motion.current.running || pull.current.running) frame.current = requestAnimationFrame(render)
    else { frame.current = 0; previous.current = 0 }
  }
  const start = () => {
    if (reduced()) { motion.current.finish(); pull.current.finish(); paint(); return }
    if (!frame.current) frame.current = requestAnimationFrame(render)
  }
  const targetAt = (x: number) => {
    const c = config.current, el = track.current
    if (!c?.count || !el || kind() === 'switch') return motion.current.position.target
    const r = el.getBoundingClientRect()
    const width=el.offsetWidth || r.width, height=el.offsetHeight || r.height
    const g = lensGeometry(kind(), width, height, c.count, 0, 0, 0)
    const scale = r.width / width
    const raw = ((x - r.left) / scale - g.inset) / g.pitch - .5
    return kind() === 'dock' ? raw < 0 ? rubberBand(raw, .35) : raw > c.count - 1 ? c.count - 1 + rubberBand(raw - c.count + 1, .35) : raw
      : Math.max(0, Math.min(c.count - 1, raw))
  }
  const press = (x: number, y: number) => {
    if (!isGlass()) return
    const m = motion.current
    origin.current = { x, y, side: track.current?.offsetHeight || track.current?.getBoundingClientRect().height || 32, index: m.position.value, dragging: false }
    candidate.current = config.current?.count && kind() !== 'switch' ? Math.max(0,Math.min(config.current.count-1,Math.round(targetAt(x)))) : Math.round(config.current?.index ?? m.position.value)
    suppressClick.current = 0
    const target = kind() === 'dock' ? Math.round(targetAt(x)) : m.position.target
    m.update(target, true, false); pull.current.press(); haptic(); start()
  }
  const move = (x: number, y: number) => {
    const m = motion.current
    if (!m.pressed) return
    const o = origin.current
    pull.current.drag(config.current ? 0 : x-o.x, y - o.y, o.side)
    if (Math.abs(x - o.x) > 4) o.dragging = true
    if (o.dragging && config.current?.onSelect) {
      const target = kind() === 'switch' ? Math.max(0,Math.min(1,o.index + (x-o.x)/22)) : targetAt(x)
      const next = Math.max(0, Math.min((config.current.count ?? 1) - 1, Math.round(target)))
      if (next !== candidate.current) { candidate.current = next; haptic() }
      m.update(target, true, true)
    }
    start()
  }
  const release = (cancel = false) => {
    const m = motion.current
    if (!m.pressed) return
    const c = config.current, commit = !cancel && c?.onSelect && (origin.current.dragging || kind() === 'dock' || kind() === 'segment')
    const next = cancel ? c?.index ?? m.position.target : commit ? origin.current.dragging ? Math.max(0, Math.min((c?.count ?? 1) - 1, Math.round(m.position.target))) : candidate.current : c?.index ?? m.position.target
    m.update(next, false, false); pull.current.release()
    if (commit) { suppressClick.current = Date.now() + 400; c?.onSelect?.(next) }
    start()
  }
  const click = (index: number) => {
    if (suppressClick.current > Date.now()) { suppressClick.current = 0; return }
    config.current?.onSelect?.(index)
    if (isGlass()) { motion.current.update(index, false, false); start() }
  }
  useEffect(() => {
    const el = track.current
    if (!el) return
    paint()
    const lens = el.matches('.int-range-thumb') ? el : el.querySelector<HTMLElement>('.navigation-lens,.segment-lens,.switch-thumb,.single-glass-thumb')
    if (lens) optical.current.push(installLensOptics(lens, { role: 'lens' }))
    const glyph = el.querySelector<HTMLElement>('.glass-content-warp')
    if (glyph) optical.current.push(installLensOptics(glyph, { role: 'lensContent' }))
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(paint)
    observer?.observe(el)
    return () => {
      observer?.disconnect(); cancelAnimationFrame(frame.current); frame.current = 0; previous.current = 0
      optical.current.forEach(optics => optics.destroy()); optical.current = []
    }
  }, [])
  useEffect(() => {
    if (!selection || motion.current.pressed && kind() !== 'slider') return
    motion.current.update(selection.index, motion.current.pressed, motion.current.pressed)
    if (isGlass()) start()
    else { motion.current.finish(); paint() }
  }, [selection?.index])
  return { press, move, release, click }
}
