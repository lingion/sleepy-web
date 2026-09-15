/**
 * importFlow — 教务导入的纯逻辑层 (无 JSX / 无 React / 无网络)。
 *
 * 覆盖 Android JwImportActivity 的状态机转移、0 课诊断文案映射 (DiagMapper)、
 * 确认页校验 (JwCourseConfirmPage 的 confirmError 三段严格序)、
 * 以及 JwCourse → Course 落库映射 (importAsNewTable)。
 *
 * 抽成独立模块的唯一目的: 让状态机可被 vitest 直接单测 (JSX 里的逻辑不可测)。
 */

import type { Course } from '../../data/types'
import type { JwCourse } from '../../domain/jw/jwCourse'
import type { ParserAttempt } from '../../domain/jw/jwFetchError'
import { selectBest } from '../../domain/jw/parserRegistry'
import type { TimeSlotRow } from '../../domain/timeTable'
import { parseHM } from '../../domain/timeTable'
import {
  DIAG_EMPTY_SEMESTER,
  DIAG_HEADER_NO_NODE,
  DIAG_IMAGE_OR_EMPTY_CELLS,
  DIAG_NO_TABLE_CONTAINER,
  DIAG_SESSION_EXPIRED,
  DIAG_UNKNOWN_EMPTY,
  DIAG_WRONG_PROTOCOL,
  classifyDiagnostics,
} from './diagnostics'
import type { DiagCategory, DiagResult } from './diagnostics'
import {
  TYPE_QZ,
  TYPE_QZ_BR,
  TYPE_QZ_CRAZY,
  TYPE_QZ_OLD,
  TYPE_QZ_WITH_NODE,
} from './protocol'
import type { SchoolInfo } from './schools'
import type { FetchOutcome } from './proxyClient'

/** JwImportActivity.Stage 三态 1:1 (SelectSchool / WebViewLogin→capture / ConfigureConfirm) */
export type JwStage = 'selectSchool' | 'capture' | 'configureConfirm'

/** t() 的最小面 (注入以便单测无需 i18n 初始化) */
export type TFunc = (key: string, options?: Record<string, string | number>) => string

// ── 解析裁决 ────────────────────────────────────────────────────────────

export type ParseOutcome =
  | { kind: 'success'; courses: JwCourse[]; attempts: ParserAttempt[] }
  | { kind: 'empty'; diag: DiagResult; attempts: ParserAttempt[] }
  | { kind: 'failed'; message: string; attempts: ParserAttempt[] }

/**
 * 一段 HTML → 课程 / 诊断 / 异常。
 * 对齐 Android: 0 课 → DiagMapper; 抛异常 → jw_parse_failed + hint; >0 课 → 进确认页。
 */
export function resolveCapture(html: string, school: SchoolInfo | null): ParseOutcome {
  if (!html.trim()) {
    return {
      kind: 'empty',
      diag: {
        category: DIAG_NO_TABLE_CONTAINER,
        matchedFeatures: ['blank_html'],
        courseCount: 0,
        userMessage: '抓取内容为空',
      },
      attempts: [],
    }
  }
  let courses: JwCourse[]
  let attempts: ParserAttempt[]
  try {
    ;[courses, attempts] = selectBest(html, school?.type?.trim() ? school.type : null)
  } catch (e) {
    return { kind: 'failed', message: e instanceof Error ? e.message : String(e), attempts: [] }
  }
  if (courses.length === 0) {
    return { kind: 'empty', diag: classifyDiagnostics(html, school), attempts }
  }
  return { kind: 'success', courses, attempts }
}

/** 命中课程最多的那次尝试 — 确认页展示实际生效协议 */
export function bestAttempt(attempts: ParserAttempt[]): ParserAttempt | null {
  let best: ParserAttempt | null = null
  for (const a of attempts) {
    if (a.courseCount <= 0) continue
    if (!best || a.courseCount > best.courseCount) best = a
  }
  return best
}

// ── 节次行预填 (JwImportActivity L320-329) ──────────────────────────────

/** maxNode = courses.maxOf { max(startNode, endNode) } */
export function maxNodeOf(courses: readonly JwCourse[]): number {
  return courses.reduce((acc, c) => Math.max(acc, Math.max(c.startNode, c.endNode)), 0)
}

/** maxWeek = courses.maxOf { endWeek } (建表 maxWeek 用) */
export function maxWeekOf(courses: readonly JwCourse[]): number {
  return courses.reduce((acc, c) => Math.max(acc, c.endWeek), 0)
}

/** (1..maxNode) 生成行; periods 有该节则预填时间, 否则空串让用户填 */
export function rowsFromMaxNode(
  maxNode: number,
  periods: ReadonlyArray<{ node: number; start: string; end: string }> = []
): TimeSlotRow[] {
  const periodMap = new Map(periods.map((p) => [p.node, p]))
  return Array.from({ length: Math.max(0, maxNode) }, (_, i) => {
    const node = i + 1
    const filled = periodMap.get(node)
    return { node, start: filled?.start ?? '', end: filled?.end ?? '', edgeClass: 'after' as const }
  })
}

// ── 确认页校验 (JwCourseConfirmPage 严格序) ─────────────────────────────

export interface ConfirmState {
  startDate: string
  rows: readonly TimeSlotRow[]
}

export type ConfirmError =
  | { key: 'start_date_format' }
  | { key: 'slot_time_required'; node: number }
  | { key: 'slot_time_invalid'; node: number }

const RX_DATE = /^\d{4}-\d{2}-\d{2}$/
const RX_HM = /^\d{2}:\d{2}$/

/** 校验顺序 1:1: 日期格式 → 时间非空 → 时间格式与先后 */
export function validateConfirm(state: ConfirmState): ConfirmError | null {
  if (!RX_DATE.test(state.startDate.trim())) return { key: 'start_date_format' }
  for (const row of state.rows) {
    if (row.start.trim() === '' || row.end.trim() === '') return { key: 'slot_time_required', node: row.node }
  }
  for (const row of state.rows) {
    if (!RX_HM.test(row.start.trim()) || !RX_HM.test(row.end.trim())) {
      return { key: 'slot_time_invalid', node: row.node }
    }
    if (parseHM(row.start.trim()) >= parseHM(row.end.trim())) {
      return { key: 'slot_time_invalid', node: row.node }
    }
  }
  return null
}

// ── 0 课诊断文案映射 (DiagMapper.mapImpl 1:1) ───────────────────────────

/** Category → jw_diag_* i18n 键 */
export function diagMessageKey(category: DiagCategory): string {
  switch (category) {
    case DIAG_SESSION_EXPIRED:
      return 'jw_diag_session_expired'
    case DIAG_NO_TABLE_CONTAINER:
      return 'jw_diag_no_container'
    case DIAG_HEADER_NO_NODE:
      return 'jw_diag_header_no_node'
    case DIAG_IMAGE_OR_EMPTY_CELLS:
      return 'jw_diag_image_cells'
    case DIAG_EMPTY_SEMESTER:
      return 'jw_diag_empty_semester'
    case DIAG_WRONG_PROTOCOL:
      return 'jw_diag_wrong_protocol'
    case DIAG_UNKNOWN_EMPTY:
    default:
      return 'jw_diag_unknown_empty'
  }
}

/** 校园网/VPN 受限校清单 (JwImportActivity 硬编码 26 条 1:1) */
const CAMPUS_VPN_HOSTS = [
  'jwgl.lyu.edu.cn',
  'jwxt.lyu.edu.cn',
  'jwxt.neu.edu.cn',
  'newxk.urp.seu.edu.cn',
  'xsjw2018.jw.scut.edu.cn',
  'jxglstu.hfut.edu.cn',
  'zdbk.zju.edu.cn',
  'jw.ustc.edu.cn',
  'jwms.bit.edu.cn',
  'jxzxehallapp.bit.edu.cn',
  'csujwc.its.csu.edu.cn',
  'jwxt.whut.edu.cn',
  'jwxt.scnu.edu.cn',
  'hdjw.hnu.edu.cn',
  'jw.ruc.edu.cn',
  'jw.dhu.edu.cn',
  'jw.ahu.edu.cn',
  'jwxt.cumtb.edu.cn',
  'jwxt.ybu.edu.cn',
  'jwgl.shzu.edu.cn',
  'eams.uestc.edu.cn',
  'eams.sufe.edu.cn',
  'jwglnew.hunnu.edu.cn',
  'aao-eas.nuaa.edu.cn',
  'jwgl.gzhmu.edu.cn',
]

const QZ_FAMILY = new Set([TYPE_QZ, TYPE_QZ_CRAZY, TYPE_QZ_BR, TYPE_QZ_WITH_NODE, TYPE_QZ_OLD])

/** 学校专属补充提示键 ('' = 无) */
export function schoolHintKey(school: SchoolInfo | null): string {
  if (!school) return ''
  const url = school.url
  if (url === 'https://scu.edu.cn/' || CAMPUS_VPN_HOSTS.some((h) => url.includes(h))) return 'jw_diag_campus_vpn_hint'
  if (QZ_FAMILY.has(school.type ?? '')) return 'jw_diag_qz_vpn_hint'
  return ''
}

/**
 * DiagMapper.mapImpl: base(school.name[, features]) + UNKNOWN_EMPTY 回显特征 + "\n\n" + 校专属提示。
 */
export function buildDiagMessage(diag: DiagResult, school: SchoolInfo | null, t: TFunc): string {
  const features = diag.matchedFeatures.slice(0, 5).join('/')
  const base = t(diagMessageKey(diag.category), { v1: school?.name ?? '', v2: features })
  const hintKey = schoolHintKey(school)
  const hintPart = hintKey ? `\n\n${t(hintKey)}` : ''
  return diag.category === DIAG_UNKNOWN_EMPTY ? `${base}（${features}）${hintPart}` : `${base}${hintPart}`
}

/** 解析抛异常文案 (jw_parse_failed + jw_parse_failed_hint) */
export function buildParseFailedMessage(message: string, t: TFunc): string {
  return t('jw_parse_failed', { v1: message }) + t('jw_parse_failed_hint')
}

/** 抓取失败 (网络层) → i18n 键 + 参数 */
export function captureFailureMessage(outcome: Extract<FetchOutcome, { ok: false }>, t: TFunc): string {
  switch (outcome.kind) {
    case 'timeout':
      return t('jw_fetch_timeout')
    case 'network':
      return t('jw_fetch_failed_no_response')
    case 'invalid':
      return t('jw_fetch_format_error')
    case 'http':
    default:
      return t('jw_fetch_failed', { v1: outcome.detail })
  }
}

// ── 落库映射 (importAsNewTable) ─────────────────────────────────────────

/** Android 默认主色 (ARGB 串, 与 web SENTINEL_COLOR 同值) */
export const JW_DEFAULT_COLOR = '#FF6750A4'

/**
 * JwCourse → Course 落库形态。
 * groupId 留空串 → 交给 repository.insertCourses 的 assignGroupIds
 * (按规范化课名一组 UUID, 与 Android importAsNewTable 语义一致)。
 */
export function toCourseEntities(courses: readonly JwCourse[], tableId: number): Omit<Course, 'id'>[] {
  return courses.map((c) => ({
    groupId: '',
    tableId,
    courseName: c.name,
    teacher: c.teacher,
    room: c.room,
    note: '',
    alias: '',
    day: c.day,
    startNode: c.startNode,
    step: Math.max(1, c.endNode - c.startNode + 1),
    startWeek: c.startWeek,
    endWeek: c.endWeek,
    type: c.type as Course['type'],
    color: JW_DEFAULT_COLOR,
    colorMode: 0,
    ownTime: false,
    isIrregularNode: false,
    isIrregularTime: false,
    startTime: '',
    endTime: '',
    credit: 0,
    level: 0,
  }))
}

/** 课程分组预览键: 课名|周几 (确认页按组展示, 一组可多时段) */
export function courseGroupKey(c: JwCourse): string {
  return `${c.name}|${c.day}`
}

export interface CourseGroup {
  key: string
  name: string
  day: number
  courses: JwCourse[]
  /** 展示用 "3-4节 / 1-8周" */
  nodeLabel: string
  weekLabel: string
  teacher: string
  room: string
}

const WEEK_TYPE_LABEL = ['', '(单)', '(双)'] as const

/** 确认页分组预览列表 (同名同时段的多周次段合并到一组) */
export function groupCourses(courses: readonly JwCourse[]): CourseGroup[] {
  const map = new Map<string, CourseGroup>()
  for (const c of courses) {
    const key = courseGroupKey(c)
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        name: c.name,
        day: c.day,
        courses: [],
        nodeLabel: '',
        weekLabel: '',
        teacher: '',
        room: '',
      }
      map.set(key, g)
    }
    g.courses.push(c)
    if (g.teacher.trim() === '' && c.teacher.trim() !== '') g.teacher = c.teacher
    if (g.room.trim() === '' && c.room.trim() !== '') g.room = c.room
  }
  for (const g of map.values()) {
    const lo = Math.min(...g.courses.map((c) => c.startNode))
    const hi = Math.max(...g.courses.map((c) => c.endNode))
    g.nodeLabel = `${lo}-${hi}`
    const wLo = Math.min(...g.courses.map((c) => c.startWeek))
    const wHi = Math.max(...g.courses.map((c) => c.endWeek))
    const suffix = WEEK_TYPE_LABEL[g.courses[0].type] ?? ''
    g.weekLabel = `${wLo}-${wHi}${suffix}`
  }
  return [...map.values()].sort((a, b) => a.day - b.day || a.courses[0].startNode - b.courses[0].startNode || a.name.localeCompare(b.name))
}
