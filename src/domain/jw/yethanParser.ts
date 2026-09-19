/** JwYethanParser — yhxt.swjtu.edu.cn YETHAN JSON schedule. */
import { type JwCourse, type JwParser } from './jwCourse'

const DAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

export class JwYethanParser implements JwParser {
  readonly source: string
  constructor(source: string) { this.source = source }

  generateCourseList(): JwCourse[] {
    let root: Record<string, unknown>
    try { root = JSON.parse(this.source) as Record<string, unknown> } catch { return [] }
    if (!Array.isArray(root.data)) return []
    const result: JwCourse[] = []
    for (const raw of root.data) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      const name = this.str(row, 'courseName')
      if (!name) continue
      const teacher = this.str(row, 'staffName')
      for (let i = 1; i <= 40; i++) {
        const rawTime = this.str(row, `classTime${i}`)
        if (!rawTime) continue
        const match = rawTime.match(/^([0-9、-]+)周\s*星期(.)\s*([0-9-]+)节$/)
        if (!match) continue
        const day = DAY[match[2]]
        const nodes = match[3].split('-').map((v) => Number(v.trim()))
        if (!day || nodes.some((v) => !Number.isInteger(v) || v < 1)) continue
        for (const [startWeek, endWeek] of this.weekRuns(match[1])) {
          result.push({ name, room: this.roomOf(this.str(row, `classPlace${i}`)), teacher, day, startNode: nodes[0], endNode: nodes[1] ?? nodes[0], startWeek, endWeek, type: 0 })
        }
      }
    }
    return result
  }

  confidence(): number {
    if (this.source.includes('student-course-schedule') || (this.source.includes('"code":"00000"') && this.source.includes('"courseName"'))) return 90
    if (this.source.includes('classTime1') || this.source.includes('classPlace1')) return 80
    if (/"code":"A(?:0230|0422)"/.test(this.source) || this.source.includes('yhxt')) return 60
    return 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (this.source.includes('student-course-schedule')) f.push('student-course-schedule')
    if (this.source.includes('"code":"00000"')) f.push('code.00000')
    if (this.source.includes('classTime1')) f.push('classTime1..40')
    if (this.source.includes('classPlace1')) f.push('classPlace1..40')
    if (this.source.includes('staffName')) f.push('staffName')
    return f
  }

  private str(row: Record<string, unknown>, key: string): string {
    return row[key] === null || row[key] === undefined ? '' : String(row[key]).trim()
  }

  private weekRuns(value: string): Array<[number, number]> {
    return value.split('、').flatMap((part) => {
      const nums = part.trim().split('-').map(Number)
      if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 30)) return []
      return [[nums[0], nums[1] ?? nums[0]] as [number, number]]
    }).filter(([start, end]) => end >= start)
  }

  private roomOf(place: string): string {
    if (!place) return ''
    if (/^online/i.test(place)) return 'Online'
    const opens = [...place].filter((c) => c === '(' || c === '（').length
    if (opens >= 2) return place.slice(0, Math.max(place.lastIndexOf('('), place.lastIndexOf('（'))).trim()
    const single = place.match(/^([A-Za-z0-9]+)\s*\(([^()]+)\)$/)
    if (single && !/[一-鿿]/.test(single[2])) return single[1]
    return place
  }
}
