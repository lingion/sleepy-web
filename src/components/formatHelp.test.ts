/**
 * formatHelp 纯逻辑契约测试 — Android ImportSheet.kt FormatDetailDialog 取值/解码基准。
 *
 * 锁两件事:
 *  1) 六种格式的 i18n 键在 6 语言资源里全部真实存在 (spec 必须是非空数组) —
 *     防止"弹窗开了但某语言一片空白"。
 *  2) \n / \t / XML 实体三条解码路径与 Android 逐字符一致 (展示 ≠ 复制, 是有意为之)。
 */

import { describe, it, expect } from 'vitest'
import { resources, SUPPORTED_LANGS, type Lang } from '../i18n'
import {
  FORMAT_KEYS,
  IMPORT_FORMATS,
  decodeExampleBlock,
  decodePromptForClipboard,
  decodePromptForDisplay,
  hasAiPromptSection,
  toSpecItems,
} from './formatHelp'

function table(lang: Lang): Record<string, unknown> {
  return resources[lang].translation as Record<string, unknown>
}

describe('FORMAT_KEYS — 与 Android 资源键一一对应', () => {
  it('覆盖且只覆盖 Android ImportFormat 六个枚举值', () => {
    expect([...IMPORT_FORMATS].sort()).toEqual(
      ['CSV', 'HTML', 'ICS', 'PLAIN', 'WAKEUP_JSON', 'WAKEUP_SHARE'].sort(),
    )
    expect(Object.keys(FORMAT_KEYS).sort()).toEqual([...IMPORT_FORMATS].sort())
  })

  it.each(SUPPORTED_LANGS)('%s: 标题/副标题/何时用/示例 全部有真实文案', (lang) => {
    const tr = table(lang)
    for (const fmt of IMPORT_FORMATS) {
      const keys = FORMAT_KEYS[fmt]
      for (const [field, key] of Object.entries(keys)) {
        if (field === 'spec') continue
        expect(typeof tr[key], `${lang}/${fmt}.${field} (${key})`).toBe('string')
        expect((tr[key] as string).trim(), `${lang}/${fmt}.${field} (${key})`).not.toBe('')
      }
    }
  })

  it.each(SUPPORTED_LANGS)('%s: 识别要求是非空字符串数组', (lang) => {
    const tr = table(lang)
    for (const fmt of IMPORT_FORMATS) {
      const items = toSpecItems(tr[FORMAT_KEYS[fmt].spec])
      expect(items.length, `${lang}/${fmt} spec`).toBeGreaterThan(0)
    }
  })

  it('AI Prompt 三键在 6 语言齐备 (纯文本格式弹窗依赖)', () => {
    for (const lang of SUPPORTED_LANGS) {
      const tr = table(lang)
      for (const key of ['ai_prompt_title', 'ai_prompt_hint', 'ai_prompt_text', 'copy_prompt']) {
        expect((tr[key] as string) ?? '', `${lang}/${key}`).toBeTruthy()
      }
    }
  })

  it('只有纯文本格式带 AI 截图转换区', () => {
    expect(hasAiPromptSection('PLAIN')).toBe(true)
    for (const fmt of IMPORT_FORMATS.filter((f) => f !== 'PLAIN')) {
      expect(hasAiPromptSection(fmt)).toBe(false)
    }
  })
})

describe('解码路径 — Android ImportSheet.kt 逐字符基准', () => {
  it('示例块: 字面 \\n / \\t 还原成真换行与制表符', () => {
    expect(decodeExampleBlock('A\\nB\\tC')).toBe('A\nB\tC')
  })

  it('示例块: 真换行不受影响, 幂等', () => {
    const once = decodeExampleBlock('a\\nb')
    expect(once).toBe('a\nb')
    expect(decodeExampleBlock(once)).toBe(once)
  })

  it('Prompt 展示: 只还原 \\n, 保留字面 \\t (Prompt 正文讲的是两字符转义)', () => {
    expect(decodePromptForDisplay('x\\ny\\tz')).toBe('x\ny\\tz')
  })

  it('Prompt 复制: \\n + \\t + XML 实体全还原', () => {
    expect(decodePromptForClipboard('x\\ny\\tz &lt;b&gt; &amp;amp;')).toBe('x\ny\tz <b> &amp;')
  })

  it('Prompt 复制: &amp;amp; 必须最后解码, 否则 &amp;lt; 被二次还原成 <', () => {
    // 资源里存的是 &amp;lt; — 期望结果是字面 &lt;, 不是 <
    expect(decodePromptForClipboard('含 &amp;lt; 字符')).toBe('含 &lt; 字符')
  })
})

describe('toSpecItems — string-array 取值', () => {
  it('数组: 原样保留顺序', () => {
    expect(toSpecItems(['b', 'a'])).toEqual(['b', 'a'])
  })

  it('数组: 丢掉非字符串与空白项', () => {
    expect(toSpecItems(['ok', '', '  ', 3, null, undefined, {}])).toEqual(['ok'])
  })

  it('回落成字符串时按行拆', () => {
    expect(toSpecItems('第一行\n第二行\n')).toEqual(['第一行', '第二行'])
  })

  it('i18next 未命中返回的 key 本身 / 垃圾值 → 空数组 (不渲染假条目)', () => {
    expect(toSpecItems('@format_ics_spec')).toEqual([])
    expect(toSpecItems('[object Object]')).toEqual([])
    expect(toSpecItems(undefined)).toEqual([])
    expect(toSpecItems(null)).toEqual([])
  })
})
