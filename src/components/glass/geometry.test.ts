import { describe, expect, it } from 'vitest'
import { lensGeometry } from './useGlassLens'

describe('native glass geometry', () => {
  it('raises a whole segmented pane beyond both track edges without shifting its center', () => {
    const rest=lensGeometry('segment',364,42,3,1,0,0)
    const held=lensGeometry('segment',364,42,3,1,1,0)
    expect(rest.height).toBe(34)
    expect(held.height).toBe(52)
    expect(held.top).toBe(-5)
    expect(held.top+held.height).toBe(47)
    expect(held.left+held.width/2).toBe(rest.left+rest.width/2)
  })
  it('keeps the precision thumb small and colored at rest, growing to the native lens size', () => {
    const rest=lensGeometry('slider',16,48,1,0,0,0)
    const held=lensGeometry('slider',16,48,1,0,1,0)
    expect([rest.width,rest.height]).toEqual([16,24])
    expect([held.width,held.height]).toEqual([28,40])
  })
  it('keeps toggle travel independent of the rising lens dimensions', () => {
    const off=lensGeometry('switch',68,48,2,0,0,0)
    const on=lensGeometry('switch',68,48,2,1,1,0)
    expect([off.width,off.height]).toEqual([37,24])
    expect(on.width).toBeCloseTo(63.6)
    expect(on.height).toBeCloseTo(36)
    expect((on.left+on.width/2)-(off.left+off.width/2)).toBeCloseTo(22)
  })
})
