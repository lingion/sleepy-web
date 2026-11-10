import { describe, expect, it } from 'vitest'
import { GlassPressMotion, GlassControlMotion, Spring, springs } from './physics'

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


describe('elapsed spring time', () => {
  it.each(Object.entries(springs))('keeps %s at the same physical position after one long frame or several short frames', (_name, [stiffness, damping]) => {
    const delayed = new Spring(.4, 1e-12), regular = new Spring(.4, 1e-12)
    delayed.target = regular.target = 2
    delayed.velocity = regular.velocity = -.2
    delayed.tick(.24, stiffness, damping)
    for (let frame = 0; frame < 24; frame++) regular.tick(.01, stiffness, damping)
    expect(delayed.value).toBeCloseTo(regular.value, 11)
    expect(delayed.velocity).toBeCloseTo(regular.velocity, 11)
  })
})
