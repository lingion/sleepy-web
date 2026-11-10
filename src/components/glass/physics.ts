/** FLClash / Android v1.0.64 spring descriptions. Units are logical pixels and seconds. */
export const springs = {
  press: [311, .593 * 2 * Math.sqrt(311)],
  track: [(2 * Math.PI / .12) ** 2, 4 * Math.PI / .12],
  follow: [1024, .9 * 2 * 32],
  lift: [(2 * Math.PI / .25) ** 2, 4 * Math.PI / .25],
  travel: [(2 * Math.PI / .4) ** 2, .85 * 4 * Math.PI / .4],
  jelly: [100, 8],
} as const

/** Exact solution of the same damped oscillator as SpringSimulation, retaining velocity on retarget. */
export class Spring {
  value: number
  velocity = 0
  target: number
  stiffness = 380
  damping = 27
  constructor(initial = 0, private rest = .001) { this.value = initial; this.target = initial }
  tick(dt: number, stiffness = this.stiffness, damping = this.damping) {
    this.stiffness = stiffness; this.damping = damping
    const t = Math.min(Math.max(dt, 0), .05), x = this.value - this.target, v = this.velocity
    const discriminant = damping * damping - 4 * stiffness, r = -damping / 2
    let next: number, velocity: number
    if (Math.abs(discriminant) < 1e-5) {
      const c = v - r * x, e = Math.exp(r * t)
      next = (x + c * t) * e
      velocity = (c + r * (x + c * t)) * e
    } else if (discriminant < 0) {
      const w = Math.sqrt(-discriminant) / 2, c = (v - r * x) / w
      const e = Math.exp(r * t), cos = Math.cos(w * t), sin = Math.sin(w * t)
      next = e * (x * cos + c * sin)
      velocity = e * ((r * x + w * c) * cos + (r * c - w * x) * sin)
    } else {
      const d = Math.sqrt(discriminant) / 2, r1 = r + d, r2 = r - d
      const c2 = (v - r1 * x) / (r2 - r1), c1 = x - c2
      next = c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t)
      velocity = c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t)
    }
    this.value = this.target + next; this.velocity = velocity
    if (Math.abs(next) < this.rest && Math.abs(velocity) < this.rest * Math.sqrt(stiffness)) {
      this.value = this.target; this.velocity = 0
    }
  }
  get acceleration() { return this.stiffness * (this.target - this.value) - this.damping * this.velocity }
  get running() { return this.value !== this.target || this.velocity !== 0 }
  finish() { this.value = this.target; this.velocity = 0 }
}
export const rubberBand = (value: number, limit: number) => limit > 0
  ? limit * (1 - 1 / (Math.abs(value) * .55 / limit + 1)) * Math.sign(value) : 0
const saturate = (value: number) => Math.tanh(value)

/** Ordinary panes use ElasticPress; these are not the transparent selection lenses. */
export class GlassPressMotion {
  lift = new Spring()
  x = new Spring()
  y = new Spring()
  held = false
  dropping = false
  press() { this.held = true; this.dropping = false; this.lift.target = 1 }
  drag(dx: number, dy: number, shortestSide: number) {
    if (!this.held) return
    this.x.target = rubberBand(dx, shortestSide * 7 / 32)
    this.y.target = rubberBand(dy, shortestSide * 7 / 32)
  }
  release() { if (!this.held) return; this.held = false; this.dropping = true; this.x.target = 0; this.y.target = 0 }
  tick(dt: number) {
    this.lift.tick(dt, ...springs.press)
    this.x.tick(dt, ...(this.held ? springs.track : springs.press))
    this.y.tick(dt, ...(this.held ? springs.track : springs.press))
    if (this.dropping && this.lift.value >= .975) { this.dropping = false; this.lift.target = 0 }
  }
  finish() { this.lift.target = this.held ? 1 : 0; this.lift.finish(); this.x.finish(); this.y.finish(); this.dropping = false }
  get running() { return this.dropping || this.lift.running || this.x.running || this.y.running }
}

/** GlassControlMotion.kt: travel, lift gate and velocity/braking jelly are independent springs. */
export class GlassControlMotion {
  position: Spring
  elevation = new Spring()
  jelly = new Spring(0, .003)
  pressed = false
  dragging = false
  private dropping = false
  constructor(initial = 0) { this.position = new Spring(initial) }
  update(target: number, pressed: boolean, dragging: boolean) {
    if (pressed && !this.pressed) { this.elevation.target = 1; this.dropping = false }
    else if (!pressed && this.pressed) this.dropping = true
    this.position.target = target; this.pressed = pressed; this.dragging = dragging
  }
  tick(dt: number) {
    this.position.tick(dt, ...(this.dragging ? springs.follow : springs.travel))
    this.elevation.tick(dt, ...springs.lift)
    this.jelly.tick(dt, ...springs.jelly)
    const velocity = this.position.velocity
    const wobble = this.dragging ? .24 * saturate(Math.abs(velocity) / 2.4)
      : this.position.running ? .24 * saturate(Math.abs(velocity) / 2.4)
        - .16 * saturate(Math.max(0, -this.position.acceleration * Math.sign(velocity)) / 25) : 0
    if (Math.abs(wobble - this.jelly.target) > .001) this.jelly.target = wobble
    if (this.dropping && !this.pressed && this.lift >= .975 && Math.abs(this.position.target - this.position.value) <= .04) {
      this.dropping = false; this.elevation.target = 0
    }
  }
  get lift() { return Math.max(0, Math.min(1, this.elevation.value)) }
  get stretch() { return this.lift === 0 ? 0 : Math.max(-.18, Math.min(.3, this.jelly.value)) * this.lift }
  get running() { return this.dropping || this.position.running || this.elevation.running || this.jelly.running }
  finish() { this.position.finish(); this.elevation.target = this.pressed ? 1 : 0; this.elevation.finish(); this.jelly.target = 0; this.jelly.finish(); this.dropping = false }
}

export function haptic() {
  try { navigator.vibrate?.(8) } catch { /* Optional browser capability. */ }
}
