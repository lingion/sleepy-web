/**
 * importFlow 状态机/纯逻辑契约 — 教务导入的裁决、诊断映射、校验、落库映射。
 * 全程不联网: 抓取用注入的假 fetcher, 解析用 domain/jw/__fixtures__ 真实样本。
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { JwCourse } from '../../domain/jw/jwCourse'
import type { ParserAttempt } from '../../domain/jw/jwFetchError'
import {
  DIAG_EMPTY_SEMESTER,
  DIAG_NO_TABLE_CONTAINER,
  DIAG_SESSION_EXPIRED,
  DIAG_UNKNOWN_EMPTY,
  classifyDiagnostics,
} from './diagnostics'
import {
  JW_DEFAULT_COLOR,
  bestAttempt,
  buildDiagMessage,
  buildParseFailedMessage,
  captureFailureMessage,
  groupCourses,
  maxNodeOf,
  maxWeekOf,
  resolveCapture,
  rowsFromMaxNode,
  schoolHintKey,
  toCourseEntities,
  validateConfirm,
  type TFunc,
} from './importFlow'
import {
  charsetFromContentType,
  decodeBytes,
  fetchViaProxy,
  proxyUrlFor,
  JW_PROXY_BASE,
  type FetchOutcome,
} from './proxyClient'
import {
  detectProtocolFromUrl,
  displayHost,
  isVpnRewrite,
  looksLikeUrl,
  matchSchoolByDomain,
  normalizeUrl,
  protocolDisplayName,
  registrableDomain,
} from './protocol'
import { filterSchools, matchPinyin, namePinyinShort } from './pinyin'
import { SCHOOLS, groupByLetter, isSelectable, letterOf, statusBadge, type SchoolInfo } from './schools'

/** 恒等 t(): 单测只关心键与插值, 不依赖 i18n 初始化 */
const t: TFunc = (key, options) => {
  const args = options ?? {}
  return key + Object.keys(args).map((k) => `:${args[k]}`).join('')
}

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../domain/jw/__fixtures__', name), 'utf-8')
}

function school(type: string | null, url = 'https://example.edu.cn/'): SchoolInfo {
  return { sortKey: 'T', name: '测试大学', url, type, aliases: [], sortKeyFull: '', status: 'supported' }
}

const COURSE: JwCourse = {
  name: '高等数学', room: 'A101', teacher: '张老师',
  day: 1, startNode: 1, endNode: 2, startWeek: 1, endWeek: 16, type: 0,
}

function attempt(courseCount: number, name = 'cf'): ParserAttempt {
  return { parserName: name, type: name, courseCount, confidence: 0, matchedFeatures: [], exception: null }
}

// ── resolveCapture: 有课 / 0 课 / 抛异常 / 空输入 ───────────────────────

describe('resolveCapture', () => {
  it('乘方典型样本 → 2 门课程', () => {
    const res = resolveCapture(fixture('cf-chengfang-typical_two_courses.html'), school('cf'))
    expect(res.kind).toBe('success')
    if (res.kind !== 'success') return
    expect(res.courses).toHaveLength(2)
    expect(res.courses.map((c) => c.name)).toEqual(['高等数学', '大学英语'])
  })

  it('登录页 → empty + SESSION_EXPIRED', () => {
    const res = resolveCapture(fixture('cf-chengfang-login_page_no_kbxx.html'), school('cf'))
    expect(res.kind).toBe('empty')
    if (res.kind !== 'empty') return
    expect(res.diag.category).toBe(DIAG_SESSION_EXPIRED)
  })

  it('本学期无课 → empty + EMPTY_SEMESTER', () => {
    const res = resolveCapture(fixture('cf-chengfang-empty_timetable.html'), school('cf'))
    expect(res.kind).toBe('empty')
    if (res.kind !== 'empty') return
    expect(res.diag.category).toBe(DIAG_EMPTY_SEMESTER)
  })

  it('空 HTML → empty + NO_TABLE_CONTAINER(blank_html), 不抛异常', () => {
    const res = resolveCapture('   ', school('cf'))
    expect(res.kind).toBe('empty')
    if (res.kind !== 'empty') return
    expect(res.diag.category).toBe(DIAG_NO_TABLE_CONTAINER)
    expect(res.diag.matchedFeatures).toContain('blank_html')
  })

  it('未注册的声明协议不抛异常, 回落通用裁决', () => {
    const res = resolveCapture(fixture('cf-chengfang-typical_two_courses.html'), school('no_such_protocol'))
    expect(res.kind).toBe('success')
  })

  it('school 为 null (URL 直连未判型) 也能解析', () => {
    const res = resolveCapture(fixture('cf-chengfang-typical_two_courses.html'), null)
    expect(res.kind).toBe('success')
  })
})

// ── 节次行预填 ──────────────────────────────────────────────────────────

describe('rowsFromMaxNode', () => {
  it('maxNode=3 → 3 行空时间待用户填', () => {
    const rows = rowsFromMaxNode(3)
    expect(rows.map((r) => r.node)).toEqual([1, 2, 3])
    expect(rows.every((r) => r.start === '' && r.end === '')).toBe(true)
  })

  it('periods 命中的节次预填时间', () => {
    const rows = rowsFromMaxNode(2, [{ node: 1, start: '08:00', end: '08:45' }])
    expect(rows[0]).toMatchObject({ start: '08:00', end: '08:45' })
    expect(rows[1].start).toBe('')
  })

  it('maxNode=0 → 空数组', () => {
    expect(rowsFromMaxNode(0)).toEqual([])
  })
})

describe('maxNodeOf / maxWeekOf', () => {
  it('取跨节与周次上界', () => {
    const courses = [COURSE, { ...COURSE, name: 'B', endNode: 5, endWeek: 20 }]
    expect(maxNodeOf(courses)).toBe(5)
    expect(maxWeekOf(courses)).toBe(20)
  })

  it('空数组 → 0', () => {
    expect(maxNodeOf([])).toBe(0)
    expect(maxWeekOf([])).toBe(0)
  })
})

// ── 确认页校验 (顺序即契约) ─────────────────────────────────────────────

describe('validateConfirm', () => {
  const ok = { node: 1, start: '08:00', end: '08:45', edgeClass: null }

  it('合法输入 → null', () => {
    expect(validateConfirm({ startDate: '2026-09-07', rows: [ok] })).toBeNull()
  })

  it('日期格式错优先于节次为空', () => {
    expect(validateConfirm({ startDate: '2026/09/07', rows: [{ ...ok, start: '' }] })).toEqual({
      key: 'start_date_format',
    })
  })

  it('时间缺失 → slot_time_required 带节次号', () => {
    expect(
      validateConfirm({ startDate: '2026-09-07', rows: [ok, { ...ok, node: 2, end: '' }] })
    ).toEqual({ key: 'slot_time_required', node: 2 })
  })

  it('开始不早于结束 → slot_time_invalid', () => {
    expect(
      validateConfirm({ startDate: '2026-09-07', rows: [{ ...ok, start: '09:00', end: '09:00' }] })
    ).toEqual({ key: 'slot_time_invalid', node: 1 })
  })
})

// ── 诊断 → 文案映射 ─────────────────────────────────────────────────────

describe('诊断文案映射', () => {
  it('UNKNOWN_EMPTY 文案自带特征串', () => {
    const msg = buildDiagMessage(
      { category: DIAG_UNKNOWN_EMPTY, matchedFeatures: ['a', 'b'], courseCount: 0, userMessage: '' },
      school('cf'),
      t
    )
    expect(msg).toContain('jw_diag_unknown_empty')
    expect(msg).toContain('（a/b）')
  })

  it('特征串截断到 5 个', () => {
    const msg = buildDiagMessage(
      { category: DIAG_UNKNOWN_EMPTY, matchedFeatures: ['1', '2', '3', '4', '5', '6'], courseCount: 0, userMessage: '' },
      null,
      t
    )
    expect(msg).toContain('（1/2/3/4/5）')
    expect(msg).not.toContain('6')
  })

  it('强智系学校追加 VPN 提示', () => {
    expect(schoolHintKey(school('qz'))).toBe('jw_diag_qz_vpn_hint')
    expect(schoolHintKey(school('zf'))).toBe('')
  })

  it('解析异常 → jw_parse_failed + hint', () => {
    expect(buildParseFailedMessage('boom', t)).toBe('jw_parse_failed:boom' + 'jw_parse_failed_hint')
  })

  it('classifyDiagnostics 空 HTML 直接抛 (调用方已前置拦截)', () => {
    expect(() => classifyDiagnostics('', school('cf'))).toThrow()
  })
})

describe('captureFailureMessage', () => {
  const fail = (kind: 'timeout' | 'network' | 'http' | 'invalid'): Extract<FetchOutcome, { ok: false }> => ({
    ok: false, kind, status: kind === 'http' ? 502 : 0, detail: 'x', finalUrl: 'https://a.edu.cn/',
  })

  it('四类抓取失败各有专属文案', () => {
    expect(captureFailureMessage(fail('timeout'), t)).toContain('jw_fetch_timeout')
    expect(captureFailureMessage(fail('network'), t)).toContain('jw_fetch_failed')
    expect(captureFailureMessage(fail('http'), t)).toContain('jw_fetch_failed')
    expect(captureFailureMessage(fail('invalid'), t)).toContain('jw_fetch_format_error')
  })
})

// ── 落库映射 ────────────────────────────────────────────────────────────

describe('toCourseEntities', () => {
  it('step = endNode-startNode+1, groupId 留空交给仓储补组', () => {
    const [row] = toCourseEntities([COURSE], 42)
    expect(row).toMatchObject({
      tableId: 42,
      groupId: '',
      courseName: '高等数学',
      day: 1,
      startNode: 1,
      step: 2,
      startWeek: 1,
      endWeek: 16,
      color: JW_DEFAULT_COLOR,
    })
  })

  it('endNode < startNode 时 step 至少 1', () => {
    const [row] = toCourseEntities([{ ...COURSE, startNode: 5, endNode: 3 }], 1)
    expect(row.step).toBe(1)
  })
})

describe('groupCourses', () => {
  it('同名同周几合并, 异名/异日分开', () => {
    const groups = groupCourses([
      COURSE,
      { ...COURSE, startNode: 5, endNode: 6 },
      { ...COURSE, name: '大学英语' },
      { ...COURSE, day: 3 },
    ])
    expect(groups).toHaveLength(3)
    expect(groups.find((g) => g.name === '高等数学' && g.day === 1)?.courses).toHaveLength(2)
    expect(groups.find((g) => g.name === '高等数学' && g.day === 1)?.nodeLabel).toBe('1-6')
    expect(groups.every((g) => g.key === `${g.name}|${g.day}`)).toBe(true)
  })
})

describe('bestAttempt', () => {
  it('取课程最多的一次, 忽略 0 课', () => {
    expect(bestAttempt([attempt(0), attempt(7, 'urp'), attempt(3)])?.parserName).toBe('urp')
  })

  it('全 0 课 → null', () => {
    expect(bestAttempt([attempt(0), attempt(0)])).toBeNull()
  })
})

// ── 代理客户端 (mock fetch, 绝不真连) ───────────────────────────────────

describe('proxyClient', () => {
  it('代理 URL 编码目标地址', () => {
    expect(proxyUrlFor('https://jw.hrbeu.edu.cn/x?q=1')).toBe(
      `${JW_PROXY_BASE}/?url=${encodeURIComponent('https://jw.hrbeu.edu.cn/x?q=1')}`
    )
  })

  it('charset 优先 Content-Type, 其次 meta, GBK 族归一 gb18030', () => {
    expect(charsetFromContentType('text/html; charset=GBK')).toBe('gb18030')
    expect(charsetFromContentType(null, '<meta charset="gb2312">')).toBe('gb18030')
    expect(charsetFromContentType(null, '<html>')).toBe('utf-8')
  })

  it('decodeBytes 按 charset 解码, 非法 label 回落 utf-8', () => {
    const bytes = new TextEncoder().encode('课表')
    expect(decodeBytes(bytes, 'utf-8')).toBe('课表')
    expect(decodeBytes(bytes, 'not-a-real-charset')).toBe('课表')
  })

  it('成功响应读上游状态头与最终 URL', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse('<html>ok</html>', 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Sleepy-Upstream-Status': '200',
      'X-Sleepy-Upstream-Url': 'https://jw.example.edu.cn/kb',
    }))
    const out = await fetchViaProxy('https://jw.example.edu.cn/kb', {}, fetchImpl as unknown as typeof fetch)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.body).toContain('ok')
    expect(out.finalUrl).toBe('https://jw.example.edu.cn/kb')
  })

  it('上游 502 → kind=http 且带状态码', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse('{"error":"bad gateway"}', 200, {
      'Content-Type': 'application/json',
      'X-Sleepy-Upstream-Status': '502',
    }))
    const out = await fetchViaProxy('https://jw.example.edu.cn/kb', {}, fetchImpl as unknown as typeof fetch)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.kind).toBe('http')
    expect(out.status).toBe(502)
  })

  it('fetch 抛错 → kind=network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const out = await fetchViaProxy('https://jw.example.edu.cn/kb', {}, fetchImpl as unknown as typeof fetch)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.kind).toBe('network')
  })

  it('超时 → kind=timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const out = await fetchViaProxy('https://jw.example.edu.cn/kb', { timeoutMs: 5 }, fetchImpl as unknown as typeof fetch)
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.kind).toBe('timeout')
  })
})

function fakeResponse(body: string, status: number, headers: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    arrayBuffer: async () => {
      const bytes = new TextEncoder().encode(body)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    },
  } as unknown as Response
}

// ── 协议判型 / URL 工具 ─────────────────────────────────────────────────

describe('protocol', () => {
  it('识别常见教务入口', () => {
    expect(detectProtocolFromUrl('https://jwglxt.example.edu.cn/xsfw/sys/jxjhkbaapp/xskbjbxxcx.do')).toBe('zf_new')
    expect(detectProtocolFromUrl('https://jw.example.edu.cn/default2.aspx')).toBe('zf')
    expect(detectProtocolFromUrl('https://jwxt.example.edu.cn/jsxsd/kbcg/kbxx01.do')).toBe('qz')
    expect(detectProtocolFromUrl('https://jw.example.edu.cn/xkAction.do?actiontype=6')).toBe('urp')
    expect(detectProtocolFromUrl('https://ehall.example.edu.cn/jwapp/sys/kb')).toBe('wisedu')
  })

  it('认不出的域名 → null (交给通用裁决)', () => {
    expect(detectProtocolFromUrl('https://library.example.edu.cn/')).toBeNull()
  })

  it('looksLikeUrl 只认带点的主机名', () => {
    expect(looksLikeUrl('https://jw.hrbeu.edu.cn/kb')).toBe(true)
    expect(looksLikeUrl('jw.hrbeu.edu.cn')).toBe(true)
    expect(looksLikeUrl('哈尔滨工程大学')).toBe(false)
    expect(looksLikeUrl('hrbeu')).toBe(false)
  })

  it('normalizeUrl 补协议并保留路径', () => {
    expect(normalizeUrl('jw.hrbeu.edu.cn/x')).toBe('https://jw.hrbeu.edu.cn/x')
    expect(normalizeUrl('http://a.edu.cn/')).toBe('http://a.edu.cn/')
  })

  it('displayHost 去协议去尾斜杠', () => {
    expect(displayHost('https://jw.example.edu.cn/')).toBe('jw.example.edu.cn')
    expect(displayHost('http://jw.example.edu.cn')).toBe('jw.example.edu.cn')
  })

  it('registrableDomain 处理两段公共后缀', () => {
    expect(registrableDomain('jw.hrbeu.edu.cn')).toBe('hrbeu.edu.cn')
    expect(registrableDomain('a.b.example.co.uk')).toBe('co.uk')
    expect(registrableDomain('a.b.example.edu.hk')).toBe('example.edu.hk')
  })

  it('isVpnRewrite 认校园网代理前缀', () => {
    expect(isVpnRewrite('webvpn.hrbeu.edu.cn')).toBe(true)
    expect(isVpnRewrite('jw.hrbeu.edu.cn')).toBe(false)
  })

  it('按注册域反查目录里的学校', () => {
    const hit = matchSchoolByDomain('https://jw.hrbeu.edu.cn/kb', SCHOOLS)
    expect(hit?.name).toContain('哈尔滨工程大学')
    expect(matchSchoolByDomain('https://no-such-host.invalid/', SCHOOLS)).toBeNull()
  })

  it('协议显示名覆盖已知类型, 未知原样返回', () => {
    expect(protocolDisplayName('qz')).toContain('强智')
    expect(protocolDisplayName(null)).toBe('')
  })
})

// ── 拼音搜索 / 目录 ─────────────────────────────────────────────────────

describe('pinyin', () => {
  it('首字母串', () => {
    expect(namePinyinShort('哈尔滨工程大学', 'H')).toBe('hhebgcdx')
  })

  it('拼音首字母 / 校名 / 别名任一命中', () => {
    expect(matchPinyin('哈尔滨工程大学', 'H', 'hebgcdx')).toBe(true)
    expect(matchPinyin('哈尔滨工程大学', 'H', '工程')).toBe(true)
    expect(matchPinyin('哈尔滨工程大学', 'H', 'hrbeu', ['hrbeu'])).toBe(true)
    expect(matchPinyin('哈尔滨工程大学', 'H', 'tsinghua')).toBe(false)
    expect(matchPinyin('哈尔滨工程大学', 'H', '  ')).toBe(true)
  })

  it('filterSchools 命中集非空且别名全等置顶', () => {
    const hit = filterSchools(SCHOOLS, 'hrbeu')
    expect(hit.length).toBeGreaterThan(0)
    expect(hit[0].name).toContain('哈尔滨工程大学')
    expect(filterSchools(SCHOOLS, '')).toHaveLength(SCHOOLS.length)
  })
})

describe('schools 目录', () => {
  it('全量目录已加载且远多于早期 163 校', () => {
    expect(SCHOOLS.length).toBeGreaterThan(163)
  })

  it('按 sortKey 分组且首字母大写', () => {
    const sections = groupByLetter(SCHOOLS)
    expect(sections.length).toBeGreaterThan(10)
    expect(sections.every((s) => /^[A-Z★]$/.test(s.letter))).toBe(true)
    expect(sections.flatMap((s) => s.schools)).toHaveLength(SCHOOLS.length)
  })

  it('非字母 sortKey 回落 ★ 组', () => {
    expect(letterOf({ ...SCHOOLS[0], sortKey: '' })).toBe('★')
  })

  it('可点条件 = 已适配且有 URL', () => {
    const pending = { ...SCHOOLS[0], status: 'pending' }
    expect(isSelectable(pending)).toBe(false)
    expect(isSelectable({ ...SCHOOLS[0], url: '' })).toBe(false)
    expect(isSelectable({ ...SCHOOLS[0], status: 'supported', url: 'https://a.edu.cn/' })).toBe(true)
  })

  it('待适配/研究生/已下线有角标, 已适配无角标', () => {
    expect(statusBadge({ ...SCHOOLS[0], status: 'supported' })).toBeNull()
    expect(statusBadge({ ...SCHOOLS[0], status: 'pending' })?.labelKey).toBe('jw_pending_pending')
    expect(statusBadge({ ...SCHOOLS[0], status: 'grad_supported' })?.labelKey).toBe('jw_pending_grad')
    expect(statusBadge({ ...SCHOOLS[0], status: 'legacy' })?.labelKey).toBe('jw_pending_legacy')
  })
})
