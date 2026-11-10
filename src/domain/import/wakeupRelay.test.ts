// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import worker from '../../../worker/sleepy-jw-proxy'
const relay = (target: string, method = 'POST', body = 'data=example') => worker.fetch(new Request(`https://relay.example/?url=${encodeURIComponent(target)}`, { method, ...(method === 'POST' ? { body } : {}) }), {}, {})
afterEach(() => vi.unstubAllGlobals())
it('blocks academic URLs, credentials, lookalike hosts, queries, redirects and wrong methods before any upstream request', async () => {
  const upstream = vi.fn(async () => new Response('ok'));vi.stubGlobal('fetch',upstream)
  for (const target of ['https://jw.example.edu/login','https://api.wakeup.fun.evil.test/pluto/app/antispam','http://api.wakeup.fun/pluto/app/antispam','https://user@api.wakeup.fun/pluto/app/antispam','https://api.wakeup.fun/pluto/app/antispam?url=x','https://api.wakeup.fun/other','https://api.wakeup.fun/share_schedule/getv2#x']) expect((await relay(target)).status).toBe(403)
  expect((await relay('https://api.wakeup.fun/share_schedule/getv2','GET')).status).toBe(405)
  expect(upstream).not.toHaveBeenCalled()
})
it('supports CORS and relays only WakeUP headers and the exact form body', async () => {
  const upstream = vi.fn(async () => new Response('{"result":"ok"}',{status:201,headers:{'Content-Type':'application/json','Set-Cookie':'secret=1'}}));vi.stubGlobal('fetch',upstream)
  const preflight=await worker.fetch(new Request('https://relay.example/',{method:'OPTIONS'}),{}, {})
  expect(preflight.status).toBe(204);expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
  const request=new Request('https://relay.example/?url=https%3A%2F%2Fapi.wakeup.fun%2Fshare_schedule%2Fgetv2',{method:'POST',headers:{Authorization:'private',Cookie:'private','zyb-cuid':'device'},body:'data=a%2Bb'})
  const response=await worker.fetch(request,{}, {})
  const [url,init]=upstream.mock.calls[0] as unknown as [string,RequestInit]
  expect(url).toBe('https://api.wakeup.fun/share_schedule/getv2');expect(init.redirect).toBe('error')
  const headers=new Headers(init.headers);expect(headers.get('zyb-cuid')).toBe('device');expect(headers.get('Authorization')).toBeNull();expect(headers.get('Cookie')).toBeNull()
  expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('data=a%2Bb')
  expect(response.status).toBe(201);expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');expect(response.headers.get('Set-Cookie')).toBeNull()
  expect(await response.json()).toEqual({result:'ok'})
})
it('bounds request and streaming response sizes and converts network failure to a CORS error', async () => {
  const upstream=vi.fn(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8*1024*1024+1));c.close()}})));vi.stubGlobal('fetch',upstream)
  expect((await relay('https://api.wakeup.fun/pluto/app/antispam','POST','a'.repeat(65537))).status).toBe(413)
  expect(upstream).not.toHaveBeenCalled()
  expect((await relay('https://api.wakeup.fun/pluto/app/antispam')).status).toBe(502)
  upstream.mockRejectedValueOnce(new Error('network'))
  const failed=await relay('https://api.wakeup.fun/pluto/app/antispam');expect(failed.status).toBe(502);expect(failed.headers.get('Access-Control-Allow-Origin')).toBe('*')
})
