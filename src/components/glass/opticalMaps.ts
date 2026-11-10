import { clamp01, sampleGlassOptics, type OpticalShape } from './opticalMath'
import type { GlassStyle } from './styles'

export interface OpticalMaps {
  width: number
  height: number
  /** SVG scale, in logical pixels. R/G encode x/y with byte 128 exactly neutral. */
  displacementScale: number
  displacement: readonly [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray]
  /** R: endScale, G: shine, B: darken, A: 1. */
  lighting: Uint8ClampedArray
  /** R: shape coverage, G: line, B: rise squared (rim frost), A: 1. */
  masks: Uint8ClampedArray
}

/**
 * The shader's sampling offsets, not a decorative normal texture. The browser
 * adapter requests a padded filter region. It cannot guarantee that a browser
 * supplies backdrop pixels there; a content caller must paint its overscan.
 * Downsampling changes map resolution only; every optical length stays in dp.
 */
export function renderOpticalMaps(shape: OpticalShape, style: GlassStyle, maxPixels = 262144): OpticalMaps {
  if (!(shape.width > 0 && shape.height > 0 && Number.isFinite(shape.width) && Number.isFinite(shape.height))) throw new Error('Optical size must be finite and positive')
  if (!(maxPixels >= 1 && Number.isFinite(maxPixels))) throw new Error('maxPixels must be finite and positive')
  const ratio = Math.min(1, Math.sqrt(maxPixels / (Math.ceil(shape.width) * Math.ceil(shape.height))))
  const width = Math.max(1, Math.floor(Math.ceil(shape.width) * ratio)), height = Math.max(1, Math.floor(Math.ceil(shape.height) * ratio))
  const displacement = [new Uint8ClampedArray(width * height * 4), new Uint8ClampedArray(width * height * 4), new Uint8ClampedArray(width * height * 4)] as const
  const lighting = new Uint8ClampedArray(width * height * 4), masks = new Uint8ClampedArray(width * height * 4)
  const depth = style.refraction < 0 ? -style.refraction : Math.min(style.refraction, Math.min(shape.width, shape.height) / 2)
  const reach = Math.max(depth + .5 * style.dispersion, 1e-6)
  const pixelX = shape.width / width, pixelY = shape.height / height
  const encode = (offset: number) => Math.round(128 + 127 * Math.max(-1, Math.min(1, offset / reach)))
  const samplePixel = Math.min(shape.pixelSize ?? 1, shape.width, shape.height)
  const padding = shape.samplingPadding ?? opticalSamplingPadding(style)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const point = [(x + .5) * pixelX, (y + .5) * pixelY] as const
    const optics = sampleGlassOptics(shape, point, style), i = (y * width + x) * 4
    const coverage = clamp01(.5 - optics.edgeDistance / Math.max(pixelX, pixelY))
    for (let channel = 0; channel < 3; channel++) {
      const direction = 1 - channel
      const sx = point[0] + optics.shift[0] + direction * optics.part[0]
      const sy = point[1] + optics.shift[1] + direction * optics.part[1]
      const dx = Math.max(-padding + samplePixel / 2, Math.min(shape.width + padding - samplePixel / 2, sx)) - point[0]
      const dy = Math.max(-padding + samplePixel / 2, Math.min(shape.height + padding - samplePixel / 2, sy)) - point[1]
      displacement[channel].set([coverage > 0 ? encode(dx) : 128, coverage > 0 ? encode(dy) : 128, 128, 255], i)
    }
    lighting.set([Math.round(255 * optics.endScale), Math.round(255 * optics.shine), Math.round(255 * optics.darken), 255], i)
    masks.set([Math.round(255 * coverage), Math.round(255 * optics.line), Math.round(255 * optics.rise ** 2), 255], i)
  }
  return { width, height, displacementScale: 2 * reach, displacement, lighting, masks }
}

/** FlClash liquid_glass_capture.dart `_place`: reach, at unit stretch. */
export function opticalSamplingPadding(style: GlassStyle): number {
  const blur = style.haze > 0 ? Math.max(style.blur, style.hazeBlur) : style.blur
  return 3 * (blur + style.rimBlur) + Math.max(0, -style.refraction) + style.dispersion + 2
}

const cache = new Map<string, OpticalMaps>()
let cacheBytes = 0
/** Two-dp geometry buckets bound PNG work during lens resizing. Optical
 * lengths remain in dp; the adapter scales these maps to the actual pane. */
export function cachedOpticalMaps(shape: OpticalShape, style: GlassStyle): OpticalMaps {
  const bucket = (value: number) => Math.max(1, Math.round(value / 2) * 2)
  const quantized = {
    ...shape, width: bucket(shape.width), height: bucket(shape.height),
    borderRadius: typeof shape.borderRadius === 'number' ? Math.round(shape.borderRadius * 2) / 2
      : shape.borderRadius.map(value => Math.round(value * 2) / 2) as unknown as OpticalShape['borderRadius'],
  }
  const key = JSON.stringify([quantized, style])
  const existing = cache.get(key)
  if (existing) { cache.delete(key); cache.set(key, existing); return existing }
  const maps = renderOpticalMaps(quantized, style)
  const bytes = maps.width * maps.height * 20
  cache.set(key, maps); cacheBytes += bytes
  while ((cache.size > 32 || cacheBytes > 16 * 1024 * 1024) && cache.size > 1) {
    const oldest = cache.keys().next().value!
    const removed = cache.get(oldest)!
    cacheBytes -= removed.width * removed.height * 20
    cache.delete(oldest)
  }
  return maps
}
