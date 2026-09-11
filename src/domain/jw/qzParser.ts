/**
 * JwQzParser — Kotlin data/jw/JwQzParser.kt 1:1 移植 (强智基础版)
 * 抓取 #kbtable, div[class=tableName] 变体由子类重写 tableName。
 * T2: title="老师" → "教师" fallback 链保留。
 * 缺 #kbtable 抛 JwParseException(NO_TABLE_CONTAINER_MARKER)。
 */

import {
  parseHtmlDoc, getElementsByTag, getElementById, getElementsByClass, text,
  toIntOrNull, type JwCourse, type JwParser,
} from './jwCourse'
import { JwParseException, NO_TABLE_CONTAINER_MARKER } from './jwFetchError'

export class JwQzParser implements JwParser {
  readonly source: string

  /** 课表单元格内 class 名 (crazy 变体为 kbcontent1) */
  readonly tableName: string

  constructor(source: string, tableName = 'kbcontent') {
    this.source = source
    this.tableName = tableName
  }

  parseCourseName(infoStr: string): string {
    const before = infoStr.split('<font')[0].trim()
    const doc = parseHtmlDoc(before)
    return text(doc.body)
  }

  convert(day: number, nodeCount: number, infoStr: string, courseList: JwCourse[]): void {
    const node = nodeCount * 2 - 1
    const courseHtml = parseHtmlDoc(infoStr)
    const courseName = this.parseCourseName(infoStr)
    // T2: 老师 → 教师 fallback
    const findByTitle = (t: string): Element[] => Array.from(courseHtml.querySelectorAll(`[title="${t}"]`))
    const joinText = (els: Element[]): string => els.map(text).join(' ').trim()
    let teacher = joinText(findByTitle('老师'))
    if (teacher === '') teacher = joinText(findByTitle('教师'))
    const room =
      joinText(findByTitle('教室')) + joinText(findByTitle('分组'))
    const weekEl = findByTitle('周次(节次)')
    const weekStr = joinText(weekEl).split('(周)')[0].trim()
    const weekList = weekStr.split(',')

    let startWeek = 0
    let endWeek = 0
    let type = 0

    for (const weekItem of weekList) {
      if (weekItem.includes('-')) {
        const weeks = weekItem.split('-')
        if (weeks.length > 0) startWeek = toIntOrNull(weeks[0].trim()) ?? 1
        if (weeks.length > 1) {
          type = weeks[1].includes('单') ? 1 : weeks[1].includes('双') ? 2 : 0
          // 兼容 "1-16周" / "1-16周(单)" / "1-16(单)" / "1-16"
          endWeek =
            toIntOrNull(
              weeks[1]
                .replace(/周/g, '')
                .replace(/[()]/g, '')
                .replace(/单/g, '')
                .replace(/双/g, '')
                .trim()
                .replace(/\D/g, ''),
            ) ?? startWeek
        }
      } else {
        type = weekItem.includes('单') ? 1 : weekItem.includes('双') ? 2 : 0
        const v =
          toIntOrNull(
            weekItem
              .replace(/周/g, '')
              .replace(/单/g, '')
              .replace(/双/g, '')
              .split('(')[0]
              .trim()
              .replace(/\D/g, ''),
          ) ?? 1
        startWeek = v
        endWeek = v
      }
      courseList.push({
        name: courseName,
        room,
        teacher,
        day,
        startNode: node,
        endNode: node + 1,
        startWeek,
        endWeek,
        type,
      })
    }
  }

  generateCourseList(): JwCourse[] {
    const courseList: JwCourse[] = []
    const doc = parseHtmlDoc(this.source)
    const kbTable = getElementById(doc, 'kbtable')
    if (!kbTable) {
      // T8: 抛诊断异常而非静默
      throw new JwParseException('页面缺少 #kbtable，可能未到达课表页/选错教务类型', [
        {
          parserName: 'JwQzParser',
          type: 'qz',
          courseCount: 0,
          confidence: this.confidence(),
          matchedFeatures: this.matchedFeatures(),
          exception: NO_TABLE_CONTAINER_MARKER,
        },
      ])
    }
    const trs = getElementsByTag(kbTable, 'tr')
    let nodeCount = 0
    for (const tr of trs) {
      const tds = getElementsByTag(tr, 'td')
      if (tds.length === 0) continue
      nodeCount++
      let day = 0
      for (const td of tds) {
        day++
        for (const div of getElementsByTag(td, 'div')) {
          const courseElements = getElementsByClass(div, this.tableName)
          if (courseElements.map(text).join('').trim() === '') continue
          const courseHtml = courseElements[0].innerHTML
          let startIndex = 0
          let splitIndex = courseHtml.indexOf('-----')
          while (splitIndex !== -1) {
            this.convert(day, nodeCount, courseHtml.substring(startIndex, splitIndex), courseList)
            startIndex = courseHtml.indexOf('<br>', splitIndex) + 4
            splitIndex = courseHtml.indexOf('-----', startIndex)
          }
          this.convert(day, nodeCount, courseHtml.substring(startIndex), courseList)
        }
      }
    }
    return courseList
  }

  /** 命中三件套=100; kbtable+kbcontent=70; 仅 kbtable=30 */
  confidence(): number {
    try {
      const doc = parseHtmlDoc(this.source)
      const kbtable = getElementById(doc, 'kbtable')
      if (!kbtable) return 0
      const count = (t: string) => Array.from(doc.querySelectorAll(`[title="${t}"]`)).length
      const fontCount = count('老师') + count('教师') + count('教室') + count('周次(节次)')
      if (fontCount >= 3) return 100
      if (getElementsByClass(kbtable, this.tableName).length > 0) return 70
      return 30
    } catch {
      return 0
    }
  }

  matchedFeatures(): string[] {
    try {
      const doc = parseHtmlDoc(this.source)
      const features: string[] = []
      if (getElementById(doc, 'kbtable')) features.push('id=kbtable')
      if (getElementsByClass(doc, this.tableName).length > 0) features.push(`class=${this.tableName}`)
      const has = (t: string) => Array.from(doc.querySelectorAll(`[title="${t}"]`)).length > 0
      if (has('老师')) features.push('title=老师')
      if (has('教师')) features.push('title=教师')
      if (has('教室')) features.push('title=教室')
      if (has('周次(节次)')) features.push('title=周次(节次)')
      return features
    } catch {
      return []
    }
  }
}
