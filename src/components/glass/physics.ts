/** Android v1.0.64 GlassPressMotion: a short tap completes its rise before release. */
export class Spring {
  value = 0
  velocity = 0
  target = 0
  tick(dt: number, stiffness = 380, damping = 27) {
    for (let remaining = Math.min(dt, .05); remaining > 0; remaining -= 1 / 240) {
      const h = Math.min(remaining, 1 / 240)
      this.velocity += ((this.target - this.value) * stiffness - damping * this.velocity) * h
      this.value += this.velocity * h
    }
    if (Math.abs(this.target - this.value) < .0005 && Math.abs(this.velocity) < .005) {
      this.value = this.target
      this.velocity = 0
    }
  }
  get running() { return this.value !== this.target || this.velocity !== 0 }
}

export class GlassPressMotion {
  lift = new Spring()
  x = new Spring()
  y = new Spring()
  held = false
  dropping = false
  press() { this.held = true; this.dropping = false; this.lift.target = 1 }
  drag(dx: number, dy: number, shortestSide: number) {
    if (!this.held) return
    const limit = shortestSide * 7 / 32
    const rubber = (value: number) => limit > 0 ? limit * value / (limit + Math.abs(value)) : 0
    this.x.target = rubber(dx)
    this.y.target = rubber(dy)
  }
  release() { this.held = false; this.dropping = true; this.x.target = 0; this.y.target = 0 }
  tick(dt: number) {
    this.lift.tick(dt, 311, 20.915)
    this.x.tick(dt, 2741.56, 104.72)
    this.y.tick(dt, 2741.56, 104.72)
    if (this.dropping && this.lift.value >= .975) {
      this.dropping = false
      this.lift.target = 0
    }
  }
  get running() { return this.dropping || this.lift.running || this.x.running || this.y.running }
}

export function haptic() {
  try { navigator.vibrate?.(8) } catch { /* Optional browser capability. */ }
}
