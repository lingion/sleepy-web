/**
 * 导入格式说明 — 纯逻辑层 (Android ImportSheet.kt FormatDetailDialog 的取值/解码规则)
 *
 * Android 侧约定 (改解析器必须同步改文案, 见 ImportSheet.kt:565-573 注释):
 *  - 标题     format_*            (string)
 *  - 何时用   format_*_when       (string)
 *  - 识别要求 @format_*_spec       (string-array → 主 JSON 里以 @ 前缀存数组)
 *  - 示例     format_*_example    (string, formatted="false" → \n \t 是字面两字符)
 * 纯文本独有 "AI 截图转换" 区: ai_prompt_title / ai_prompt_hint / ai_prompt_text / copy_prompt。
 *
 * 本文件只做无副作用的取值与解码, 便于单测; 渲染在 FormatDetailDialog.tsx。
 */

/** 与 Android private enum ImportFormat 一一对应 */
export type ImportFormat = 'WAKEUP_SHARE' | 'WAKEUP_JSON' | 'ICS' | 'CSV' | 'HTML' | 'PLAIN'

/** 与 Android "支持格式" 列表顺序一致 (ImportSheet.kt:318-352) */
export const IMPORT_FORMATS: readonly ImportFormat[] = [
  'WAKEUP_SHARE',
  'WAKEUP_JSON',
  'ICS',
  'CSV',
  'HTML',
  'PLAIN',
]

interface FormatKeys {
  /** 弹窗标题 + 支持格式列表行课名 */
  title: string
  /** 列表行副标题 */
  desc: string
  /** 什么时候用 */
  when: string
  /** 识别要求 (string-array, @ 前缀) */
  spec: string
  /** 示例 (monospace 块) */
  example: string
}

/** ImportSheet.kt titleRes/whenRes/specRes/exampleRes 四段 when 表的等价映射 */
export const FORMAT_KEYS: Record<ImportFormat, FormatKeys> = {
  WAKEUP_SHARE: {
    title: 'format_wakeup_share',
    desc: 'format_wakeup_desc',
    when: 'format_wakeup_share_when',
    spec: '@format_wakeup_share_spec',
    example: 'format_wakeup_share_example',
  },
  WAKEUP_JSON: {
    title: 'format_wakeup_json',
    desc: 'format_json_desc',
    when: 'format_wakeup_json_when',
    spec: '@format_wakeup_json_spec',
    example: 'format_wakeup_json_example',
  },
  ICS: {
    title: 'format_ics',
    desc: 'format_ics_desc',
    when: 'format_ics_when',
    spec: '@format_ics_spec',
    example: 'format_ics_example',
  },
  CSV: {
    title: 'format_csv',
    desc: 'format_csv_desc',
    when: 'format_csv_when',
    spec: '@format_csv_spec',
    example: 'format_csv_example',
  },
  HTML: {
    title: 'format_html',
    desc: 'format_html_desc',
    when: 'format_html_when',
    spec: '@format_html_spec',
    example: 'format_html_example',
  },
  PLAIN: {
    title: 'format_plain',
    desc: 'format_plain_desc',
    when: 'format_plain_when',
    spec: '@format_plain_spec',
    example: 'format_plain_example',
  },
}

/** 只有纯文本格式带 "AI 截图转换" 区 (ImportSheet.kt:653) */
export function hasAiPromptSection(format: ImportFormat): boolean {
  return format === 'PLAIN'
}

/**
 * 示例块解码 — Android: stringResource(exampleRes).replace("\\n","\n").replace("\\t","\t")
 * strings.xml 里 formatted="false" 的 \n/\t 是字面两字符, 不还原就挤成一行。
 */
export function decodeExampleBlock(raw: string): string {
  return raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

/**
 * Prompt 展示解码 — Android 展示路径只做 \n 还原 (ImportSheet.kt:690),
 * 故意不动 \t: Prompt 正文里「制表符写成 \t」讲的是字面两字符, 还原成真制表符反而误导。
 */
export function decodePromptForDisplay(raw: string): string {
  return raw.replace(/\\n/g, '\n')
}

/**
 * Prompt 复制解码 — Android 复制路径 (ImportSheet.kt:700-706) 在展示解码之上
 * 再还原 XML 实体 &lt; &gt; &amp;, 顺序不可调换 (&amp; 必须最后, 否则 &amp;lt; 会被二次解码)。
 */
export function decodePromptForClipboard(raw: string): string {
  return decodePromptForDisplay(raw)
    .replace(/\\t/g, '\t')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * string-array 型 i18n 键 → 条目数组。
 * 主 JSON 用 @ 前缀存真数组 (i18next returnObjects)。
 * 未命中时 i18next 会把 key 本身当字符串返回, 故字符串回落路径要求至少两行才算真内容,
 * 避免把 "@format_ics_spec" / "[object Object]" 这类哨兵渲染成一条假要求。
 */
export function toSpecItems(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  }
  if (typeof raw === 'string') {
    const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean)
    return lines.length > 1 ? lines : []
  }
  return []
}
