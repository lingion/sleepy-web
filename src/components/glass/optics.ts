import { cachedOpticalMaps, opticalSamplingPadding, renderOpticalMaps } from './opticalMaps'
import { createOpticalSvg } from './opticalSvg'
import { liquidGlassStyle, scaleGlassStyle, type GlassStyle, type GlassStyleRole, type GlassTheme, type RGBA } from './styles'
import type { CornerRadii, OpticalShape } from './opticalMath'

export { renderOpticalMaps, opticalSamplingPadding } from './opticalMaps'
export { sampleGlassOptics, roundedBoxGeometry, combineGlassChannels, shadeGlassSample, OPTICAL_CONSTANTS } from './opticalMath'
export { liquidGlassStyle, scaleGlassStyle, lerpGlassStyle, standardGlassStyle } from './styles'
export type { RGBA, GlassStyle, GlassStyleRole, GlassTheme } from './styles'
export type { OpticalShape, CornerRadii } from './opticalMath'

export const WEB_OPTICS_LIMITATIONS = Object.freeze([
  'SVG backdrop-filter URL support and padded SourceGraphic access must be verified in the target browser; this is not an Android RuntimeShader.',
  'Vogel frost with 16/32/64 taps is approximated by Gaussian endpoint blending; haze remains a separate sample.',
  'Adaptive five-point backdrop-luma contrast, veil and press glow need captured texture access and are not applied here.',
  'Circular corners are used unless the 48 upstream uCurves values are supplied. Outlined and goo geometries are not implemented.',
  'The filter requests the native capture reach but cannot create missing source pixels. Content callers must paint the overscan region.',
  'Maps use eight-bit channels, two-dp size buckets and at most 262144 pixels. SVG primitives clamp colors between stages.',
  'Content must be provided independently by the caller. This module does not capture, clone or magnify glyphs.',
  'Menu and alert external rim strokes belong to the caller.',
])

export interface LensOpticsOptions {
  role?: GlassStyleRole
  dark?: boolean
  lift?: number
  theme?: GlassTheme
  style?: GlassStyle
  size?: { width: number; height: number }
  borderRadius?: number | CornerRadii
  cornerCurves?: readonly number[]
  samplingPadding?: number
  target?: 'backdrop' | 'content'
}
export interface LensOpticsController {
  update(lift: number): void
  configure(options: Partial<LensOpticsOptions>): void
  destroy(): void
  readonly ready: boolean
  readonly limitations: readonly string[]
}

const NS = 'http://www.w3.org/2000/svg'
const roles: readonly string[] = ['regular', 'tinted', 'pill', 'menu', 'alert', 'lens', 'lensContent']
let serial = 0

interface OpticalDefinition {
  svg: SVGSVGElement
  filter: SVGFilterElement
  graph: ReturnType<typeof createOpticalSvg>
  url: string
  references: number
  sharedKey?: string
}
// Static definitions are immutable while retained. Dynamic lenses never enter
// this cache; their lift and size updates belong to their own graph.
const staticDefinitions = new Map<string, OpticalDefinition>()

function updateDefinition(definition: OpticalDefinition, shape: OpticalShape, base: GlassStyle, style: GlassStyle, role: GlassStyleRole, amount: number) {
  definition.graph.update(cachedOpticalMaps(shape, base), style, shape.width, shape.height, base, amount)
  const pad = shape.samplingPadding!, filter = definition.filter
  filter.setAttribute('x', String(-pad)); filter.setAttribute('y', String(-pad))
  filter.setAttribute('width', String(shape.width + 2 * pad)); filter.setAttribute('height', String(shape.height + 2 * pad))
  filter.dataset.opticsRole = role
}

function createDefinition(shape: OpticalShape, base: GlassStyle, style: GlassStyle, role: GlassStyleRole, amount: number, sharedKey?: string): OpticalDefinition {
  const id = `sleepy-optics-${++serial}`, svg = document.createElementNS(NS, 'svg'), filter = document.createElementNS(NS, 'filter')
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false')
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden'
  filter.id = id; filter.setAttribute('color-interpolation-filters', 'sRGB')
  filter.setAttribute('filterUnits', 'userSpaceOnUse'); filter.setAttribute('primitiveUnits', 'userSpaceOnUse')
  const definition = {svg, filter, graph: createOpticalSvg(filter, sharedKey === undefined ? undefined : base), url: `url("#${id}")`, references: 0, sharedKey}
  updateDefinition(definition, shape, base, style, role, amount)
  svg.appendChild(filter); document.body.appendChild(svg)
  return definition
}

function releaseDefinition(definition: OpticalDefinition | undefined) {
  if (!definition || --definition.references > 0) return
  if (definition.sharedKey !== undefined) staticDefinitions.delete(definition.sharedKey)
  definition.svg.remove()
}

export function resolveGlassRole(element: HTMLElement): GlassStyleRole {
  const explicit = element.dataset.glassRole ?? element.dataset.glassStyle
  if (explicit && roles.includes(explicit)) return explicit as GlassStyleRole
  if (element.matches('.glass-content-warp,.glass-lens-content')) return 'lensContent'
  if (element.matches('.navigation-lens,.segment-lens,.switch-thumb,.single-glass-thumb,.int-range-thumb')) return 'lens'
  return 'regular'
}

function parseColor(value: string, resolve: (name: string) => string, depth = 0): RGBA | undefined {
  const text = value.trim()
  if (depth > 8) return undefined
  const variable = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/.exec(text)
  if (variable) return parseColor(resolve(variable[1]) || variable[2] || '', resolve, depth + 1)
  const hex = /^#([\da-f]{3,8})$/i.exec(text)?.[1]
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length < 5 ? [...hex].map(c => c + c).join('') : hex
    return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255, full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1]
  }
  const parts = /^rgba?\(([^)]+)\)$/.exec(text)?.[1].split(/[,\s/]+/).filter(Boolean)
  if (parts && parts.length >= 3) {
    const numbers = parts.map((part, i) => part.endsWith('%') ? parseFloat(part) / 100 : Number(part) / (i < 3 ? 255 : 1))
    if (numbers.every(Number.isFinite)) return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1]
  }
  return undefined
}

/** Legacy entry point: the green sampling offsets of the source raised lens. */
export function lensNormals(width: number, height: number, radius: number): Uint8ClampedArray {
  return renderOpticalMaps({ width, height, borderRadius: radius }, liquidGlassStyle('lens')).displacement[1]
}

/**
 * Consume --glass-optics-filter with backdrop-filter on the background lens,
 * or filter on a separate same-size content replay. Content also receives the
 * --glass-content-optics-filter alias. --glass-optics-padding is the requested
 * sampling reach, not a statement that the browser captured that region.
 * --glass-style-tint is fallback metadata; the SVG already composites tint.
 */
export function installLensOptics(element: HTMLElement, initial: LensOpticsOptions = {}): LensOpticsController {
  let options = { ...initial }, lift = initial.lift ?? 0, destroyed = false, ready = false
  const noOp: LensOpticsController = { update() {}, configure() {}, destroy() {}, ready: false, limitations: WEB_OPTICS_LIMITATIONS }
  if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined' || !window.CanvasRenderingContext2D) return noOp
  let definition: OpticalDefinition | undefined
  const properties = ['--glass-optics-filter', '--glass-content-optics-filter', '--glass-optics-padding', '--glass-style-tint']
  const previous = new Map(properties.map(name => [name, { value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }]))
  const owned = new Map<string, string>()
  const set = (name: string, value: string) => {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
    owned.set(name, value)
  }
  const restore = (name: string) => {
    if (owned.has(name) && element.style.getPropertyValue(name) === owned.get(name)) {
      const saved = previous.get(name)!
      if (saved.value) element.style.setProperty(name, saved.value, saved.priority)
      else element.style.removeProperty(name)
    }
    owned.delete(name)
  }
  let key = '', queued = false
  const root = document.documentElement
  const render = () => {
    if (destroyed) return
    const computed = getComputedStyle(element)
    const width = options.size?.width ?? element.offsetWidth, height = options.size?.height ?? element.offsetHeight
    if (!(width > 0 && height > 0) || element.hidden || computed.display === 'none' || computed.visibility === 'hidden' || computed.visibility === 'collapse' || computed.contentVisibility === 'hidden') {
      properties.forEach(restore)
      releaseDefinition(definition); definition = undefined; key = ''; ready = false
      return
    }
    const rootStyle = getComputedStyle(root)
    const resolve = (name: string) => computed.getPropertyValue(name).trim() || rootStyle.getPropertyValue(name).trim()
    const read = (name: string) => parseColor(resolve(name), resolve)
    let role = options.role ?? resolveGlassRole(element)
    const explicitTint = element.dataset.glassTint ? parseColor(element.dataset.glassTint, resolve) : undefined
    if (role === 'regular' && explicitTint) role = 'tinted'
    const dark = options.dark ?? root.dataset.mode === 'dark'
    const theme = {
      surfaceContainerHighest: read('--md-surface-container-highest'), surfaceBright: read('--md-surface-bright'),
      color: explicitTint ?? read('--md-primary'), ...options.theme, dark,
    }
    const base = options.style ?? liquidGlassStyle(role, theme)
    const scaled = role === 'lens' || role === 'lensContent'
    const amount = scaled ? Math.max(0, Math.min(1, Number.isFinite(lift) ? lift : 0)) : 1
    const style = scaled ? scaleGlassStyle(base, amount) : base
    const shape: OpticalShape = {
      width, height,
      borderRadius: options.borderRadius ?? [computed.borderTopLeftRadius, computed.borderTopRightRadius, computed.borderBottomRightRadius, computed.borderBottomLeftRadius].map(value => {
        const radius = parseFloat(value) || 0
        return value.includes('%') ? radius * Math.min(width, height) / 100 : radius
      }) as unknown as CornerRadii,
      cornerCurves: options.cornerCurves, pixelSize: 1 / (window.devicePixelRatio || 1),
      samplingPadding: options.samplingPadding ?? opticalSamplingPadding(base),
    }
    if (typeof shape.borderRadius === 'number') shape.borderRadius = [shape.borderRadius, shape.borderRadius, shape.borderRadius, shape.borderRadius]
    // Use exact pane dimensions, not the map cache's two-dp buckets. All
    // uniforms, declared tint and dark branch must agree before sharing.
    const graphKey = JSON.stringify([shape, base, style, role, dark, explicitTint])
    const nextKey = JSON.stringify([graphKey, options.target])
    if (nextKey === key) return
    let next: OpticalDefinition
    if (!scaled) {
      const cached = staticDefinitions.get(graphKey)
      if (cached) next = cached
      else {
        next = createDefinition(shape, base, style, role, amount, graphKey)
        staticDefinitions.set(graphKey, next)
      }
    } else if (definition && definition.sharedKey === undefined) {
      next = definition
      updateDefinition(next, shape, base, style, role, amount)
    } else next = createDefinition(shape, base, style, role, amount)
    if (next !== definition) next.references++
    const url = next.url
    const pad = shape.samplingPadding!
    set(properties[0], url)
    if (options.target === 'content' || role === 'lensContent') set(properties[1], url)
    else restore(properties[1])
    set(properties[2], `${pad}px`)
    set(properties[3], `rgba(${style.tint[0] * 255}, ${style.tint[1] * 255}, ${style.tint[2] * 255}, ${style.tint[3]})`)
    if (next !== definition) releaseDefinition(definition)
    definition = next; key = nextKey; ready = true
  }
  const schedule = () => {
    if (queued || destroyed) return
    queued = true
    queueMicrotask(() => { queued = false; if (!destroyed) render() })
  }
  const resize = new ResizeObserver(schedule)
  resize.observe(element)
  const mutations = new MutationObserver(schedule)
  mutations.observe(root, { attributes: true, attributeFilter: ['data-mode', 'data-theme', 'style'] })
  mutations.observe(element, { attributes: true, attributeFilter: ['data-glass-role', 'data-glass-style', 'data-glass-tint', 'class', 'hidden'] })
  const destroy = () => {
    if (destroyed) return
    destroyed = true; ready = false; resize.disconnect(); mutations.disconnect()
    properties.forEach(restore)
    releaseDefinition(definition); definition = undefined
  }
  try { render() } catch (error) { destroy(); throw error }
  return {
    update(value: number) { lift = value; render() },
    configure(next) {
      options = { ...options, ...next, theme: next.theme ? { ...options.theme, ...next.theme } : options.theme }
      if (next.lift !== undefined) lift = next.lift
      render()
    },
    destroy,
    get ready() { return ready },
    limitations: WEB_OPTICS_LIMITATIONS,
  }
}
