/**
 * JwWiseduParser — Kotlin data/jw/JwWiseduParser.kt 1:1 移植 (金智 jwapp)
 * source 是课表 API JSON (非 HTML): {datas:{xskcb:{rows:[…]}}}
 * SKZC bitmap → weekRuns (单段 type=0 / 整体等差2 压缩单双周 / 多段拆连续段)
 * open for WHUT: moduleNames/mapSection 注入点保留。
 */

import { toIntOrNull, type JwCourse, type JwParser } from './jwCourse'

export class JwWiseduParser implements JwParser {
  readonly source: string

  /** rows 所在路径 datas.<module>.rows; WHUT 子类注入别名 */
  protected readonly moduleNames: string[] = ['xskcb']

  constructor(source: string) {
    this.source = source
  }

  /** 节次 DM → 物理节次; 默认直通 (HEU DM 即物理节次) */
  protected mapSection(dm: number): number {
    return dm
  }

  generateCourseList(): JwCourse[] {
    const result: JwCourse[] = []
    let root: Record<string, unknown>
    try {
      root = JSON.parse(this.source) as Record<string, unknown>
    } catch {
      return result
    }
    const datas = root['datas'] as Record<string, unknown> | undefined
    if (!datas) return result
    let rows: unknown = null
    for (const name of this.moduleNames) {
      const mod = datas[name] as Record<string, unknown> | undefined
      if (mod && Array.isArray(mod['rows'])) {
        rows = mod['rows']
        break
      }
    }
    if (!Array.isArray(rows)) return result

    for (const el of rows) {
      const o = el as Record<string, unknown>
      const str = (k: string): string => (o[k] === undefined || o[k] === null ? '' : String(o[k]).trim())
      const int = (k: string): number | null => toIntOrNull(str(k))

      const name = str('KCM')
      if (name === '') continue
      const teacher = str('SKJS')
      const room = str('JASMC')
      const day = int('SKXQ')
      if (day === null) continue
      const ks = int('KSJC')
      if (ks === null) continue
      const startNode = this.mapSection(ks)
      const js = int('JSJC')
      const endNode = js !== null ? this.mapSection(js) : startNode
      const skzc = str('SKZC')

      for (const [sw, ew, type] of weekRuns(skzc)) {
        result.push({
          name,
          room,
          teacher,
          day: Math.min(Math.max(day, 1), 7),
          startNode: Math.max(startNode, 1),
          endNode: Math.max(endNode, startNode),
          startWeek: sw,
          endWeek: ew,
          type,
        })
      }
    }
    return result
  }

  /** /jwapp/sys/wdkb/=100; xskcb.do=90; datas.xskcb=80 */
  confidence(): number {
    const s = this.source
    if (s.includes('/jwapp/sys/wdkb/')) return 100
    if (s.includes('xskcb.do')) return 90
    if (s.includes('datas.xskcb')) return 80
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('/jwapp/sys/wdkb/')) f.push('jwapp/sys/wdkb')
    if (this.source.includes('xskcb.do')) f.push('xskcb.do')
    if (this.source.includes('datas.xskcb')) f.push('datas.xskcb.rows')
    return f
  }
}

/** SKZC 周次 bitmap → 连续段列表 (哈工程真实数据 100% 校验语义) */
export function weekRuns(skzc: string): Array<[number, number, number]> {
  const weeks: number[] = []
  for (let i = 0; i < skzc.length; i++) {
    if (skzc[i] === '1') weeks.push(i + 1)
  }
  if (weeks.length === 0) return []

  // 拆连续段
  const runs: Array<[number, number]> = []
  let start = weeks[0]
  let prev = weeks[0]
  for (let i = 1; i < weeks.length; i++) {
    const w = weeks[i]
    if (w === prev + 1) {
      prev = w
    } else {
      runs.push([start, prev])
      start = w
      prev = w
    }
  }
  runs.push([start, prev])

  if (runs.length === 1) {
    return [[runs[0][0], runs[0][1], 0]]
  }
  // 整体单/双周 (等差 step=2)
  if (weeks.length >= 2 && weeks.every((w, i) => i === 0 || w - weeks[i - 1] === 2)) {
    const type = weeks[0] % 2 === 1 ? 1 : 2
    return [[weeks[0], weeks[weeks.length - 1], type]]
  }
  return runs.map(([a, b]) => [a, b, 0] as [number, number, number])
}

// ── JwWhutParser (whut) — Kotlin JwWhutParser.kt 1:1 ─────────────────────
// 金智 jwapp 变体: 主通道 wdkbby 微应用 (datas.cxxszhxqkb.rows), 节次 DM
// 6/7/13 缺位需映射物理节次; 表外 DM 原值直通禁丢行。

/** WHUT 节次 DM → 物理节次 (1..13); 序列 1..5, 8..12, 14..16 (6/7/13 缺位) */
export const WHUT_SECTION_DM_TO_NODE: Readonly<Record<number, number>> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
  8: 6, 9: 7, 10: 8, 11: 9, 12: 10,
  14: 11, 15: 12, 16: 13,
}

export function mapWhutSectionDm(dm: number): number {
  return WHUT_SECTION_DM_TO_NODE[dm] ?? dm
}

export class JwWhutParser extends JwWiseduParser {
  protected readonly moduleNames = ['cxxszhxqkb', 'cxxskcb', 'xskcb']

  protected override mapSection(dm: number): number {
    return mapWhutSectionDm(dm)
  }

  /** cxxszhxqkb=96; cxxskcb.do=95; cxxskcb=90; xskcb.do=90; datas.xskcb=80; wdkb=100 */
  override confidence(): number {
    const s = this.source
    if (s.includes('cxxszhxqkb')) return 96
    if (s.includes('cxxskcb.do')) return 95
    if (s.includes('cxxskcb')) return 90
    if (s.includes('xskcb.do')) return 90
    if (s.includes('datas.xskcb')) return 80
    if (s.includes('/jwapp/sys/wdkb/')) return 100
    return 0
  }

  override matchedFeatures(): string[] {
    const f = super.matchedFeatures()
    if (this.source.includes('cxxszhxqkb')) f.push('wdkbby/cxxszhxqkb.do')
    if (this.source.includes('cxxskcb.do')) f.push('kcbcxby/cxxskcb.do')
    if (this.source.includes('cxxskcb')) f.push('datas.cxxskcb.rows')
    return f
  }
}
