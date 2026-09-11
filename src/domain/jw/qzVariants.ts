/**
 * QZ 变体解析器 — Kotlin JwQzCrazyParser / JwQzBrParser / JwQzWithNodeParser /
 * JwOldQzParser 1:1 移植
 */

import {
  parseHtmlDoc, getElementsByTag, getElementById, getElementsByClass, text,
  toIntOrNull, type JwCourse, type JwParser,
} from './jwCourse'
import { JwQzParser } from './qzParser'

/** JwQzCrazyParser — 唯一差异 tableName = "kbcontent1" (HEU 等) */
export class JwQzCrazyParser extends JwQzParser {
  constructor(source: string) {
    super(source, 'kbcontent1')
  }
}

/** JwQzBrParser — 课名截断用 <br> 而非 <font> */
export class JwQzBrParser extends JwQzParser {
  parseCourseName(infoStr: string): string {
    return infoStr.split('<br>')[0].trim()
  }

  matchedFeatures(): string[] {
    return [...super.matchedFeatures(), 'br-not-font']
  }
}

/** JwQzWithNodeParser — title="周次(节次)" 自带节次, 三分支形态 */
export class JwQzWithNodeParser extends JwQzParser {
  convert(day: number, _nodeCount: number, infoStr: string, courseList: JwCourse[]): void {
    const courseHtml = parseHtmlDoc(infoStr)
    const findByTitle = (t: string): Element[] => Array.from(courseHtml.querySelectorAll(`[title="${t}"]`))
    const joinText = (els: Element[]): string => els.map(text).join(' ').trim()
    // 课名: <font 截断 + <span 截断 (上游带尖括号 needle 语义保留)
    const courseName = text(courseHtml.body).length >= 0
      ? text(parseHtmlDoc(infoStr.split('<font')[0].split('<span>')[0].trim()).body)
      : ''
    const teacher = joinText(findByTitle('老师'))
    const room = joinText(findByTitle('教室')) + joinText(findByTitle('分组'))
    const tempStr = joinText(findByTitle('周次(节次)'))

    // 三分支周次/节次提取
    let weekStr: string
    let nodeParts: string[]
    if (tempStr.includes(' ')) {
      const parts = tempStr.split(' ')
      weekStr = parts[0]
      nodeParts = (parts[1] ?? '').replace(/^\[/, '').replace(/\]$/, '').split('-')
    } else if (tempStr.trim() === '') {
      weekStr = joinText(findByTitle('周次'))
      const nodeRaw = joinText(findByTitle('节次'))
      nodeParts = nodeRaw.includes(')') ? nodeRaw.split(')')[1].replace(/^\[/, '').replace(/\]$/, '').split('-') : nodeRaw.replace(/^\[/, '').replace(/\]$/, '').split('-')
    } else {
      weekStr = tempStr.includes(')') ? tempStr.split(')')[0] : tempStr
      const afterParen = tempStr.includes(')') ? tempStr.split(')')[1] : tempStr
      nodeParts = afterParen.replace(/^\[/, '').replace(/\]$/, '').split('-')
    }

    const weekList = weekStr.split(',')
    for (const item of weekList) {
      let startWeek: number
      let endWeek: number
      let type = 0
      if (item.includes('-')) {
        const weeks = item.split('-')
        startWeek = toIntOrNull((weeks[0] ?? '').trim()) ?? 0
        if (weeks.length > 1) {
          type = weeks[1].includes('单') ? 1 : weeks[1].includes('双') ? 2 : 0
          endWeek = toIntOrNull(weeks[1].split('(')[0].trim()) ?? 0
        } else {
          endWeek = startWeek
        }
      } else {
        startWeek = toIntOrNull(item.split('(')[0].trim()) ?? 0
        endWeek = startWeek
      }
      courseList.push({
        name: courseName,
        teacher,
        room,
        day,
        startNode: toIntOrNull((nodeParts[0] ?? '').split('节')[0].trim()) ?? 0,
        endNode: toIntOrNull((nodeParts[nodeParts.length - 1] ?? '').split('节')[0].trim()) ?? 0,
        startWeek,
        endWeek,
        type,
      })
    }
  }

  matchedFeatures(): string[] {
    const base = super.matchedFeatures()
    const doc = parseHtmlDoc(this.source)
    const withNode = Array.from(doc.querySelectorAll('[title="周次(节次)"]'))
    if (withNode.some((el) => text(el).includes(' '))) return [...base, 'title=周次(节次)空格']
    if (Array.from(doc.querySelectorAll('[title="周次"]')).length > 0) {
      return [...base, 'title=周次独立', 'title=节次独立']
    }
    return base
  }
}

/** JwOldQzParser — "需要 IE 的那种"老强智: <br> 分隔 + [周][节] 时间串; type 恒 0 */
export class JwOldQzParser implements JwParser {
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  generateCourseList(): JwCourse[] {
    const courseList: JwCourse[] = []
    const doc = parseHtmlDoc(this.source)
    const kbtable = getElementById(doc, 'kbtable')
    if (!kbtable) return courseList
    for (const tr of getElementsByTag(kbtable, 'tr')) {
      const tds = getElementsByTag(tr, 'td')
      if (tds.length === 0) continue
      // day 初始 -1: td[0]=节次标签 day=0, td[1..7]=周一..周日
      let day = -1
      for (const td of tds) {
        day++
        for (const div of getElementsByTag(td, 'div')) {
          // display:none 过滤 (带/不带空格两种写法, 有意偏离 upstream 的 bug fix)
          if (attrStyle(div) === 'display:none;') continue
          if (text(div).trim() === '') continue
          const split = div.innerHTML.split('<br>')
          let preIndex = -1
          const toCourse = () => {
            if (preIndex === -1) return
            const courseName = text(parseHtmlDoc(split[0]).body).trim()
            const room = text(parseHtmlDoc(split[preIndex + 1] ?? '').body).trim()
            const teacher = text(parseHtmlDoc(split[preIndex - 1] ?? '').body).trim()
            // 时间串 "1-16周[1-2节]" / "10周[1-2节]"
            const timeInfo = text(parseHtmlDoc(split[preIndex]).body).trim().split('周[')
            const head = timeInfo[0]
            const startWeek = head.includes('-') ? parseInt(head.split('-')[0], 10) : parseInt(head, 10)
            const endWeek = head.includes('-') ? parseInt(head.split('-')[1], 10) : parseInt(head, 10)
            const tail = timeInfo[1] ?? ''
            const startNode = parseInt(tail.split('-')[0], 10)
            const endNode = parseInt(tail.split('-')[1].split('节')[0], 10)
            courseList.push({
              name: courseName,
              room,
              teacher,
              day,
              startNode,
              endNode,
              startWeek,
              endWeek,
              type: 0,
            })
          }
          for (let i = 0; i < split.length; i++) {
            // 时间串四要素: [ ] 节 周
            if (split[i].includes('[') && split[i].includes(']') && split[i].includes('节') && split[i].includes('周')) {
              if (preIndex !== -1) toCourse()
              preIndex = i
            }
            if (i === split.length - 1) toCourse()
          }
        }
      }
    }
    return courseList
  }

  /** kbtable + [周][节] 四要素 = 100; 仅 kbtable = 50 */
  confidence(): number {
    const doc = parseHtmlDoc(this.source)
    if (!getElementById(doc, 'kbtable')) return 0
    const s = this.source
    const hasTimeToken = s.includes('[') && s.includes(']') && s.includes('周') && s.includes('节')
    return hasTimeToken ? 100 : 50
  }

  matchedFeatures(): string[] {
    const features: string[] = []
    const s = this.source
    if (s.includes('kbtable')) features.push('id=kbtable')
    if (s.includes('[') && s.includes('周') && s.includes('节')) features.push('单元格含[周][节]')
    return features
  }
}

/** style 属性去空格比较 */
function attrStyle(el: Element): string {
  return (el.getAttribute('style') ?? '').replace(/ /g, '')
}

// 保留 getElementsByClass 引用 (crazy 变体经由基类走 tableName)
void getElementsByClass
