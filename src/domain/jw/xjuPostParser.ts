/** JwXjuParser — Gwork postgraduate timetable HTML used by 新疆大学. */
import { parseHtmlDoc, type JwCourse, type JwParser, text } from './jwCourse'

function weekToken(token: string): [number, number, number] | null {
  const type = token.includes('单') ? 1 : token.includes('双') ? 2 : 0
  const nums = [...token.matchAll(/\d+/g)].map((m) => Number(m[0]))
  if (!nums.length) return null
  return [nums[0], nums[1] ?? nums[0], type]
}

export class JwXjuPostParser implements JwParser {
  readonly source: string
  constructor(source: string) { this.source = source }

  generateCourseList(): JwCourse[] {
    const doc = parseHtmlDoc(this.source)
    const table = doc.querySelector('#ctl00_contentParent_dgData, #contentParent_dgData')
    if (!table) return []
    const rows = [...table.querySelectorAll('tr')]
    const headers = [...(rows[0]?.querySelectorAll('th') ?? [])].map(text)
    const sundayFirst = headers.findIndex((h) => h.includes('星期日')) >= 0 &&
      headers.findIndex((h) => h.includes('星期一')) >= 0 &&
      headers.findIndex((h) => h.includes('星期日')) < headers.findIndex((h) => h.includes('星期一'))
    const result: JwCourse[] = []
    let node = 1
    for (const row of rows.slice(1)) {
      const cells = [...row.querySelectorAll('td')]
      for (const [index, cell] of cells.entries()) {
        if (cell.getAttribute('align')?.toLowerCase() === 'center') {
          node = Number(text(cell).match(/\d+/)?.[0] ?? node)
          continue
        }
        const dayIndex = index
        const day = sundayFirst ? (dayIndex === 1 ? 7 : dayIndex - 1) : dayIndex
        if (day < 1 || day > 7) continue
        const rowspan = Number(cell.getAttribute('rowspan') ?? 1)
        const raw = text(cell).replace(/[{}]/g, '').replace(/；/g, ';')
        for (const entry of raw.split(';')) {
          const match = entry.match(/^(.+?)\(([^)]*)\)\[([^\]]*)\]$/)
          if (!match) continue
          const name = match[1].trim()
          const weekText = match[2]
          const details = match[3]
          const teacher = details.match(/教师[:：]\s*([^,，\]]*)/)?.[1]?.trim() ?? ''
          const room = details.match(/地点[:：]\s*([^,，\]]*)/)?.[1]?.trim() ?? ''
          for (const token of weekText.split(/[、，,]/)) {
            const run = weekToken(token)
            if (!run) continue
            result.push({ name, room, teacher, day, startNode: node, endNode: node + Math.max(rowspan, 1) - 1, startWeek: run[0], endWeek: run[1], type: run[2] })
          }
        }
      }
      node++
    }
    return result
  }

  confidence(): number {
    return /(?:xjtu|xju|课程表|ctl00_contentParent_dgData)/i.test(this.source) ? 90 : 0
  }

  matchedFeatures(): string[] {
    return ['ctl00_contentParent_dgData', 'contentParent_dgData', '课程表'].filter((feature) => this.source.includes(feature))
  }
}
