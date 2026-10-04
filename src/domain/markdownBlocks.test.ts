/**
 * 更新日志 Markdown 解析 (MarkdownBlocksTest.kt 1:1 移植)。
 * 替换黑盒渲染: 解析出的块结构由 UpdateChangelogDialog 显式排版,
 * 标题/列表/粗体/链接都有确定的视觉结果, 不依赖第三方库的隐式行为。
 */

import { describe, it, expect } from 'vitest'
import { parse, parseInline, type Block, type Inline } from './markdownBlocks'

const text = (s: string): Inline => ({ kind: 'text', text: s })
const join = (spans: Inline[]) => spans.map((s) => s.text).join('')
const bullets = (blocks: Block[]) =>
  blocks.filter((b): b is Extract<Block, { kind: 'bullet' }> => b.kind === 'bullet').flatMap((b) => b.items)

describe('markdownBlocks', () => {
  it('parsesHeadingLevels', () => {
    expect(parse('## New\n\nbody')).toEqual([
      { kind: 'heading', level: 2, text: 'New' },
      { kind: 'paragraph', text: 'body' },
    ])
  })

  it('parsesConsecutiveListItemsIntoOneGroup', () => {
    expect(parse('- a\n- b\n- c')).toEqual([{ kind: 'bullet', items: ['a', 'b', 'c'] }])
  })

  it('keepsListSplitFromParagraph', () => {
    expect(parse('intro:\n\n- a\n- b')).toEqual([
      { kind: 'paragraph', text: 'intro:' },
      { kind: 'bullet', items: ['a', 'b'] },
    ])
  })

  it('inlineBoldAndCodeAndLinkSplit', () => {
    expect(parseInline('看 **加粗** 和 `code` 与 [链接](https://x.y)')).toEqual([
      text('看 '),
      { kind: 'bold', text: '加粗' },
      text(' 和 '),
      { kind: 'code', text: 'code' },
      text(' 与 '),
      { kind: 'link', text: '链接', url: 'https://x.y' },
    ])
  })

  it('plainTextYieldsSingleParagraph', () => {
    const blocks = parse('v1.0.40\n\nThree additions and one fix.')
    expect(blocks.length).toBe(2)
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true)
  })

  it('githubBulletWithNestedIndentIsTreatedAsListItem', () => {
    const blocks = parse('- a\n  - b')
    expect(bullets(blocks)).toEqual(['a', 'b'])
  })

  // ==== 探针: 覆盖 release notes 会出现的冷门/畸形 Markdown ====

  const probeBody = [
    '# 渲染探针一级标题',
    '',
    '## 二级标题: 粗体和代码',
    '',
    '这一段里有 **粗体片段**、`inline_code` 和 [一个链接](https://github.com/lingion/sleepy) 混排, 用来验证行内三种 span 共存时的切分顺序。',
    '',
    '### 三级标题: 列表形态',
    '',
    '- 纯文本列表项一',
    '- 含 **加粗** 的列表项二',
    '- 含 `代码` 的列表项三',
    '- 含 [链接文字](https://github.com) 的列表项四',
    '  - 带缩进的子项(应当被拍平成同级)',
    '* 星号列表项(另一种列表符)',
    '+ 加号列表项(第三种列表符)',
    '',
    '#### 四级标题: 段落折行',
    '',
    '第一行文字,',
    '第二行文字会被合并进同一个段落,',
    '第三行同样。',
    '',
    '##### 五级标题: 边界之前',
    '',
    '下面是奇葩边界:',
    '',
    '**未闭合的粗体段',
    '单独一个反引号 ` 出现在行中',
    '空方括号链接 []() 应原样保留',
    '嵌套括号 URL [文字](https://en.wikipedia.org/wiki/Sleep_(disorder))',
    '行首**粗体**紧贴行首',
    '行尾粗体紧贴行尾**',
    '###### 六级标题: 尽头',
    '',
    '连续多个空行上方, 下方是缩进列表:',
    '',
    '  - 缩进两个空格的项',
    '\t- tab 开头的项(注意这是 tab)',
    '',
    '普通文字恢复。本段结束后整个探针结束。',
  ].join('\n')

  it('probeHeadingsParseWithCorrectLevels', () => {
    const levels = parse(probeBody)
      .filter((b): b is Extract<Block, { kind: 'heading' }> => b.kind === 'heading')
      .map((b) => b.level)
    expect(levels).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('probeMixedListMarkersAllBecomeBulletItems', () => {
    const items = bullets(parse(probeBody))
    expect(items.length).toBe(9)
    expect(items.some((i) => i.startsWith('带缩进的子项'))).toBe(true)
    expect(items.some((i) => i.startsWith('星号列表项'))).toBe(true)
    expect(items.some((i) => i.startsWith('加号列表项'))).toBe(true)
    expect(items.some((i) => i.startsWith('缩进两个空格的项'))).toBe(true)
    expect(items.some((i) => i.startsWith('tab 开头的项'))).toBe(true)
  })

  it('probeUnclosedBoldStaysAsText', () => {
    expect(join(parseInline('**未闭合的粗体段'))).toBe('**未闭合的粗体段')
  })

  it('probeNestedParenUrlLinkParses', () => {
    const joined = join(parseInline('[文字](https://en.wikipedia.org/wiki/Sleep_(disorder))'))
    expect(joined).toContain('文字')
  })

  it('probeNoContentLossAcrossWholeBody', () => {
    const blocks = parse(probeBody)
    const allInline = blocks
      .flatMap((b) =>
        b.kind === 'heading' ? [parseInline(b.text)]
        : b.kind === 'bullet' ? b.items.map(parseInline)
        : [parseInline(b.text)],
      )
      .flat()
    const rendered = join(allInline)
    const cjk = (s: string) => new Set([...s].filter((c) => c.codePointAt(0)! >= 0x4e00 && c.codePointAt(0)! <= 0x9fff))
    expect(cjk(rendered)).toEqual(cjk(probeBody))
  })
})
