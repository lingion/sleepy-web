/**
 * schools — 教务目录 (assets/schools.json + JwSchoolInfo.kt + JwImportViewModel.parseSchoolsJson 1:1)。
 *
 * 数据源: Android app/src/main/assets/schools.json 原样复制 (337 校, 29 协议)。
 * 与 Android 同构的解析规则: 任一键以 "_" 开头的对象是审计元数据块, 整条跳过;
 * status 缺失/未知 → 回落 supported。
 */

import raw from './schools.json'

export const STATUS_SUPPORTED = 'supported'
export const STATUS_PENDING = 'pending'
export const STATUS_GRAD_SUPPORTED = 'grad_supported'
export const STATUS_GRAD_PENDING = 'grad_pending'
export const STATUS_LEGACY = 'legacy'

const KNOWN_STATUS = new Set([
  STATUS_SUPPORTED,
  STATUS_PENDING,
  STATUS_GRAD_SUPPORTED,
  STATUS_GRAD_PENDING,
  STATUS_LEGACY,
])

/** JwSchoolInfo.kt 1:1 */
export interface SchoolInfo {
  /** 拼音首字母大写 (非字母 → 分组落 ★) */
  sortKey: string
  name: string
  url: string
  /** JwProtocol TYPE_*;空/缺失 → null */
  type: string | null
  aliases: string[]
  /** 全拼 (pypinyin 离线预生成) — 仅用于组内排序, 不参与匹配 */
  sortKeyFull: string
  status: string
}

interface RawEntry {
  sortKey?: unknown
  name?: unknown
  url?: unknown
  type?: unknown
  aliases?: unknown
  sortKeyFull?: unknown
  status?: unknown
  [k: string]: unknown
}

/** parseSchoolsJson — 审计块 (键以 _ 开头) 跳过;status 未知回落 supported */
export function parseSchoolsJson(entries: readonly RawEntry[]): SchoolInfo[] {
  const out: SchoolInfo[] = []
  for (const e of entries) {
    if (e === null || typeof e !== 'object') continue
    if (Object.keys(e).some((k) => k.startsWith('_'))) continue
    const status = typeof e.status === 'string' ? e.status : STATUS_SUPPORTED
    out.push({
      sortKey: typeof e.sortKey === 'string' ? e.sortKey : '',
      name: typeof e.name === 'string' ? e.name : '',
      url: typeof e.url === 'string' ? e.url : '',
      type: typeof e.type === 'string' && e.type !== '' ? e.type : null,
      aliases: Array.isArray(e.aliases) ? e.aliases.filter((a): a is string => typeof a === 'string') : [],
      sortKeyFull: typeof e.sortKeyFull === 'string' ? e.sortKeyFull : '',
      status: KNOWN_STATUS.has(status) ? status : STATUS_SUPPORTED,
    })
  }
  return out
}

/** 目录 (模块加载即解析, 与 Android 启动读 assets 等价) */
export const SCHOOLS: SchoolInfo[] = parseSchoolsJson(raw as RawEntry[])

/** isSupported — supported 与 grad_supported 都可点 (SchoolSelectScreen 判定同) */
export function isSupported(s: SchoolInfo): boolean {
  return s.status === STATUS_SUPPORTED || s.status === STATUS_GRAD_SUPPORTED
}

export function hasUrl(s: SchoolInfo): boolean {
  return s.url.trim() !== ''
}

/** 可点行 = 已适配且有 URL */
export function isSelectable(s: SchoolInfo): boolean {
  return isSupported(s) && hasUrl(s)
}

/** 行内状态徽标 — SchoolStatusBadge: supported 无徽标 */
export function statusBadge(s: SchoolInfo): { labelKey: string; bg: string; fg: string } | null {
  switch (s.status) {
    case STATUS_PENDING:
    case STATUS_GRAD_PENDING:
      return {
        labelKey: 'jw_pending_pending',
        bg: 'var(--md-tertiary-container)',
        fg: 'var(--md-on-tertiary-container)',
      }
    case STATUS_GRAD_SUPPORTED:
      return {
        labelKey: 'jw_pending_grad',
        bg: 'var(--md-secondary-container)',
        fg: 'var(--md-on-secondary-container)',
      }
    case STATUS_LEGACY:
      return {
        labelKey: 'jw_pending_legacy',
        bg: 'var(--md-surface-container-highest)',
        fg: 'var(--md-on-surface-variant)',
      }
    default:
      return null
  }
}

// ── 分组 / 排序 (SchoolSelectScreen.kt schoolSortKey + groupByLetter 1:1) ──

export interface SchoolSection {
  letter: string
  schools: SchoolInfo[]
}

/** 非字母 sortKey 归 ★ 组 */
export function letterOf(s: SchoolInfo): string {
  const c = s.sortKey.charAt(0)
  return s.sortKey.length > 0 && /[a-zA-Z]/.test(c) ? c.toUpperCase() : '★'
}

function schoolSortKey(s: SchoolInfo): string {
  return `${letterOf(s)}|${s.sortKeyFull !== '' ? s.sortKeyFull : s.name}`
}

export function groupByLetter(schools: readonly SchoolInfo[]): SchoolSection[] {
  if (schools.length === 0) return []
  const sorted = [...schools].sort((a, b) => {
    const ka = schoolSortKey(a)
    const kb = schoolSortKey(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const groups: SchoolSection[] = []
  const index = new Map<string, SchoolSection>()
  for (const s of sorted) {
    const letter = letterOf(s)
    let g = index.get(letter)
    if (!g) {
      g = { letter, schools: [] }
      index.set(letter, g)
      groups.push(g)
    }
    g.schools.push(s)
  }
  return groups
}

/**
 * 索引条 → 列表下标映射 — 表头占 1 个位置, 其后接 N 个学校行。
 * 返回 [{ letter, index }] 与 Android letterToIndex 同构。
 */
export function letterIndexMap(sections: readonly SchoolSection[]): Array<{ letter: string; index: number }> {
  const out: Array<{ letter: string; index: number }> = []
  let idx = 0
  for (const sec of sections) {
    out.push({ letter: sec.letter, index: idx })
    idx += 1 + sec.schools.length
  }
  return out
}

/** 当前首个可见行落在哪个字母段 — activeLetter 同构 */
export function activeLetterAt(
  sections: readonly SchoolSection[],
  firstVisibleIndex: number
): string | null {
  let running = 0
  for (const sec of sections) {
    const headerIdx = running
    const lastSchoolIdx = headerIdx + sec.schools.length
    if (firstVisibleIndex >= headerIdx && firstVisibleIndex <= lastSchoolIdx) return sec.letter
    running = lastSchoolIdx + 1
  }
  return null
}
