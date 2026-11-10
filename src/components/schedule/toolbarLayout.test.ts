import { describe, expect, it } from 'vitest'
import { toolbarLayout } from './toolbarLayout'
describe('absolute center toolbar', () => {
  it('removes spacing before shrinking controls and only groups at extreme widths', () => {
    expect(toolbarLayout(600, 112, 80, 164).inset).toBe(12)
    expect(toolbarLayout(390, 112, 80, 164).sideScale).toBeLessThanOrEqual(1)
    expect(toolbarLayout(340, 112, 80, 164).sideScale).toBeLessThan(1)
    expect(toolbarLayout(220, 112, 80, 164).grouped).toBe(true)
    for (const width of [180, 220, 280, 320, 360, 390, 600]) {
      const l = toolbarLayout(width, 112, 80, 164)
      const middle = l.grouped ? 112 : 164
      const occupied = (middle + 2 * (104+l.internal) * l.sideScale + l.gap * 2 + 2) * l.fitScale + l.inset * 2
      expect(occupied).toBeLessThanOrEqual(width + .01)
    }
  })
})
