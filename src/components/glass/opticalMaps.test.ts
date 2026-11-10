import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import baseline from './opticalMaps.baseline.json'
import { cachedOpticalMaps, renderOpticalMaps } from './opticalMaps'
import { liquidGlassStyle, type GlassStyleRole } from './styles'
import { createOpticalSampler, sampleGlassOptics, type OpticalShape } from './opticalMath'
import { GlassControlMotion } from './physics'
import { lensGeometry } from './useGlassLens'

describe(`byte equivalence with ${baseline.base}`, () => {
  it.each(baseline.fixtures)('$role dark=$dark $shape', ({ role, dark, shape, sha256 }) => {
    const style = liquidGlassStyle(role as GlassStyleRole, { dark, color: [.2, .4, .8, 1], surfaceBright: [1, .98, .97, 1], surfaceContainerHighest: [.25, .3, .35, 1] })
    const maps = renderOpticalMaps(shape as OpticalShape, style), hash = createHash('sha256')
    for (const buffer of [...maps.displacement, maps.lighting, maps.masks]) hash.update(buffer)
    expect(hash.digest('hex')).toBe(sha256)
  })
  it('matches the scalar equations at interior, exterior and asymmetric corner samples', () => {
    const shapes: OpticalShape[] = [
      {width: 37, height: 24, borderRadius: 999},
      {width: 150.4, height: 65.2, borderRadius: [1, 22.5, 16, 7], pixelSize: .5},
      {width: 80, height: 40, borderRadius: 20, cornerCurves: Array(48).fill(0)},
    ]
    for (const role of ['regular', 'tinted', 'pill', 'menu', 'alert', 'lens', 'lensContent'] as const) for (const shape of shapes) {
      const style = liquidGlassStyle(role, {color: [.2, .4, .8, 1], surfaceBright: [1, .98, .97, 1]})
      const sample = createOpticalSampler(shape, style)
      for (let y = -1; y <= 10; y++) for (let x = -1; x <= 10; x++) {
        const px = shape.width * x / 10, py = shape.height * y / 10
        const expected = sampleGlassOptics(shape, [px, py], style), actual = sample(px, py)
        expect(actual.edgeDistance).toBe(expected.edgeDistance)
        expect([actual.shiftX, actual.shiftY]).toEqual(expected.shift)
        expect([actual.partX, actual.partY]).toEqual(expected.part)
        for (const field of ['rise', 'endScale', 'shine', 'darken', 'line'] as const) expect(actual[field], `${role} ${px},${py} ${field}`).toBe(expected[field])
      }
    }
  })
  it('retains a complete two-lens motion cycle so replay does not regenerate the same maps', () => {
    const motion = new GlassControlMotion(0), entries = []
    const styles = [liquidGlassStyle('lens'), liquidGlassStyle('lensContent')]
    motion.update(2, true, true)
    for (let frame = 0; frame < 60; frame++) {
      if (frame === 30) motion.update(2, false, false)
      motion.tick(1 / 60)
      const g = lensGeometry('dock', 360, 62, 4, motion.position.value, motion.lift, motion.stretch)
      const shape = {width: Math.round(g.width), height: Math.round(g.height), borderRadius: 999}
      for (const style of styles) entries.push({shape, style, maps: cachedOpticalMaps(shape, style)})
    }
    for (const {shape, style, maps} of entries) expect(cachedOpticalMaps(shape, style)).toBe(maps)
  })
})
