/**
 * proxyClient — 教务页面抓取客户端 (worker/sleepy-jw-proxy.ts 的调用侧)。
 *
 * 浏览器直连教务站被 CORS 拦死 → 走用户自建 Cloudflare Worker 透传。
 *
 * 与 Android 的差异 (必须如实说明):
 *   Android 用 WebView, 用户在页面内登录后从 DOM 抓 HTML, 天然带会话 Cookie。
 *   浏览器无法把教务站嵌进 iframe (X-Frame-Options/CSP), 也无法替用户携带其 Cookie
 *   (Worker 明确剥掉 Cookie 头) → 直连抓取通常落在登录页, 由 diagnostics 判为
 *   SESSION_EXPIRED。因此本页同时提供「粘贴课表 HTML」通道作为等价能力:
 *   用户在自己浏览器里登录并打开「个人课表」→ 保存/复制页面源码 → 粘贴解析。
 */

/** 已部署 Worker (worker/wrangler.toml 记录 2026-09-12 上线) */
export const JW_PROXY_BASE = 'https://sleepy-jw-proxy.lingion04.workers.dev'

/** JwWebViewLoginScreen.FETCH_TIMEOUT_MS 同值 */
export const FETCH_TIMEOUT_MS = 20_000

export type FetchFailureKind = 'timeout' | 'network' | 'http' | 'invalid'

export type FetchOutcome =
  | { ok: true; status: number; body: string; finalUrl: string; charset: string }
  | { ok: false; kind: FetchFailureKind; status: number; detail: string; finalUrl: string }

export interface ProxyFetchOptions {
  /** 覆盖超时 (测试用) */
  timeoutMs?: number
  /** 追加请求头 (Worker 透传, 剥 hop-by-hop) */
  headers?: Record<string, string>
}

/** 可注入的抓取函数 — 测试里整体 mock, 绝不真连教务站 */
export type ProxyFetcher = (target: string, options?: ProxyFetchOptions) => Promise<FetchOutcome>

export function proxyUrlFor(target: string, base: string = JW_PROXY_BASE): string {
  return `${base}/?url=${encodeURIComponent(target)}`
}

/** Content-Type → charset; 缺省按教务现状猜 utf-8, 显式 gbk/gb2312/gb18030 归一 gb18030 */
export function charsetFromContentType(contentType: string | null, bodyHint: string = ''): string {
  const m = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? '')
  let cs = (m?.[1] ?? '').toLowerCase()
  if (!cs) {
    const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(bodyHint.slice(0, 4096))
    cs = (meta?.[1] ?? '').toLowerCase()
  }
  if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb-18030' || cs === 'gb18030') return 'gb18030'
  if (!cs) return 'utf-8'
  return cs
}

/** 按 charset 解码字节流; 环境不支持该 label 时回落 utf-8 */
export function decodeBytes(bytes: ArrayBuffer | Uint8Array, charset: string): string {
  const tryDecode = (label: string): string | null => {
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      return null
    }
  }
  return tryDecode(charset) ?? tryDecode('utf-8') ?? new TextDecoder().decode(bytes)
}

/**
 * 默认实现: 经 Worker 透传抓取一段 HTML。
 * 超时用 AbortController (对齐 Android 20s 抓取超时 → jw_fetch_timeout)。
 */
export async function fetchViaProxy(
  target: string,
  options: ProxyFetchOptions = {},
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<FetchOutcome> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const resp = await fetchImpl(proxyUrlFor(target), {
      method: 'GET',
      redirect: 'follow',
      headers: options.headers,
      signal: controller.signal,
    })
    const buffer = await resp.arrayBuffer()
    const contentType = resp.headers.get('Content-Type')
    const utf8Preview = decodeBytes(buffer, 'utf-8')
    const charset = charsetFromContentType(contentType, utf8Preview)
    const body = charset === 'utf-8' ? utf8Preview : decodeBytes(buffer, charset)
    const upstreamStatus = Number(resp.headers.get('X-Sleepy-Upstream-Status') ?? '') || resp.status
    const finalUrl = resp.headers.get('X-Sleepy-Upstream-Url') ?? target
    if (!resp.ok || upstreamStatus >= 400) {
      return { ok: false, kind: 'http', status: upstreamStatus, detail: `HTTP ${upstreamStatus}`, finalUrl }
    }
    return { ok: true, status: upstreamStatus, body, finalUrl, charset }
  } catch (e) {
    return {
      ok: false,
      kind: timedOut ? 'timeout' : 'network',
      status: 0,
      detail: e instanceof Error ? e.message : String(e),
      finalUrl: target,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 生产用 fetcher (依赖注入点集中在 fetchImpl) */
export const defaultProxyFetcher: ProxyFetcher = (target, options) => fetchViaProxy(target, options)
