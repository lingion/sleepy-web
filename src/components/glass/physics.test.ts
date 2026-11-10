import { describe, expect, it } from 'vitest'
import { GlassPressMotion, GlassControlMotion } from './physics'

describe('Android glass press springs', () => {
  it('follows all quadrants and springs back after a short tap completes its rise', () => {
    const motion = new GlassPressMotion()
    motion.press()
    motion.drag(-40, 55, 48)
    expect(motion.x.target).toBeLessThan(0)
    expect(motion.y.target).toBeGreaterThan(0)
    expect(Math.abs(motion.x.target)).toBeLessThan(48 * 7 / 32)
    motion.tick(.016)
    motion.release()
    let peak = 0
    for (let i = 0; i < 300; i++) { motion.tick(1 / 60); peak = Math.max(peak, motion.lift.value) }
    expect(peak).toBeGreaterThan(.97)
    expect(motion.lift.value).toBe(0)
    expect(motion.x.value).toBe(0)
    expect(motion.y.value).toBe(0)
    expect(motion.running).toBe(false)
  })
})

describe('selection lens lifecycle', () => {
  it('finishes travelling before lowering after a short tap', () => {
    const motion = new GlassControlMotion(0)
    motion.update(3, true, false)
    motion.tick(1 / 60)
    motion.update(3, false, false)
    let raisedWhileTravelling = false
    for (let i = 0; i < 180; i++) {
      motion.tick(1 / 60)
      if (Math.abs(3 - motion.position.value) > .04 && motion.lift > .9) {
        raisedWhileTravelling = true
        expect(motion.elevation.target).toBe(1)
      }
    }
    expect(raisedWhileTravelling).toBe(true)
    expect(motion.position.value).toBe(3)
    expect(motion.lift).toBe(0)
    expect(motion.running).toBe(false)
  })

  it('stretches during a drag, brakes on release and settles without a jump', () => {
    const motion = new GlassControlMotion(0)
    motion.update(0, true, false)
    for (let i = 0; i < 30; i++) motion.tick(1 / 60)
    motion.update(2.7, true, true)
    for (let i = 0; i < 6; i++) motion.tick(1 / 60)
    expect(motion.stretch).toBeGreaterThan(0)
    const releasedAt = motion.position.value
    motion.update(3, false, false)
    expect(motion.position.value).toBe(releasedAt)
    let braking = false
    for (let i = 0; i < 240; i++) {
      motion.tick(1 / 60)
      braking ||= motion.jelly.target < 0
    }
    expect(braking).toBe(true)
    expect(motion.stretch).toBe(0)
    expect(motion.running).toBe(false)
  })
})
