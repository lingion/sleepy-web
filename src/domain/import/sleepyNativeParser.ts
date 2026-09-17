import { nameUUIDFromBytes } from './uuid'
import {
  AUTO_COLOR, detectVersion, unescape, parseClock, parseDate, parseDay,
  parseNodeSpan, parseWeekSpec, crc32, colorFromToken, ND_PRESET, fmtClock,
  type Clock, type WeekSpec,
} from './sleepyNativeFormat'

/**
 * sleepy-v1 解析器 — Kotlin SleepyNativeParser.kt 1:1 移植 (规范 §3/§4/§5/§7)
 *
 * 三态处置: 空=默认(不上报) · 形状合法但越界=钳制+上报 · 形状非法=整行丢弃+上报。
 * 上报双通道: droppedLines(行级) + warnings(表级)。
 * groupId 分区: 非空 token 按分区; 空 token 按归一化课名; UUID.nameUUIDFromBytes 语义
 * (MD5-based v3) 保证与 Android 端逐字节一致 — §3.4 契约一跨端兼容。
 */

/** ParseResult — ScheduleParser.ParseResult 1:1 (解析中间产物, 落库由消费方完成) */
export interface ParsedCourse {
  groupId: string
  tableId: number
  courseName: string
  alias: string
  teacher: string
  room: string
  note: string
  day: number
  startNode: number
  step: number
  startWeek: number
  endWeek: number
  type: number
  color: string
  ownTime: boolean
  startTime: string
  endTime: string
}

/**
 * issue#40: 独立时间节次表解析产物 — ScheduleParser.ParsedPeriodTable 1:1。
 * sourceId = 导出端 P 头携带的原表 id (导入端恢复共享关系的键; 0=无既有表可指)。
 */
export interface ParsedPeriodTable {
  sourceId: number
  name: string
  nodesPerDay: number
  timeJson: string
}

export interface ParseResultV1 {
  tableName: string
  startDate: string
  courses: ParsedCourse[]
  /** 稀疏语义: 只写声明过的节; 空=无作息声明 */
  timeJson: string
  nodesPerDay: number
  droppedLines: string[]
  warnings: string[]
  maxWeek: number
  groupIdsAuthoritative: boolean
  /** issue#40 §6: P 区块解析结果; null=文件无独立作息表声明 */
  periodTable: ParsedPeriodTable | null
}

const MAGIC_WINDOW = 32

/** 两遍解析: pass1 扫 T 行(表级), pass2 正文行 */
export function parseSleepyV1(
  trimmed: string,
  defaultTableId: number,
  defaultColor: string,
): ParseResultV1 {
  const lines = trimmed.split('\n').map((l) => l.replace(/\r$/, ''))
  const dropped: string[] = []
  const warnings: string[] = []

  // ---- pass 1: T 行 ----
  let tSeen = false
  let tableName = ''
  let startDateStr = ''
  let maxWeekRaw: number | null = null
  let nodesPerDayRaw: number | null = null
  let declaredCount: number | null = null
  let bodyStart = 0
  let foundMagic = false

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim()
    if (line === '') continue
    if (!foundMagic) {
      if (isMagicLine(line) && idx < MAGIC_WINDOW) {
        foundMagic = true
        bodyStart = idx + 1
      }
      continue
    }
    if (!tSeen && line.toUpperCase().startsWith('T') && !line.toUpperCase().startsWith('ND')) {
      tSeen = true
      const cols = splitRespectingEscape(line.substring(1))
      tableName = unescape((cols[0] ?? '').trim())
      startDateStr = (cols[1] ?? '').trim()
      maxWeekRaw = toIntOrNull((cols[2] ?? '').trim())
      nodesPerDayRaw = toIntOrNull((cols[3] ?? '').trim())
      // 扩展键区: key=value (未知键静默忽略, v2 契约)
      for (const kv of cols.slice(4)) {
        const eq = kv.indexOf('=')
        if (eq > 0) {
          const k = kv.substring(0, eq).trim()
          const v = kv.substring(eq + 1).trim()
          if (k === 'n') declaredCount = toIntOrNull(v)
        }
      }
    }
  }
  if (!foundMagic) throw new Error('内部错误: sleepy-v1 解析器被无 magic 文本调用')

  // ---- 表级默认与钳制(§3.5) ----
  let startDate: string
  if (startDateStr === '') {
    startDate = todayMonday()
  } else {
    const d = parseDate(startDateStr)
    if (d === null) {
      warnings.push(`开始日期「${startDateStr}」无法解析，已使用今天`)
      startDate = todayMonday()
    } else {
      startDate = d
    }
  }
  const maxWeekClamped = clampField(maxWeekRaw, 20, 1, 60, '总周数', warnings)
  const declaredNodes = clampField(nodesPerDayRaw, null, 1, 30, '每天节数', warnings)

  // ---- pass 2: 正文行 ----
  const courses: ParsedCourseV1[] = []
  const nodeTimes = new Map<number, [Clock, Clock]>()
  const ndApplied = new Set<number>()
  let ndSeen = false
  // issue#40 §6: P 区块状态 (P 头 / Pd 预设 / Pn 逐节)
  const periodHeaders: PeriodHeaderInfo[] = []
  const periodNodeTimes = new Map<number, [Clock, Clock]>()
  let pdSeen = false
  const seenExactLines = new Set<string>()
  let seenCourseLines = false
  let secondTableHeader = false
  let chkLine: string | null = null
  const tokens: string[] = []

  let tConsumedInPass2 = tSeen
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    if (line.startsWith('#')) {
      // 注释行忽略 — 但 magic 行恰好以 # 开头, 必须先判定
      if (isMagicLine(line)) {
        dropped.push(shorten(line))
        secondTableHeader = true
      }
      continue
    }
    if (isMagicLine(line)) {
      // 二次 magic: 不硬拒, 整行上报 + warning(§6.3-P)
      dropped.push(shorten(line))
      secondTableHeader = true
      continue
    }
    if (seenExactLines.has(line)) {
      dropped.push(shorten(line))
      continue
    } // 字节级重复(§7.9)
    const prefix = line.substring(0, 1).toUpperCase()

    if (prefix === 'T') {
      // 首次 T 行已被 pass1 消化(tSeen=true) → 跳过; 其余(后置/二次) T 行:
      // 与 Kotlin 一致 — pass1 只吃第一行, pass2 再遇到的 T 行走 continue(不入 dropped)
      if (tConsumedInPass2) continue
      tConsumedInPass2 = true
      continue
    } else if (prefix === 'Z') {
      chkLine = line
    } else if (prefix === 'N') {
      if (line.length >= 2 && (line[1] === 'd' || line[1] === 'D')) {
        ndSeen = true
      } else {
        seenExactLines.add(line)
        parseNodeLine(line, nodeTimes, dropped)
      }
    } else if (prefix === 'P') {
      // issue#40 §6: 独立时间节次表区块 — P(头) / Pd(预设) / Pn(逐节)。
      // 旧版本把 P 系行走"未知行类型"通道丢弃并上报; 本版本解析恢复共享关系。
      if (line.length >= 2 && (line[1] === 'd' || line[1] === 'D')) {
        pdSeen = true
      } else if (line.length >= 3 && (line[1] === 'n' || line[1] === 'N') && line[2] !== '|' && line[2] !== '\\') {
        parsePeriodNodeLine(line.substring(2), periodNodeTimes, dropped)
      } else if (line.includes('|')) {
        parsePeriodHeader(line, periodHeaders, dropped, warnings)
      } else {
        // 裸 P / Pd 变体残缺 — 上报不硬拒
        dropped.push(shorten(line))
      }
    } else if (prefix === 'C') {
      seenCourseLines = true
      seenExactLines.add(line)
      parseCourseLine(line, defaultTableId, defaultColor, tableName, courses, dropped, tokens)
    } else {
      // 未知行类型(v2 信号)或无前缀垃圾 → dropped(诚实上报)
      dropped.push(shorten(line))
    }
  }

  // Nd 展开(§5: 冻结 12 节常量; 显式 N 行优先)
  if (ndSeen) {
    for (let i = 0; i < ND_PRESET.length; i++) {
      const node = i + 1
      if (!nodeTimes.has(node)) {
        nodeTimes.set(node, ND_PRESET[i])
        ndApplied.add(node)
      }
    }
  }

  // issue#40: Pd 展开(同 ND_PRESET 常量) + periodTable 组装
  // 与 Kotlin 同条件: pdSeen(出现过 Pd) 且有 P 头才展开预设
  if (pdSeen && periodHeaders.length > 0) {
    for (let i = 0; i < ND_PRESET.length; i++) {
      const node = i + 1
      if (!periodNodeTimes.has(node)) periodNodeTimes.set(node, ND_PRESET[i])
    }
  }
  const periodTable: ParsedPeriodTable | null =
    periodHeaders.length > 0 && periodNodeTimes.size > 0
      ? {
          sourceId: periodHeaders[0].sourceId,
          name: periodHeaders[0].name,
          nodesPerDay: periodHeaders[0].nodesPerDay,
          timeJson: serializeNodeTimes(periodNodeTimes),
        }
      : null

  // chk 校验(§6.3-Q: 警告不硬拒); 范围 = magic 行(含)至 z 行(不含)的原文行
  if (chkLine !== null) {
    const m = /chk=([a-z0-9]+):([0-9a-fA-F]{8})/.exec(chkLine)
    if (m !== null) {
      const algo = m[1]
      if (algo === 'crc32') {
        const zIdx = lines.findIndex((l) => l.trim() === chkLine)
        if (zIdx > bodyStart - 1) {
          const bodyToChk = lines.slice(0, zIdx).join('\n')
          const actual = crc32(new TextEncoder().encode(bodyToChk))
          if (actual.toLowerCase() !== m[2].toLowerCase()) {
            warnings.push('完整性校验不符，文件可能被截断或修改')
          }
        }
      } else {
        warnings.push(`未知校验算法 ${algo}，已跳过校验`)
      }
    }
  }

  // n= 计数核对(§8.3: 警告不硬拒)
  if (declaredCount !== null && declaredCount !== courses.length) {
    warnings.push(`课程行计数 n=${declaredCount} 与实际 ${courses.length} 不符，文件可能被截断`)
  }
  if (secondTableHeader) {
    warnings.push('检测到第 2 张表头，其课程已并入当前表')
  }

  // nodesPerDay = max(声明, 课程到达)(§5 优先级)
  const courseReach = courses.length === 0
    ? 0
    : Math.max(...courses.map((c) => c.startNode + c.step - 1))
  let nodesPerDay = declaredNodes ?? Math.max(12, maxKey(nodeTimes))
  if (declaredNodes === null && nodeTimes.size === 0 && courses.length > 0) {
    nodesPerDay = Math.max(12, courseReach)
  }
  if (courseReach > nodesPerDay) {
    nodesPerDay = courseReach
    warnings.push(`课程到达第 ${courseReach} 节，超过声明的每天节数，已自动扩展`)
  }

  // timeJson 序列化(稀疏语义: 只写声明过的节, 按 node 升序)
  const timeJson = serializeNodeTimes(nodeTimes)

  // ---- groupId 分区(§3.4) ----
  assignFinalGroupIds(courses, tableName, tokens)

  // ---- 空表/全丢二分(§7.8): C 前缀行存在但全丢 = 失败; 0 行 C = 空表成功 ----
  if (seenCourseLines && courses.length === 0) {
    throw new Error(
      `未能解析任何课程（${dropped.length} 行没进去）：${dropped.slice(0, 3).join(' / ')}`,
    )
  }

  return {
    tableName,
    startDate,
    courses: courses.map((c) => finalizeCourse(c, defaultTableId)),
    timeJson,
    nodesPerDay,
    droppedLines: dropped,
    warnings,
    maxWeek: maxWeekClamped ?? 20,
    groupIdsAuthoritative: true,
    periodTable,
  }
}

// ---- 内部结构: 分区前的课程中间态 ----
interface ParsedCourseV1 extends ParsedCourse {
  tableId: number
}

function finalizeCourse(c: ParsedCourseV1, tableId: number): ParsedCourse {
  return { ...c, tableId }
}

function isMagicLine(line: string): boolean {
  return detectVersion(line) >= 1
}

/** 反斜杠感知的竖线切分: \| 不是分隔符 */
function splitRespectingEscape(body: string): string[] {
  const cols: string[] = []
  let sb = ''
  let i = 0
  while (i < body.length) {
    const c = body[i]
    if (c === '\\' && i + 1 < body.length) {
      sb += c + body[i + 1]
      i += 2
    } else if (c === '|') {
      cols.push(sb)
      sb = ''
      i++
    } else {
      sb += c
      i++
    }
  }
  cols.push(sb)
  return cols
}

function toIntOrNull(s: string): number | null {
  // Kotlin String.toIntOrNull() 语义: 全串必须是合法整数, "12abc" → null (parseInt 会给 12)
  if (!/^[+-]?\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? null : n
}

function todayMonday(): string {
  const now = new Date()
  // Monday = ISO weekday 1; Date.getDay(): Sun=0..Sat=6
  const day = now.getDay()
  const offset = (day + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`
}

function clampField(
  raw: number | null,
  dflt: number | null,
  lo: number,
  hi: number,
  label: string,
  warnings: string[],
): number | null {
  if (raw === null) return dflt
  if (raw < lo) {
    warnings.push(`${label} ${raw} 低于下限，已调整为 ${lo}`)
    return lo
  }
  if (raw > hi) {
    warnings.push(`${label} ${raw} 超过上限，已调整为 ${hi}`)
    return hi
  }
  return raw
}

function maxKey(m: Map<number, unknown>): number {
  let max = 0
  for (const k of m.keys()) if (k > max) max = k
  return max
}

function shorten(line: string): string {
  return line.slice(0, 40)
}

// ---- N 行 (§5) ----
function parseNodeLine(
  line: string,
  nodeTimes: Map<number, [Clock, Clock]>,
  dropped: string[],
): void {
  const cols = splitRespectingEscape(line.substring(1))
  const nodeNo = toIntOrNull((cols[0] ?? '').trim())
  const start = cols[1] !== undefined ? parseClock(cols[1]) : null
  const end = cols[2] !== undefined ? parseClock(cols[2]) : null
  const ok = nodeNo !== null && nodeNo > 0 && start !== null && end !== null && clockBefore(start, end)
  if (!ok || nodeNo === null || start === null || end === null) {
    dropped.push(shorten(line))
    return
  }
  if (nodeTimes.has(nodeNo)) {
    dropped.push(shorten(line)) // 重复节号: 首行生效
    return
  }
  nodeTimes.set(nodeNo, [start, end])
}

function clockBefore(a: Clock, b: Clock): boolean {
  return a.h < b.h || (a.h === b.h && a.m < b.m)
}

// ---- P 区块 (§6, issue#40) ----

interface PeriodHeaderInfo {
  sourceId: number
  name: string
  nodesPerDay: number
}

/** nodeTimes map → 稀疏 timeJson 字符串(按 node 升序); 空 map = 空串 */
function serializeNodeTimes(nodeTimes: Map<number, [Clock, Clock]>): string {
  if (nodeTimes.size === 0) return ''
  const parts = [...nodeTimes.keys()].sort((a, b) => a - b).map((node) => {
    const [s, e] = nodeTimes.get(node)!
    return `{"node":${node},"start":"${fmtClock(s)}","end":"${fmtClock(e)}"}`
  })
  return `[${parts.join(',')}]`
}

function parsePeriodHeader(
  line: string,
  into: PeriodHeaderInfo[],
  dropped: string[],
  warnings: string[],
): void {
  // into 最多收一条 — 二次 P 头 = 形状异常, 丢弃上报
  if (into.length > 0) {
    dropped.push(shorten(line))
    return
  }
  const cols = splitRespectingEscape(line.substring(1))
  const name = unescape((cols[0] ?? '').trim())
  const id = toIntOrNull((cols[1] ?? '').trim())
  const npd = toIntOrNull((cols[2] ?? '').trim())
  if (name === '' || id === null || id < 1) {
    dropped.push(shorten(line))
    warnings.push('时间节次表区块无法解析，已退回课程表内作息')
    return
  }
  into.push({ sourceId: id, name, nodesPerDay: npd ?? 12 })
}

/** Pn 节次行: 同 N 行文法(node|start|end), body=line.substring(2) */
function parsePeriodNodeLine(
  body: string,
  nodeTimes: Map<number, [Clock, Clock]>,
  dropped: string[],
): void {
  const cols = splitRespectingEscape(body)
  const nodeNo = toIntOrNull((cols[0] ?? '').trim())
  const start = cols[1] !== undefined ? parseClock(cols[1]) : null
  const end = cols[2] !== undefined ? parseClock(cols[2]) : null
  const ok = nodeNo !== null && nodeNo > 0 && start !== null && end !== null && clockBefore(start, end)
  if (!ok || nodeNo === null || start === null || end === null) {
    dropped.push(shorten(`Pn${body}`))
    return
  }
  if (nodeTimes.has(nodeNo)) {
    dropped.push(shorten(`Pn${body}`)) // 重复节号: 首行生效
    return
  }
  nodeTimes.set(nodeNo, [start, end])
}

// ---- C 行 (§3.1, 恒 10 列 + issue#26 可选第 11 列=课程别名) ----
function parseCourseLine(
  line: string,
  defaultTableId: number,
  defaultColor: string,
  tableName: string,
  courses: ParsedCourseV1[],
  dropped: string[],
  tokens: string[],
): void {
  void tableName
  let cols = splitRespectingEscape(line.substring(1))
  // 全角｜次级分隔符: 仅当半角切分 < 10 列且全角重切恰好落在 {10,11} 时(§7.6)
  if (cols.length < 10 && !cols.some((c) => c.includes('|'))) {
    const alt = splitRespectingEscape(line.substring(1).replace(/｜/g, '|'))
    // 精确重切仅在 alt.size ∈ {10, 11} 时采纳
    if (alt.length === 10 || alt.length === 11) cols = alt
  }

  const col = (i: number): string => (cols[i] ?? '').trim()
  const text = (i: number): string => unescape(col(i))

  const name = text(0)
  if (name === '') {
    dropped.push(shorten(line))
    return
  } // 名称是行存在性唯一充分条件
  if (name.includes('�')) {
    dropped.push(shorten(line))
    return
  } // GBK 乱码 → 响亮丢弃(§7.7)

  // day(2列)
  const dayRaw = col(1)
  const dayParsed = parseDay(dayRaw)
  let day: number
  if (dayRaw === '') {
    day = 1
  } else if (dayParsed === null) {
    dropped.push(shorten(line))
    return
  } else if (dayParsed < 1 || dayParsed > 7) {
    day = Math.min(7, Math.max(1, dayParsed))
    markClamped(line, dropped)
  } else {
    day = dayParsed
  }

  // nodeSpan(3列)
  const spanRaw = col(2)
  let span: [number, number]
  if (spanRaw === '') {
    span = [1, 1]
  } else {
    const p = parseNodeSpan(spanRaw)
    if (p === null) {
      dropped.push(shorten(line))
      return
    }
    span = p
  }
  let [nodeStart, nodeEnd] = span
  if (nodeEnd < nodeStart) {
    const t = nodeStart
    nodeStart = nodeEnd
    nodeEnd = t
    markClamped(line, dropped)
  }
  if (nodeStart < 1) {
    nodeStart = 1
    markClamped(line, dropped)
  }
  const step = nodeEnd - nodeStart + 1

  // weekSpec(4列)
  const weekRaw = col(3)
  let weekParsed: WeekSpec
  if (weekRaw === '') {
    weekParsed = { start: 1, end: 16, type: 3 }
  } else {
    const p = parseWeekSpec(weekRaw)
    if (p === null) {
      dropped.push(shorten(line))
      return
    }
    weekParsed = p
  }
  let wStart = weekParsed.start
  let wEnd = weekParsed.end
  if (wEnd < wStart) {
    const t = wStart
    wStart = wEnd
    wEnd = t
    markClamped(line, dropped)
  }
  if (wStart < 1) {
    wStart = 1
    markClamped(line, dropped)
  }
  if (wEnd > 300) {
    wEnd = 300
    markClamped(line, dropped)
  }

  // teacher(5) room(6) — 自由文本无非法态
  const teacher = text(4)
  const room = text(5)

  // color(7)
  const colorRaw = col(6)
  let color: string
  if (colorRaw === '' || colorRaw === '0') {
    color = defaultColor === '' ? AUTO_COLOR : defaultColor
  } else {
    const n = toIntOrNull(colorRaw)
    if (n !== null && n > 9) markClamped(line, dropped)
    color = colorFromToken(colorRaw)
  }

  // note(8)
  const note = text(7)

  // timeSpan(9)
  const timeRaw = col(8)
  let ownTime = false
  let startTime = ''
  let endTime = ''
  if (timeRaw !== '') {
    const parts = timeRaw.split(/[-～~]/)
    if (parts.length === 2) {
      const st = parseClock(parts[0])
      const et = parseClock(parts[1])
      if (st !== null && et !== null && clockBefore(st, et)) {
        ownTime = true
        startTime = fmtClock(st)
        endTime = fmtClock(et)
      } else {
        markClamped(line, dropped) // 时间列非法: 课程仍按节点落位
      }
    } else {
      markClamped(line, dropped)
    }
  }

  // group(10)
  const token = text(9)

  // issue#26: 可选第 11 列 = 课程别名。缺列/空值 → ""(向后兼容 v1); 形状宽容。
  const alias = cols.length >= 11 ? text(10) : ''

  courses.push({
    groupId: '', // 分区在 pass 结束后统一分配
    tableId: defaultTableId,
    courseName: name,
    alias,
    teacher,
    room,
    note,
    day,
    startNode: nodeStart,
    step,
    startWeek: wStart,
    endWeek: wEnd,
    type: weekParsed.type,
    color,
    ownTime,
    startTime,
    endTime,
  })
  // token 临时通道 — 与 courses 下标对齐
  tokens.push(token)
}

function markClamped(line: string, dropped: string[]): void {
  dropped.push(shorten(line))
}

/** §3.4: 非空 token 按分区; 空 token 按归一化课名; 确定性 UUID */
function assignFinalGroupIds(courses: ParsedCourseV1[], tableName: string, tokens: string[]): void {
  const tokenGroups = new Map<string, string>()
  const nameGroups = new Map<string, string>()
  for (let idx = 0; idx < courses.length; idx++) {
    const c = courses[idx]
    const token = tokens[idx] ?? ''
    let gid: string
    if (token !== '') {
      const cached = tokenGroups.get(token)
      if (cached !== undefined) {
        gid = cached
      } else {
        gid = nameUUIDFromBytes(`${tableName}|${token}`)
        tokenGroups.set(token, gid)
      }
    } else {
      const key = c.courseName.trim().replace(/\s+/g, ' ').toLowerCase()
      const cached = nameGroups.get(key)
      if (cached !== undefined) {
        gid = cached
      } else {
        gid = nameUUIDFromBytes(`${tableName}|${key}`)
        nameGroups.set(key, gid)
      }
    }
    courses[idx] = { ...c, groupId: gid }
  }
}
