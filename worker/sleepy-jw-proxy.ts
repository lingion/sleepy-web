/** CORS relay for the two official WakeUP share endpoints only. Academic-system URLs are rejected before fetch. */
export interface Env {}

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const ALLOWED_METHODS = new Set(['POST'])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Sleepy-Upstream-Status, X-Sleepy-Upstream-Url',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request: Request, _env: Env, _ctx: unknown): Promise<Response> {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const target = url.searchParams.get('url')
    if (!target) {
      return json({ error: '缺少 ?url= 参数' }, 400)
    }

    let targetUrl: URL
    try {
      targetUrl = new URL(target)
    } catch {
      return json({ error: 'url 参数非法' }, 400)
    }

    if (targetUrl.origin !== 'https://api.wakeup.fun' || targetUrl.username || targetUrl.password ||
        targetUrl.search || targetUrl.hash || !['/pluto/app/antispam', '/share_schedule/getv2'].includes(targetUrl.pathname)) {
      return json({ error: '网页暂不支持教务导入，请使用安卓版导入' }, 403)
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return json({ error: `方法 ${request.method} 不允许` }, 405)
    }

    const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' })
    for (const name of ['na__zyb_source__', 'zyb-cuid', 'zyb-adid', 'zyb-did']) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    const init: RequestInit = {
      method: request.method,
      headers,
      // workerd accepts follow/manual. Reject redirects explicitly before reading or forwarding them.
      redirect: 'manual',
      credentials: 'omit',
    }
    if (request.method === 'POST') {
      try { init.body = await readBounded(request.body, 64 * 1024) }
      catch { return json({ error: '请求过大' }, 413) }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    init.signal = controller.signal
    try {
      const upstream = await fetch(targetUrl.toString(), init)
      if (upstream.status >= 300 && upstream.status < 400) {
        await upstream.body?.cancel()
        return json({ error: '上游不允许重定向' }, 502)
      }
      const contentLength = Number(upstream.headers.get('Content-Length') ?? '0')
      if (contentLength > MAX_RESPONSE_BYTES) {
        await upstream.body?.cancel()
        return json({ error: '响应超过 8MB 上限' }, 502)
      }
      const respHeaders = new Headers(CORS_HEADERS)
      respHeaders.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8')
      respHeaders.set('X-Sleepy-Upstream-Status', String(upstream.status))
      respHeaders.set('X-Sleepy-Upstream-Url', targetUrl.toString())
      const body = await readBounded(upstream.body, MAX_RESPONSE_BYTES)
      return new Response([204, 205, 304].includes(upstream.status) ? null : body, { status: upstream.status, headers: respHeaders })
    } catch (e) {
      return json({ error: '上游请求失败', detail: e instanceof Error ? e.message : String(e) }, 502)
    } finally { clearTimeout(timeout) }
  },
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<ArrayBuffer> {
  if (!stream) return new ArrayBuffer(0)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw Error('响应或请求超过大小上限') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes.buffer
}

function json(obj: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
