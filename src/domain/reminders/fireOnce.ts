/**
 * 提醒 fired-once 台账 — localStorage 持久化, key → "yyyy-MM-dd"。
 * 页内定时器 (scheduler) 每次触发前查/写: 同一天同一提醒只发一次,
 * 防 StrictMode 双挂载 / 引擎重建 / tick 竞态下的重复通知。
 */

const KEY = 'sleepy_reminder_fired'

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function alreadyFired(key: string, dayIso: string): boolean {
  return load()[key] === dayIso
}

export function markFired(key: string, dayIso: string): void {
  const map = load()
  map[key] = dayIso
  // 台账只留今天/昨天 — 日粒度键天然单调增长, 超量即裁剪
  const keep = new Set([dayIso, yesterdayOf(dayIso)])
  for (const k of Object.keys(map)) {
    if (!keep.has(map[k])) delete map[k]
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* 配额/隐私模式静默 (persistReminderPrefs 同) */
  }
}

function yesterdayOf(dayIso: string): string {
  const [y, m, d] = dayIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return toIsoDay(dt)
}

export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
