/**
 * jw 基础 — JwCourse 中间结构 + jsoup 风格 DOM 辅助 (data/jw 移植基建)
 *
 * 浏览器与 vitest(jsdom) 均有 window.DOMParser — 解析器实现与运行时/测试同构。
 * JwCourse 字段语义与 Kotlin data class 1:1 (wakeup Apache-2.0 精简复刻)。
 */

export interface JwCourse {
  name: string
  room: string
  teacher: string
  /** 周几 1-7 (周一=1) */
  day: number
  startNode: number
  endNode: number
  startWeek: number
  endWeek: number
  /** 0=每周 1=单周 2=双周 3=按周次 */
  type: number
}

/** JwParser 抽象 — source + generateCourseList + confidence (Kotlin 同构) */
export interface JwParser {
  readonly source: string
  generateCourseList(): JwCourse[]
  confidence(): number
  matchedFeatures(): string[]
}

/** jsoup-style: 解析 HTML → Document (DOMParser; script/style 内容保留原文本节点) */
export function parseHtmlDoc(html: string): Document {
  // DOMParser text/html: 'image'/'svg' 等无需; 教务 HTML 均 text/html
  return new DOMParser().parseFromString(html, 'text/html')
}

export function getElementById(doc: Document | Element, id: string): Element | null {
  const root = (doc as Document).getElementById ? (doc as Document) : null
  if (root) return root.getElementById(id)
  return (doc as Element).querySelector(`[id="${cssEscape(id)}"]`)
}

export function getElementsByTag(root: Document | Element, tag: string): Element[] {
  const els = Array.from(root.getElementsByTagName(tag))
  // jsoup 语义: getElementsByTag 含自身 (div.getElementsByTag('div') 返回自己)
  if ((root as Element).tagName && (root as Element).tagName.toLowerCase() === tag.toLowerCase()) {
    return [root as Element, ...els]
  }
  return els
}

/** jsoup 语义: class 查找含自身 (div.getElementsByClass(cls) 返回自己) */
export function getElementsByClass(root: Document | Element, cls: string): Element[] {
  const out: Element[] = []
  const rootEl = root as Element
  if (rootEl.classList && rootEl.classList.contains(cls)) out.push(rootEl)
  out.push(...Array.from(root.getElementsByClassName(cls)))
  return out
}

/** jsoup selectFirst 简化: CSS 选择器首个命中 (含自身语义由调用方处理) */
export function selectFirst(root: Document | Element, selector: string): Element | null {
  return root.querySelector(selector)
}

/** jsoup .text(): 全部后代文本拼接 (空白折叠) — 与 jsoup 语义一致 */
export function text(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** jsoup .html(): 内部 HTML */
export function innerHtml(el: Element): string {
  return el.innerHTML
}

export function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? ''
}

/** CSS.escape 兜底 (选择器内 id 含特殊字符) */
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s)
  return s.replace(/["\\]/g, '\\$&')
}

// ── 共享字符串解析 (各 parser 重复逻辑上提, 与 Kotlin 各自内联实现逐字对齐) ──

/** Kotlin String.toIntOrNull 全串严格整数 */
export function toIntOrNull(s: string): number | null {
  return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null
}

/** 单双周后缀枚举 — JwNewZfParser.parseWeekStr type 判定 */
export function weekSuffixType(part: string): 0 | 1 | 2 {
  if (part.includes('(单)') || part.includes('(单周)') || part.endsWith('单') || part.endsWith('单周')) return 1
  if (part.includes('(双)') || part.includes('(双周)') || part.endsWith('双') || part.endsWith('双周')) return 2
  return 0
}

/** bitmap 周 → ranges — bitsToRanges: 连续段合并, 步长2=单/双周 */
export function bitsToRanges(weeks: number[]): Array<[number, number, number]> {
  if (weeks.length === 0) return []
  const result: Array<[number, number, number]> = []
  let i = 0
  while (i < weeks.length) {
    const start = weeks[i]
    let end = start
    if (i + 1 < weeks.length && weeks[i + 1] - start === 2) {
      end = weeks[i + 1]
      let k = i + 1
      while (k + 1 < weeks.length && weeks[k + 1] - weeks[k] === 2) { k++; end = weeks[k] }
      const type = start % 2 === 1 ? 1 : 2
      result.push([start, end, type])
      i = k + 1
    } else if (i + 1 < weeks.length && weeks[i + 1] - start === 1) {
      end = weeks[i + 1]
      let k = i + 1
      while (k + 1 < weeks.length && weeks[k + 1] - weeks[k] === 1) { k++; end = weeks[k] }
      result.push([start, end, 0])
      i = k + 1
    } else {
      result.push([start, end, 0])
      i++
    }
  }
  return result
}
