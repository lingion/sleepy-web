/**
 * JwQzIeasParser — 强智 iEAS 网络版 (`/ieas2.1/...`)。
 * Kotlin data/jw/JwQzIeasParser.kt 1:1 移植。
 *
 * queryGrkb 返回 HTML 表格: data-* 字段优先, 五列文本回退 (课程名/教师/
 * 教室/周次/时间)。BUAA 实测, 路径锚 /ieas2.1/。
 */

import { parseHtmlDoc, getElementsByTag, toIntOrNull, type JwCourse, type JwParser } from './jwCourse'

const DAY_MAP: Record<string, number> = {
  '一': 1, '1': 1,
  '二': 2, '2': 2,
  '三': 3, '3': 3,
  '四': 4, '4': 4,
  '五': 5, '5': 5,
  '六': 6, '6': 6,
  '日': 7, '天': 7, '7': 7,
}

function parseDay(text: string): number {
  const m = text.match(/周([一二三四五六日天1-7])/)
  return m ? DAY_MAP[m[1]] ?? 0 : 0
}

function parseNodes(text: string): [number, number] {
  const m = text.match(/第\s*(\d+)(?:\s*[-~,，、]\s*(\d+))?/)
  if (!m) return [0, 0]
  const start = toIntOrNull(m[1]) ?? 0
  const end = m[2] !== undefined ? (toIntOrNull(m[2]) ?? start) : start
  return [start, end]
}

function parseWeeks(raw: string): Array<[number, number, number]> {
  const normalized = raw.replace(/周/g, '').replace('（', '(').replace('）', ')')
  const out: Array<[number, number, number]> = []
  for (const seg of normalized.split(/[,，]/)) {
    const s = seg.trim()
    if (!s) continue
    let type = 0
    if (s.includes('单')) type = 1
    else if (s.includes('双')) type = 2
    const nums = Array.from(s.matchAll(/\d+/g)).map((mm) => toIntOrNull(mm[0]) ?? 0).filter((n) => n > 0)
    if (nums.length === 0) continue
    if (s.includes('-') && nums.length >= 2) {
      // 单/双周对齐首项
      const start = type === 1 ? (nums[0] % 2 === 0 ? nums[0] + 1 : nums[0])
        : type === 2 ? (nums[0] % 2 === 1 ? nums[0] + 1 : nums[0])
        : nums[0]
      out.push([start, Math.max(start, nums[1]), type])
    } else {
      out.push([nums[0], nums[0], type])
    }
  }
  return out
}

function cleanNull(s: string): string {
  return /^null$/i.test(s) ? '' : s
}

export class JwQzIeasParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const doc = parseHtmlDoc(this.source)
    const table = doc.querySelector('table#queryGrkb') ?? doc.querySelector('table')
    if (!table) return []
    const result: JwCourse[] = []
    for (const row of getElementsByTag(table, 'tr')) {
      const cells = Array.from(row.querySelectorAll('th,td')).map((c) => (c.textContent ?? '').trim())
      const name = (row.getAttribute('data-course-name') || cells[0] || '').trim()
      if (!name) continue
      const teacher = cleanNull((row.getAttribute('data-teacher') || cells[1] || '').trim())
      const room = cleanNull((row.getAttribute('data-room') || cells[2] || '').trim())
      const weeks = (row.getAttribute('data-weeks') || cells[3] || '').trim()
      const dayAttr = toIntOrNull(row.getAttribute('data-day') ?? '')
      const day = dayAttr ?? parseDay(cells[4] || '')
      const nodesAttr: [number | null, number | null] = [
        toIntOrNull(row.getAttribute('data-start-node') ?? ''),
        toIntOrNull(row.getAttribute('data-end-node') ?? ''),
      ]
      const parsedNodes = parseNodes(cells[4] || '')
      const start = nodesAttr[0] ?? parsedNodes[0]
      const end = nodesAttr[1] ?? parsedNodes[1]
      if (day < 1 || day > 7 || start < 1 || end < start) continue
      for (const [sw, ew, type] of parseWeeks(weeks)) {
        result.push({ name, room, teacher, day, startNode: start, endNode: end, startWeek: sw, endWeek: ew, type })
      }
    }
    return result
  }

  confidence(): number {
    return parseHtmlDoc(this.source).querySelector('table#queryGrkb') ? 90 : 0
  }

  matchedFeatures(): string[] {
    const f: string[] = []
    if (parseHtmlDoc(this.source).querySelector('table#queryGrkb')) f.push('table#queryGrkb')
    if (this.source.includes('/ieas2.1/')) f.push('path:/ieas2.1/')
    return f
  }
}