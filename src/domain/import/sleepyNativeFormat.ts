/**
 * sleepy-v1 原生格式 — 纯函数层 (规范 §2/§3/§5/§6.1/§8.1-3)。
 * 移植蓝本: sleepy/app/src/main/java/com/lingion/sleepy/data/parser/SleepyNativeFormat.kt (279 行, 1:1)
 *
 * 行式竖线分列: magic 行 `#sleepy-v1` + T(表)/N(作息)/Nd(预设)/C(课程, 恒10列+可选第11列别名)/z(校验) 行。
 */
import { parseNodes } from '../timeTable'

// ---- magic 识别 (§6.1) ----

/**
 * 行首锚定: ≤4 字符引用/空白前缀 + 1-2 个井号(半/全角) + sleepy + 可选拼缝 + v + 数字。
 * 整模式大小写不敏感; 允许尾随标点(§6.3-M)。
 */
const MAGIC_RE = /^[>\s]{0,4}[#＃]{1,2}\s*sleepy[\s\-_－]*v(\d+)/i

/** magic 必须位于前 32 个非空行之一(微信长转发头) */
export const MAGIC_WINDOW = 32

/** 识别 sleepy-v* 家族。返回版本号(1=本格式), 未命中 -1。作用于归一后的 trimmed 文本。 */
export function detectVersion(trimmed: string): number {
  let seen = 0
  for (const line of trimmed.split('\n')) {
    if (line.trim() === '') continue
    seen++
    if (seen > MAGIC_WINDOW) return -1
    const t = line.trim().replace(/\r$/, '')
    const m = MAGIC_RE.exec(t)
    if (m) {
      const v = parseInt(m[1], 10)
      return Number.isNaN(v) ? -1 : v
    }
  }
  return -1
}

// ---- 转义 (§3.3) ----

const RESERVED = ['\\', '|', '"', '\n', '\t', '<', '{', '(']

/** 导出端转义 8 字符: \ | " \n \t < { ( */
export function escape(s: string): string {
  if (!RESERVED.some((c) => s.includes(c))) return s
  let out = ''
  for (const c of s) {
    switch (c) {
      case '\\': out += '\\\\'; break
      case '|': out += '\\|'; break
      case '"': out += '\\"'; break
      case '\n': out += '\\n'; break
      case '\t': out += '\\t'; break
      case '<': case '{': case '(': out += '\\' + c; break
      default: out += c
    }
  }
  return out
}

/** 导入端: \n→换行 \t→制表; 其余 \x → 字面 x; 尾部孤立 \ → 字面 \ */
export function unescape(s: string): string {
  if (!s.includes('\\')) return s
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n
      i += 2
    } else {
      out += c
      i++
    }
  }
  return out
}

// ---- 调色板 (§3.2, 9 色冻结 8 位规范形) ----

export const AUTO_COLOR = '#FF6750A4'

export const PALETTE: Record<number, string> = {
  1: '#FFEADDFF', 2: '#FFFFD8E4', 3: '#FFFFDCC4',
  4: '#FFFFF2B8', 5: '#FFD4F7C5', 6: '#FFC5F2E3',
  7: '#FFC9E8FF', 8: '#FFCDD7FF', 9: '#FFF2C4DE',
}

const PALETTE_BY_VALUE: Record<string, number> = {}
for (const [k, v] of Object.entries(PALETTE)) PALETTE_BY_VALUE[v.toUpperCase()] = Number(k)

/** 归一为 8 位 #AARRGGBB 大写; 非法 → null */
function normalizeColor(color: string): string | null {
  const t = color.trim().toUpperCase()
  if (!t.startsWith('#')) return null
  const hex = t.slice(1)
  if (!/^[0-9A-F]*$/.test(hex)) return null
  if (hex.length === 6) return '#FF' + hex
  if (hex.length === 8) return '#' + hex
  return null
}

/** 导出: 课程色 → token。自动色哨兵→空; 调色板命中→索引; FF alpha 其他→#RRGGBB; 非 FF→#AARRGGBB; 垃圾→空 */
export function colorToToken(color: string): string {
  const norm = normalizeColor(color)
  if (!norm) return ''
  if (norm === AUTO_COLOR.toUpperCase()) return ''
  const idx = PALETTE_BY_VALUE[norm]
  if (idx !== undefined) return String(idx)
  return norm.startsWith('#FF') ? '#' + norm.slice(3) : norm
}

/** 导入: token → 课程色。索引→规范形; #6 位→补 FF; #8 位→原样; 空/非法→自动色 */
export function colorFromToken(token: string): string {
  const t = token.trim()
  if (t === '') return AUTO_COLOR
  if (/^\d+$/.test(t)) {
    const idx = parseInt(t, 10)
    return PALETTE[idx] ?? AUTO_COLOR
  }
  if (t.startsWith('#')) {
    const hex = t.slice(1).toUpperCase()
    if (hex.length === 6) return '#FF' + hex
    if (hex.length === 8 && /^[0-9A-F]+$/.test(hex)) return '#' + hex
    return AUTO_COLOR
  }
  return AUTO_COLOR
}

// ---- lenient 基元解析 (§2 文法, §7 容错) ----

export interface Clock { h: number; m: number }

/** `H:mm` / `HH:mm` / 全角冒号 → {h,m}; 越界/非法 → null */
export function parseClock(s: string): Clock | null {
  const t = s.trim().replace('：', ':')
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (Number.isNaN(h) || Number.isNaN(min)) return null
  // LocalTime.of 越界抛异常 → null
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, m: min }
}

/** "HH:mm" 规范形 */
export function fmtClock(t: Clock): string {
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`
}

/** clock 比较辅助 — start < end */
export function clockBefore(a: Clock, b: Clock): boolean {
  return a.h * 60 + a.m < b.h * 60 + b.m
}

/** `YYYY-MM-DD`(/ . 或紧凑) → 归一到所在周一的 `YYYY-MM-DD`; 非法 → null */
export function parseDate(s: string): string | null {
  const t = s.trim()
  const m = /^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/.exec(t)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  // 日期有效性校验 (LocalDate.of 越界抛异常)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return toMondayISO(dt)
}

/** LocalDate → ISO yyyy-MM-dd (UTC 语义, 避免时区漂移) */
export function isoDate(dt: Date): string {
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** 归一到所在周一 (JS getUTCDay: 0=Sun..6=Sat → Java DayOfWeek 1=Mon..7=Sun) */
export function toMondayISO(dt: Date): string {
  const dow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay()
  const monday = new Date(dt.getTime())
  monday.setUTCDate(dt.getUTCDate() - (dow - 1))
  return isoDate(monday)
}

/** 今天(本地)归一到周一 — LocalDate.now().with(MONDAY) 语义 */
export function todayMonday(): string {
  const now = new Date()
  const local = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  return toMondayISO(local)
}

/** `S` / `S-E` → [startNode, endNode]; 形状非法 → null */
export function parseNodeSpan(s: string): [number, number] | null {
  const t = s.trim()
  if (t === '') return null
  const parts = t.split('-')
  if (parts.length === 1) {
    const n = parseInt(parts[0], 10)
    return Number.isNaN(n) ? null : [n, n]
  }
  if (parts.length === 2) {
    const a = parseInt(parts[0], 10)
    const b = parseInt(parts[1], 10)
    if (Number.isNaN(a) || Number.isNaN(b)) return null
    return [a, b]
  }
  return null
}

export interface WeekSpec { start: number; end: number; type: number }

/** 周次五形态 + 容忍后缀 → WeekSpec; 形状非法 → null。反写区间 (E<S) 交调用方钳制。 */
export function parseWeekSpec(s: string): WeekSpec | null {
  const t = s.trim()
  if (t === '') return null
  const m = /^(\d+)(?:([-~–—〜至])(\d+))?(单|双|定|散|奇|偶|o|odd|e|even)?$/.exec(t)
  if (!m) return null
  const start = parseInt(m[1], 10)
  if (Number.isNaN(start)) return null
  const end = m[3] !== undefined ? parseInt(m[3], 10) : start
  let type: number
  if (m[4] === undefined || m[4] === '') {
    // groupValues 对未参与组返回 "" — Kotlin 用 groups[..] 判参与; JS 用 m[3] !== undefined
    type = m[3] === undefined ? 3 : 0
  } else {
    switch (m[4]) {
      case '单': case '奇': case 'o': case 'odd': type = 1; break
      case '双': case '偶': case 'e': case 'even': type = 2; break
      case '定': case '散': type = 3; break
      default: return null
    }
  }
  return { start, end, type }
}

/** (S,E,type) → 规范形 token。type 0 恒带横线(8-8); type 3 恒带后缀(单值写 S定)。 */
export function weekSpecToToken(startWeek: number, endWeek: number, type: number): string {
  const range = `${startWeek}-${endWeek}`
  switch (type) {
    case 1: return range + '单'
    case 2: return range + '双'
    case 3: return startWeek === endWeek ? `${startWeek}定` : range + '定'
    default: return range
  }
}

// ---- 星期 (§3.1 day 列) ----

const DAY_NAMES: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7,
}

/** `1..7` / `周X` / `星期X` / `礼拜X` / 裸`三`; 非法形状 → null。越界单数字(0/8/9)交调用方钳制。 */
export function parseDay(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  // §2 文法 day = DIGIT{1}|周X…: 形状层只认单数字, 多位(13/2026)属形状非法
  if (t.length === 1 && t[0] >= '0' && t[0] <= '9') return t.charCodeAt(0) - 48
  let stripped = t
  if (stripped.startsWith('礼拜')) stripped = stripped.slice(2)
  else if (stripped.startsWith('星期')) stripped = stripped.slice(2)
  else if (stripped.startsWith('周')) stripped = stripped.slice(1)
  const byName = DAY_NAMES[stripped]
  if (byName !== undefined) return byName
  if (stripped.length === 1 && stripped[0] >= '0' && stripped[0] <= '9') return stripped.charCodeAt(0) - 48
  return null
}

// ---- Nd 冻结预设 (§5; 规范常量而非应用当前默认) ----

/** (start, end) 对, 节号 = 下标 + 1。与 timeTable.ts DEFAULT_TIME_JSON 逐值一致(测试锁定)。 */
export const ND_PRESET: Array<[Clock, Clock]> = [
  [{ h: 8, m: 0 }, { h: 8, m: 45 }],
  [{ h: 8, m: 55 }, { h: 9, m: 40 }],
  [{ h: 10, m: 0 }, { h: 10, m: 45 }],
  [{ h: 10, m: 55 }, { h: 11, m: 40 }],
  [{ h: 14, m: 0 }, { h: 14, m: 45 }],
  [{ h: 14, m: 55 }, { h: 15, m: 40 }],
  [{ h: 16, m: 0 }, { h: 16, m: 45 }],
  [{ h: 16, m: 55 }, { h: 17, m: 40 }],
  [{ h: 19, m: 0 }, { h: 19, m: 45 }],
  [{ h: 19, m: 55 }, { h: 20, m: 40 }],
  [{ h: 20, m: 50 }, { h: 21, m: 35 }],
  [{ h: 21, m: 45 }, { h: 22, m: 30 }],
]

/** 作息逐值等于冻结预设? (导出端决定写 Nd 还是逐节 N 行) */
export function matchesNdPreset(timeJson: string): boolean {
  const nodes = parseNodes(timeJson)
  if (nodes.length !== ND_PRESET.length) return false
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (n.node !== i + 1) return false
    const [s, e] = ND_PRESET[i]
    if (n.start !== fmtClock(s) || n.end !== fmtClock(e)) return false
  }
  return true
}

// ---- crc32 (§8.1-3, 8 位小写 hex) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): string {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  c = (c ^ 0xffffffff) >>> 0
  return c.toString(16).padStart(8, '0')
}

export function crc32Utf8(s: string): string {
  return crc32(new TextEncoder().encode(s))
}
