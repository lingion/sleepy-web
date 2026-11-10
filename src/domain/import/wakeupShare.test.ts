import { it, expect, vi, afterEach } from 'vitest'
import { buildWakeupScheduleJson, looksLikeWakeupShareCode, resolveWakeupShare } from './wakeupShare'
import * as protocol from './wakeup/protocol.js'
import vectors from './wakeup/vectors.json'
import { parseSchedule } from './scheduleParser'
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
it('Android金标MD5、DES、token、RC4与签名请求逐字节一致',()=>{
  for(const [plain,hex] of vectors.md5Hex)expect(protocol.wakeupMd5Hex(plain)).toBe(hex)
  for(const item of vectors.des)expect(Array.from(protocol.wakeupDesEncrypt(item.plain,item.key),n=>n.toString(16).padStart(2,'0')).join('')).toBe(item.cipherHex)
  expect(protocol.wakeupTokenFromSignB(vectors.signB.cipherNativeHex,vectors.fixRand10)).toBe(vectors.token10)
  expect(protocol.wakeupGetRc4Key(vectors.token10)).toBe(vectors.rc4Key.key)
  for (const [plain,key,cipher] of vectors.rc4Cases) expect(protocol.wakeupBytesToBase64(protocol.wakeupRc4(plain,key))).toBe(cipher)
  vi.spyOn(Date,'now').mockReturnValue(vectors.nowMs)
  const device={...protocol.wakeupCreateDevice(),...vectors.deviceWithIds}
  expect(protocol.wakeupBuildShareRequest(vectors.buildShareRequest.code,vectors.token10,device,protocol.wakeupMakeCommonParams(device))).toEqual({rc4Key:vectors.rc4Key.key,body:vectors.buildShareRequest.body})
})
it('口令窄窗不抢离线格式',()=>{
  expect(looksLikeWakeupShareCode('分享口令为「Abcd1234」')).toBe(true)
  expect(looksLikeWakeupShareCode('Abcd1234')).toBe(true)
  for(const s of ['#sleepy-v1\nT课程','BEGIN:VCALENDAR','<html>课程</html>','{"courses":[]}','高数 张三 A101 1 1-2 1-16'])expect(looksLikeWakeupShareCode(s)).toBe(false)
})
it('两段真实签名协议mock贯通，数据交给真实解析器',async()=>{
  let requestIndex=0, token='ZX9kQ3r7Lp', rc4Key=''
  // Deterministic secure random source only in this test; server decodes the same rand10.
  vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation((array)=>{
    const bytes=array as Uint8Array;bytes.fill(0);return array
  })
  const fetchImpl=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
    expect(init?.method).toBe('POST');expect(init?.credentials).toBe('omit')
    expect(String(url)).toContain('sleepy-jw-proxy')
    requestIndex++
    if(requestIndex===1){
      expect(decodeURIComponent(String(url))).toContain('/pluto/app/antispam')
      const signB=protocol.wakeupNativeHexEncode(protocol.wakeupDesEncrypt(`AAAAAAAAAA##${token}`,'AAAAA#G4'))
      return new Response(JSON.stringify({data:{data:signB}}))
    }
    expect(decodeURIComponent(String(url))).toContain('/share_schedule/getv2')
    rc4Key=protocol.wakeupGetRc4Key(token)
    const encrypted=protocol.wakeupBytesToBase64(protocol.wakeupRc4(JSON.stringify({shareData:vectors.shareData}),rc4Key))
    return new Response(JSON.stringify({data:{data:encrypted}}))
  })
  const json=await resolveWakeupShare('Abcd1234',fetchImpl)
  const parsed=parseSchedule(json,0)
  expect(parsed.ok).toBe(true)
  if(!parsed.ok)throw parsed.error
  expect(parsed.value.courses.map(c=>c.courseName)).toEqual(['高等数学','大学英语','高等数学'])
  expect(parsed.value.startDate).toBe('2025-09-01')
  expect(parsed.value.maxWeek).toBe(20)
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
it('HTTP错误、坏签名、缺数据和不完整五段不得伪造成功',async()=>{
  await expect(resolveWakeupShare('Abcd1234',vi.fn(async()=>new Response('',{status:503})))).rejects.toThrow('HTTP 503')
  await expect(resolveWakeupShare('Abcd1234',vi.fn(async()=>new Response('{}')))).rejects.toThrow('签名')
  expect(()=>buildWakeupScheduleJson('{}')).toThrow('5 个部分')
})
it('日期与节点使用 Android 金标语义，接受数字字符串且拒绝无效五段',()=>{
  for(const [date,expected] of [['9/1/2025','2025-09-01'],['2025/9/1','2025-09-01'],['2025-02-30',undefined]]) {
    const parts=vectors.shareData.split('\n')
    const ui=JSON.parse(parts[2]);ui.startDate=date;ui.nodes='40';parts[2]=JSON.stringify(ui)
    const details=JSON.parse(parts[4]);details[0].day=String(details[0].day);parts[4]=JSON.stringify(details)
    const result=JSON.parse(buildWakeupScheduleJson(parts.join('\n')))
    expect(result.startDate).toBe(expected)
    expect(result.tableInfo.nodesPerDay).toBe(40)
    expect(result.courses).toHaveLength(3)
  }
  expect(()=>buildWakeupScheduleJson('null\n[]\nnull\n[]\n[]')).toThrow('格式无效')
})
it('用户取消与超时有不同结果，取消后不得启动第二段请求',async()=>{
  const controller=new AbortController();controller.abort()
  const never=vi.fn(async()=>new Response('{}'))
  await expect(resolveWakeupShare('Abcd1234',never,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'})
  expect(never).not.toHaveBeenCalled()
  vi.useFakeTimers()
  const pending=resolveWakeupShare('Abcd1234',vi.fn((_url,init)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))))
  const rejected=expect(pending).rejects.toThrow('超时')
  await vi.advanceTimersByTimeAsync(15000)
  await rejected
})
