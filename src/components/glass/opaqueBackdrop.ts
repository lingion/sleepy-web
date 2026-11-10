/** Evidence for one pending paint, never a promise about arbitrary content. */
const evidence = Symbol('opaque-backdrop-paint')
export interface BackdropBounds { left: number; top: number; width: number; height: number }
export interface OpaqueBackdropProof {
  readonly [evidence]: true
  readonly element: HTMLElement
  readonly width: number
  readonly height: number
  readonly padding: number
}

const none = (value: string) => !value || value === 'none'
const px = (value: string) => parseFloat(value) || 0
function opaqueColor(value: string): boolean {
  const text = value.trim()
  if (/^#[\da-f]{6}$/i.test(text) || /^#[\da-f]{3}$/i.test(text)) return true
  const channels = /^rgba?\(([^)]+)\)$/.exec(text)?.[1].split(/[,\s/]+/).filter(Boolean)
  return !!channels && channels.length >= 3 && (channels.length === 3 || (channels[3].endsWith('%') ? parseFloat(channels[3]) === 100 : Number(channels[3]) === 1))
}
function covers(element: HTMLElement, style: CSSStyleDeclaration, area: BackdropBounds, background: boolean): boolean {
  const rect = element.getBoundingClientRect()
  // Insets are deliberately conservative around rounded clips. We never
  // infer opaque corners from an opaque rectangular background color.
  const radiusValues = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius, style.borderRadius].flatMap(value => (value || '').split(/[\s/]+/))
  const radius = Math.max(0, ...radiusValues.map(value => value.includes('%') ? px(value) * Math.min(rect.width, rect.height) / 100 : px(value)))
  let horizontal = radius, vertical = radius
  if (background && style.backgroundClip && style.backgroundClip !== 'border-box') {
    horizontal += Math.max(px(style.borderLeftWidth), px(style.borderRightWidth))
    vertical += Math.max(px(style.borderTopWidth), px(style.borderBottomWidth))
    if (style.backgroundClip === 'content-box') {
      horizontal += Math.max(px(style.paddingLeft), px(style.paddingRight))
      vertical += Math.max(px(style.paddingTop), px(style.paddingBottom))
    } else if (style.backgroundClip !== 'padding-box') return false
  }
  return area.left >= rect.left + horizontal && area.top >= rect.top + vertical
    && area.left + area.width <= rect.right - horizontal && area.top + area.height <= rect.bottom - vertical
}
function translationOnly(style: CSSStyleDeclaration): boolean {
  if (style.zoom && !['1', 'normal'].includes(style.zoom) || !none(style.perspective) || !none(style.rotate) && !/^0(?:deg)?$/.test(style.rotate) || !none(style.scale) && !/^1(?:\s+1){0,2}$/.test(style.scale)) return false
  if (none(style.transform)) return true
  const matrix = /^matrix\(([^)]+)\)$/.exec(style.transform)?.[1].split(',').map(Number)
  return !!matrix && matrix.length === 6 && matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 1
}

/**
 * The document backdrop includes the opaque body only if no intervening
 * Backdrop Root cuts it off. Check the whole prospective sampling rectangle,
 * including blur/displacement padding, before the caller writes lens styles.
 * Rotated/scaled panes, active ancestor animations, capture clips and viewport
 * edges retain the general alpha graph. A new proof is required every paint.
 */
export function proveOpaqueBackdrop(element: HTMLElement, pendingBounds: () => BackdropBounds | undefined, padding: number): OpaqueBackdropProof | undefined {
  if (!element.isConnected || !(padding >= 0 && Number.isFinite(padding))) return
  const bodyStyle = getComputedStyle(document.body)
  if (!opaqueColor(bodyStyle.backgroundColor) || !none(bodyStyle.backgroundImage)) return
  const ownStyle = getComputedStyle(element)
  if (![ownStyle.transform, ownStyle.translate, ownStyle.rotate, ownStyle.scale].every(none)) return
  const bounds = pendingBounds()
  if (!bounds || !Object.values(bounds).every(Number.isFinite) || !(bounds.width > 0 && bounds.height > 0)) return
  // One extra CSS pixel also excludes bilinear/antialias sampling at the
  // capture boundary. It changes eligibility, never the optical sample.
  const reach = padding + 1
  const area = {left: bounds.left - reach, top: bounds.top - reach, width: bounds.width + 2 * reach, height: bounds.height + 2 * reach}
  const viewport = window.visualViewport
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
  if (area.left < left || area.top < top || area.left + area.width > left + (viewport?.width ?? window.innerWidth)
    || area.top + area.height > top + (viewport?.height ?? window.innerHeight)) return
  if (!covers(document.body, bodyStyle, area, true)) return
  let reachedDocument = false
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = ancestor === document.body ? bodyStyle : getComputedStyle(ancestor)
    if (Number(style.opacity || 1) !== 1 || !translationOnly(style)
      || !none(style.filter) || !none(style.backdropFilter) || !none(style.getPropertyValue('-webkit-backdrop-filter'))
      || !none(style.maskImage) || !none(style.getPropertyValue('-webkit-mask-image')) || !none(style.getPropertyValue('mask-border-source')) || !none(style.getPropertyValue('-webkit-mask-box-image-source')) || !none(style.clipPath)
      || style.clip && style.clip !== 'auto' || style.mixBlendMode && style.mixBlendMode !== 'normal'
      || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return
    if (ancestor.getAnimations?.().some(animation => animation.playState === 'running' || animation.pending)) return
    const willChange = style.willChange.split(',').map(value => value.trim())
    if (willChange.some(value => ['filter', 'backdrop-filter', 'mask', 'mask-image', 'clip-path', 'mix-blend-mode'].includes(value))) return
    // will-change:opacity itself is a Backdrop Root. Its own background must
    // supply every sample; an opaque body outside that root is insufficient.
    if (willChange.includes('opacity') && (!opaqueColor(style.backgroundColor) || !none(style.backgroundImage) || !covers(ancestor, style, area, true))) return
    const clipped = [style.overflow, style.overflowX, style.overflowY].some(value => value && value !== 'visible') || /(?:paint|strict|content)/.test(style.contain)
    if (clipped && !covers(ancestor, style, area, false)) return
    if (ancestor === document.documentElement) reachedDocument = true
  }
  if (!reachedDocument) return
  return Object.freeze({[evidence]: true as const, element, width: bounds.width, height: bounds.height, padding})
}

export function matchesOpaqueBackdrop(proof: OpaqueBackdropProof | undefined, element: HTMLElement, width: number, height: number, padding: number): boolean {
  return !!proof?.[evidence] && proof.element === element && proof.width === width && proof.height === height && proof.padding >= padding
}
