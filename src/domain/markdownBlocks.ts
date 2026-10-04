/**
 * 更新日志 Markdown 解析 — MarkdownBlocks.kt 1:1。
 *
 * 取代第三方 Markdown 渲染: 解析出确定性的块结构 Block + 行内结构 Inline,
 * 由 UpdateChangelogDialog 显式排版 — 每种块的实际视觉结果由本仓库代码决定。
 *
 * 覆盖 release notes 实际用到的语法: # 标题、- 列表、**粗体**、`代码`、
 * [文字](链接)、普通段落。其余 Markdown 语法按普通文本原样显示(安全兜底)。
 */

/** 块级元素 */
export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; items: string[] }
  | { kind: 'paragraph'; text: string }

/** 行内元素 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string }

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const BULLET_RE = /^[-*+]\s+(.*)$/

export function parse(markdown: string): Block[] {
  const blocks: Block[] = []
  let listItems: string[] = []
  let paragraphLines: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ kind: 'bullet', items: listItems })
      listItems = []
    }
  }
  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ').trim() })
      paragraphLines = []
    }
  }
  const flushAll = () => { flushList(); flushParagraph() }

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    const t = line.trim()
    const heading = HEADING_RE.exec(t)
    const bullet = BULLET_RE.exec(t)
    if (t === '') {
      flushAll()
    } else if (heading) {
      flushAll()
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
    } else if (bullet) {
      flushParagraph()
      listItems.push(t.slice(1).trim())
    } else {
      flushList()
      paragraphLines.push(t)
    }
  }
  flushAll()
  return blocks
}

const INLINE_PATTERNS = [
  /\*\*(.+?)\*\*/,            // bold
  /`([^`]+)`/,                 // code
  /\[([^\]]+)\]\(([^)]+)\)/,   // link
]

/** 行内解析: **粗体**、`代码`、[文字](链接) → 有序 span 列表 */
export function parseInline(text: string): Inline[] {
  const spans: Inline[] = []
  // 一趟扫描, 三种模式按出现位置取最早
  let i = 0
  while (i < text.length) {
    let bestIdx = -1
    let bestKind = -1
    let bestMatch: RegExpExecArray | null = null
    for (let kind = 0; kind < INLINE_PATTERNS.length; kind++) {
      const p = new RegExp(INLINE_PATTERNS[kind].source)
      p.lastIndex = 0
      const m = p.exec(text.slice(i))
      if (m !== null && (bestMatch === null || i + m.index < bestIdx)) {
        bestIdx = i + m.index
        bestKind = kind
        bestMatch = m
      }
    }
    if (bestMatch === null) {
      spans.push({ kind: 'text', text: text.slice(i) })
      break
    }
    if (bestIdx > i) {
      spans.push({ kind: 'text', text: text.slice(i, bestIdx) })
    }
    if (bestKind === 0) spans.push({ kind: 'bold', text: bestMatch[1] })
    else if (bestKind === 1) spans.push({ kind: 'code', text: bestMatch[1] })
    else spans.push({ kind: 'link', text: bestMatch[1], url: bestMatch[2] })
    i = bestIdx + bestMatch[0].length
  }
  return spans.filter((s) => s.kind !== 'text' || s.text !== '')
}
