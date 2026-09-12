/**
 * sleepy-jw-proxy — CORS 中转 Worker (W6)
 *
 * Web 端浏览器抓教务 HTML 被 CORS 拦 → 用户自建 Worker 中转。
 * 设计原则: 通用透传, 不解析教务协议 (解码语义唯一落点 = web 端 jw parser,
 * 跨语言 invariant 与 Android QZ_APP_FETCH_JS 同规)。
 *
 * ⚠ 部署属外部发布动作 — 2026-09-12 用户批准后已上线:
 *   https://sleepy-jw-proxy.lingion04.workers.dev
 *
 * 部署方式 (用户手动):
 *   cd worker && npx wrangler deploy --name sleepy-jw-proxy
 *   (需 CLOUDFLARE_API_TOKEN; 建议绑定到自有域名或加自定义限制)
 *
 * 安全设计:
 *   - 仅允许 GET/POST/HEAD (教务抓取所需全集)
 *   - 禁转发 Cookie/Authorization 以外的鉴权头由调用方显式传 (透传全部自定义头)
 *   - 响应大小上限 8MB (防滥用)
 *   - 无状态, 不落任何日志存储
 *
 * Web 端用法:
 *   fetch(`https://<worker-domain>/?url=${encodeURIComponent(target)}`, { headers })
 *   → Worker 补 CORS 头返回原响应 (body/状态/Content-Type 透传)
 */

export interface Env {}

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const ALLOWED_METHODS = new Set(['GET', 'POST', 'HEAD'])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
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

    // 仅 http/https; 禁内网地址段 (SSRF 基础防御, cfp round6 同款教训)
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return json({ error: '仅支持 http/https' }, 400)
    }
    const host = targetUrl.hostname
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return json({ error: '禁止内网地址' }, 403)
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return json({ error: `方法 ${request.method} 不允许` }, 405)
    }

    // 透传请求头 (剥 hop-by-hop)
    const headers = new Headers()
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase()
      if (lower === 'host' || lower === 'origin' || lower === 'referer' || lower === 'cookie') continue
      if (lower.startsWith('cf-') || lower.startsWith('x-forwarded')) continue
      headers.set(k, v)
    }
    // 教务系统常见 UA 校验 — 默认伪装成浏览器
    if (!headers.has('User-Agent')) {
      headers.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      )
    }

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: 'follow',
    }
    if (request.method === 'POST') {
      init.body = await request.arrayBuffer()
    }

    let upstream: Response
    try {
      upstream = await fetch(targetUrl.toString(), init)
    } catch (e) {
      return json({ error: '上游请求失败', detail: e instanceof Error ? e.message : String(e) }, 502)
    }

    // 响应大小防护
    const contentLength = Number(upstream.headers.get('Content-Length') ?? '0')
    if (contentLength > MAX_RESPONSE_BYTES) {
      return json({ error: '响应超过 8MB 上限' }, 502)
    }

    const respHeaders = new Headers(CORS_HEADERS)
    respHeaders.set('Content-Type', upstream.headers.get('Content-Type') ?? 'text/html; charset=utf-8')
    respHeaders.set('X-Sleepy-Upstream-Status', String(upstream.status))
    respHeaders.set('X-Sleepy-Upstream-Url', targetUrl.toString())

    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_RESPONSE_BYTES) {
      return json({ error: '响应超过 8MB 上限' }, 502)
    }
    return new Response(body, { status: upstream.status, headers: respHeaders })
  },
}

function json(obj: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
