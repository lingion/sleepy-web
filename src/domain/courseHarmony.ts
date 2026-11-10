import { javaStringHashCode, rgbToHsl, parseHex } from './courseColor'

const normalize = (h: number) => ((h % 360) + 360) % 360
const seed = (group: string) => (javaStringHashCode(group) & 0x7fffffff) % 240
function hueFromT(anchor: number, t: number): number { return normalize(anchor + (t < 120 ? 30 + t : 210 + t - 120)) }
export function ringDistance(a: number, b: number): number { const d = normalize(a - b); return Math.min(d, 360 - d) }
export function safeArcHue(anchor: number, group: string): number { return hueFromT(anchor, seed(group)) }
export function planCourseHues(anchor: number | null, existing: number[], groups: string[]): Record<string, number> {
  if (anchor === null) return {}
  const result: Record<string, number> = {}
  const taken = [...existing]
  for (const group of groups) {
    if (!group || Object.prototype.hasOwnProperty.call(result, group)) continue
    const start = seed(group)
    let best = hueFromT(anchor, start), bestGap = -1
    for (let i = 0; i < 120; i++) {
      const hue = hueFromT(anchor, (start + 2 * i) % 240)
      const gap = taken.length ? Math.min(...taken.map(other => ringDistance(hue, other))) : 360
      if (gap > bestGap) { best = hue; bestGap = gap }
      if (gap >= 10) { best = hue; break }
    }
    result[group] = best
    taken.push(best)
  }
  return result
}
export function courseColorAnchor(mode: number, primary: string, seedHue: number): number | null {
  if (mode === 0) return null
  if (mode === 2 && seedHue >= 0) return normalize(seedHue)
  return rgbToHsl(parseHex(primary) ?? [103, 80, 164])[0]
}
