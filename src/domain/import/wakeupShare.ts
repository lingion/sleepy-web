import * as protocol from './wakeup/protocol.js'
import { validFixedDate } from './sleepyNativeParser'

export const WAKEUP_PROXY_BASE = 'https://sleepy-jw-proxy.lingion04.workers.dev'
interface WakeupShareOptions { signal?: AbortSignal; proxyBase?: string }

export function looksLikeWakeupShareCode(text: string): boolean {
  const input = text.trim()
  return /^[A-Za-z0-9_-]{8,200}$/.test(input) || (input.includes('分享口令') && protocol.validateKey(input) === false)
}

/** Only share codes enter the online path. Offline file contents never reach the relay. */
export async function resolveWakeupShare(input: string, fetchImpl: typeof fetch = globalThis.fetch, options: WakeupShareOptions = {}): Promise<string> {
  options.signal?.throwIfAborted()
  const invalid = protocol.validateKey(input)
  if (invalid) throw Error(invalid)
  const device = protocol.wakeupCreateDevice()
  const params = protocol.wakeupMakeCommonParams(device)
  const { signA, rand10 } = protocol.wakeupMakeSignA(device.cuid)
  const proxyBase = options.proxyBase ?? import.meta.env.VITE_WAKEUP_PROXY_BASE ?? WAKEUP_PROXY_BASE

  async function post(path: string, body: string): Promise<Record<string, unknown>> {
    options.signal?.throwIfAborted()
    const controller = new AbortController()
    const cancel = () => controller.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const url = new URL(proxyBase)
      url.searchParams.set('url', protocol.WAKEUP_V6170.host + path)
      const response = await fetchImpl(url.toString(), {
        method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'na__zyb_source__': 'wakeup', 'zyb-cuid': device.cuid, 'zyb-adid': device.adid }, body,
      })
      if (!response.ok) throw Error(`WakeUP 服务请求失败（HTTP ${response.status}）。`)
      const text = await response.text()
      controller.signal.throwIfAborted()
      try {
        const value: unknown = JSON.parse(text)
        if (!isObject(value)) throw Error()
        return value
      } catch { throw Error('WakeUP 响应格式无效。') }
    } catch (error) {
      options.signal?.throwIfAborted()
      if (controller.signal.aborted) throw Error('WakeUP 请求超时，请重试。')
      throw error
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', cancel)
    }
  }

  const anti = await post(protocol.WAKEUP_V6170.antispamPath, `data=${encodeURIComponent(signA)}&${params.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`).join('&')}&`)
  const signB = protocol.wakeupExtractSignB(anti)
  if (!signB) throw Error('WakeUP antispam 响应未包含签名数据。')
  const token = protocol.wakeupTokenFromSignB(signB, rand10)
  const request = protocol.wakeupBuildShareRequest(protocol.extractKeyFromText(input), token, device, params)
  const share = await post(protocol.WAKEUP_V6170.sharePath, request.body)
  const encrypted = isObject(share.data) ? share.data.data : share.data
  if (typeof encrypted !== 'string' || !encrypted) throw Error('WakeUP 课表响应未包含加密数据。')
  let data: unknown
  try { data = JSON.parse(protocol.wakeupBytesToUtf8(protocol.wakeupRc4(protocol.wakeupBase64ToBytes(encrypted), request.rc4Key))) }
  catch { throw Error('WakeUP 课表响应解密失败。') }
  if (!isObject(data) || typeof data.shareData !== 'string') throw Error('WakeUP 解密数据中未找到 shareData。')
  return buildWakeupScheduleJson(data.shareData)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function integer(value: unknown): number | null {
  const n = typeof value === 'string' && /^[+-]?\d+$/.test(value) ? Number(value) : value
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= -2147483648 && n <= 2147483647 ? n : null
}
function semesterDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,4})(?:T.*)?$/.exec(value.trim().replaceAll('/', '-'))
  if (!m) return undefined
  const [year, month, day] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[1], m[2]]
  const date = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return validFixedDate(date) ?? undefined
}

/** Android WakeUpShareClient.buildScheduleJson: five JSON parts, node whitelist and ID join. */
export function buildWakeupScheduleJson(raw: string): string {
  const parts = raw.trim().split('\n')
  if (parts.length < 5) throw Error('数据格式不完整，预期至少包含 5 个部分。')
  let decoded: unknown[]
  try { decoded = parts.slice(0, 5).map(p => JSON.parse(p)) }
  catch { throw Error('WakeUP 课表数据格式无效。') }
  const [base, slots, ui, courses, details] = decoded
  if (!isObject(base) || !isObject(ui) || !Array.isArray(slots) || !Array.isArray(courses) || !Array.isArray(details)) throw Error('WakeUP 课表数据格式无效。')
  const count = integer(ui.nodes)
  // Do not expand the count into an array. Explicit high node numbers remain intact.
  const nodes = new Set(Array.isArray(ui.nodes) ? ui.nodes.map(integer).filter((n): n is number => n !== null) : [])
  const validNode = (node: number) => Array.isArray(ui.nodes) ? nodes.has(node) : count !== null && node >= 1 && node <= count
  const timeList = slots.flatMap(s => {
    if (!isObject(s)) return []
    const node = integer(s.node)
    return node !== null && validNode(node) && s.startTime !== '00:00' && s.endTime !== '00:00'
      ? [{ node, startTime: s.startTime ?? '', endTime: s.endTime ?? '' }] : []
  })
  const converted = details.flatMap(d => {
    if (!isObject(d) || d.id == null) return []
    const c = courses.find(c => isObject(c) && c.id != null && String(c.id) === String(d.id))
    if (!isObject(c) || typeof c.courseName !== 'string') return []
    const values = ['day', 'startNode', 'step', 'startWeek', 'endWeek', 'type'].map(k => integer(d[k]))
    if (values.some(v => v === null)) return []
    const [day, startNode, step, startWeek, endWeek, type] = values
    return [{ name: c.courseName, teacher: d.teacher ?? '', position: d.room ?? '', day, startNode, step, startWeek, endWeek, type }]
  })
  const startDate = semesterDate(ui.startDate)
  const nodesPerDay = Array.isArray(ui.nodes) ? Math.max(0, ...nodes) : Math.max(0, count ?? 0)
  // Reject an unreasonable editor allocation explicitly instead of silently truncating nodes.
  if (nodesPerDay > 10000) throw Error('WakeUP 节次数超过网页单次导入的 10000 节上限。')
  return JSON.stringify({ name: 'WakeUP 分享课表', ...(startDate ? { startDate } : {}), courses: converted, tableInfo: { timeList, nodesPerDay, maxWeek: integer(ui.maxWeek) } })
}
