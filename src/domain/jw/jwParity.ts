/**
 * 单/双周 (parity) 共享工具 — Kotlin data/jw/JwParity.kt 1:1 移植。
 * zju/ustc/seu/neu/scu/eams5 六 parser 同型端点修正的单一实现。
 *
 * Sleepy 语义: type 0=每周 1=单周(奇数周) 2=双周(偶数周)。
 * 修正后超出 endWeek (端点相等场景 "6-6(单)" → 7,6) 时把 end 抬到 start。
 */

export function jwAdjustedRange(startWeek: number, endWeek: number, parity: number): [number, number] {
  if (parity !== 1 && parity !== 2) return [startWeek, endWeek]
  const start = parity === 1
    ? (startWeek % 2 === 0 ? startWeek + 1 : startWeek)
    : (startWeek % 2 !== 0 ? startWeek + 1 : startWeek)
  return [start, Math.max(endWeek, start)]
}