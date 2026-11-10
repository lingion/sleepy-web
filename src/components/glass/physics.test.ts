import { describe, expect, it } from 'vitest'
import { GlassPressMotion } from './physics'

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
