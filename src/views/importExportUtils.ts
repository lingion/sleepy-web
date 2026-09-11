/**
 * 导入/导出/编辑共用工具 — Kotlin DateUtils/ImportSheet 辅助函数 1:1
 */

/** normalizeStartDate — DateUtils.kt: 任意日期归一到该周周一 (issue #5 周一归一) */
export function normalizeStartDateToMonday(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return raw
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return raw
  const shift = (d.getDay() + 6) % 7 // 周一=0 … 周日=6
  d.setDate(d.getDate() - shift)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
