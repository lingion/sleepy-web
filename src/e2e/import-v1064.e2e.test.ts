import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as protocol from '../domain/import/wakeup/protocol.js'
import vectors from '../domain/import/wakeup/vectors.json'
import { parseSchedule } from '../domain/import/scheduleParser'

const port = 30000 + Math.floor(Math.random()*20000)
const base = `http://127.0.0.1:${port}/sleepy-web/`
let server: ChildProcess | undefined
let browser: Browser | undefined
beforeAll(async()=>{
  server=spawn(join(process.cwd(),'node_modules/.bin/vite'),['preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore'})
  const deadline=Date.now()+15000
  let ready=false
  while(Date.now()<deadline) {
    try {if((await fetch(base)).ok){ready=true;break}} catch {}
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  if(!ready)throw Error('Preview server did not start')
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/Applications/Chromium.app/Contents/MacOS/Chromium',headless:true})
})
afterAll(async()=>{await browser?.close();server?.kill('SIGTERM')})
async function session(run:(page:Page,context:BrowserContext)=>Promise<void>) {
  const context=await browser!.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']})
  const page=await context.newPage();page.setDefaultTimeout(10000)
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/holiday-calendar/**',route=>route.fulfill({json:[]}))
  try {await run(page,context);expect(errors).toEqual([])} finally {await context.close()}
}
async function management(page:Page) {
  await page.goto(base)
  await page.getByRole('navigation').getByRole('button',{name:'课表管理',exact:true}).click()
}
async function openImport(page:Page) {
  await management(page)
  await page.getByRole('button',{name:'导入课表'}).click()
}
async function database(page:Page) {
  return page.evaluate(async()=>{
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('sleepy');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
    try {
      const read=(name:string)=>new Promise<Record<string,unknown>[]>((resolve,reject)=>{const request=database.transaction(name).objectStore(name).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      return {tables:await read('timetables'),courses:await read('courses'),periods:await read('periodTables')}
    } finally {database.close()}
  })
}
const source='{ "学校": "Ａ校", "optional": null }'
const payload=JSON.stringify({name:'浏览器导入',startDate:'2026-09-07',tableInfo:{time:'[{"node":1,"start":"08:00","end":"08:45"}]',importSourceJson:source},courses:[{name:'浏览器单次课',day:1,startNode:1,step:1,startWeek:1,endWeek:20,type:0,fixedDate:'2026-11-12'}]})

it('mobile file import preserves the confirmed date, default, fixed date, source and period binding; native export carries them',async()=>session(async(page)=>{
  await openImport(page)
  const before=await database(page)
  const originalDefault=before.tables.find(t=>t.isDefault===1)?.id
  // Hidden file control is the browser's actual file-picker endpoint.
  await page.locator('input[type=file]').setInputFiles({name:'schedule.json',mimeType:'application/json',buffer:Buffer.from(payload)})
  await page.getByRole('button',{name:'导入为新课表',exact:true}).click()
  await page.getByLabel('第一周从哪天开始').fill('2026-09-16')
  await page.getByRole('button',{name:'确认导入',exact:true}).click()
  await page.getByRole('heading',{name:'课表管理',exact:true}).waitFor()
  const saved=await database(page)
  const imported=saved.tables.find(t=>t.name==='浏览器导入')!
  expect(imported).toMatchObject({startDate:'2026-09-14',importSourceJson:source})
  expect(saved.tables.find(t=>t.isDefault===1)?.id).toBe(originalDefault)
  expect(saved.courses.find(c=>c.tableId===imported.id)).toMatchObject({fixedDate:'2026-11-12'})
  expect(saved.periods.some(p=>p.id===imported.periodTableId)).toBe(true)
  await page.getByRole('button',{name:'导出课表'}).click()
  await page.getByRole('button',{name:/门课程|门课|课程.*开始|示例课表/}).first().click()
  await page.getByText('浏览器导入',{exact:true}).click()
  const downloadPromise=page.waitForEvent('download')
  await page.getByText('Sleepy 原生格式',{exact:true}).click()
  const download=await downloadPromise
  const text=await readFile((await download.path())!,'utf8')
  expect(text).toContain('#sleepy-v1');expect(text).toContain('2026-11-12');expect(text).toContain('source=')
  const restored=parseSchedule(text,0)
  if(!restored.ok)throw restored.error
  expect(restored.value.importSourceJson).toBe(source)
  expect(restored.value.courses[0].fixedDate).toBe('2026-11-12')
}),60000)

it('WakeUP encrypted online flow reaches the real parser and new-table confirmation in a browser',async()=>session(async(page)=>{
  await page.addInitScript(()=>{crypto.getRandomValues=<T extends ArrayBufferView|null>(array:T):T=>{if(array)new Uint8Array(array.buffer,array.byteOffset,array.byteLength).fill(0);return array}})
  let posts=0
  await page.route('https://sleepy-jw-proxy.lingion04.workers.dev/**',async route=>{
    posts++
    const path=new URL(route.request().url()).searchParams.get('url')!
    const token='ZX9kQ3r7Lp'
    if(path.endsWith('/pluto/app/antispam')) {
      const signB=protocol.wakeupNativeHexEncode(protocol.wakeupDesEncrypt(`AAAAAAAAAA##${token}`,'AAAAA#G4'))
      await route.fulfill({json:{data:{data:signB}},headers:{'Access-Control-Allow-Origin':'*'}})
    } else {
      expect(path.endsWith('/share_schedule/getv2')).toBe(true)
      const encrypted=protocol.wakeupBytesToBase64(protocol.wakeupRc4(JSON.stringify({shareData:vectors.shareData}),protocol.wakeupGetRc4Key(token)))
      await route.fulfill({json:{data:{data:encrypted}},headers:{'Access-Control-Allow-Origin':'*'}})
    }
  })
  await openImport(page)
  await page.getByRole('button',{name:'粘贴课表文本',exact:true}).click()
  await page.getByLabel('粘贴课表文本').fill('分享口令为「Abcd1234」')
  await page.getByRole('button',{name:'预览导入',exact:true}).click()
  await page.getByRole('heading',{name:'导入预览',exact:true}).waitFor()
  expect(posts).toBe(2)
  await page.getByRole('button',{name:'导入为新课表',exact:true}).click()
  expect(await page.getByLabel('第一周从哪天开始').inputValue()).toBe('2025-09-01')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await page.getByRole('button',{name:'取消',exact:true}).click()
  expect((await database(page)).tables.some(t=>t.name==='WakeUP 分享课表')).toBe(false)
}),60000)

it('school search, city geolocation, recommendation and custom URL all stay in the Android-only directory',async()=>session(async(page,context)=>{
  const outsideRequests:string[]=[]
  page.on('request',request=>{
    if(!request.url().startsWith(base)&&!request.url().includes('/holiday-calendar/'))outsideRequests.push(request.url())
  })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({latitude:39.9042,longitude:116.4074,accuracy:100})
  await openImport(page)
  const before=await database(page)
  await page.getByRole('button',{name:'教务直连',exact:true}).click()
  await page.getByRole('button',{name:'定位城市',exact:true}).click()
  await page.getByRole('status').filter({hasText:'北京市'}).waitFor()
  await page.getByRole('button',{name:'展开全部',exact:true}).click()
  await page.getByRole('button',{name:'北京大学',exact:true}).click()
  await page.getByRole('alertdialog').waitFor()
  expect(await page.getByRole('alertdialog').textContent()).toContain('网页暂不支持教务导入，请使用安卓版导入')
  await page.getByRole('button',{name:'知道了',exact:true}).click()
  await page.getByRole('searchbox').fill('哈尔滨工程大学')
  await page.getByRole('option',{name:'哈尔滨工程大学',exact:true}).first().click()
  await page.getByRole('alertdialog').waitFor()
  await page.getByRole('button',{name:'知道了',exact:true}).click()
  await page.getByRole('searchbox').fill('https://jw.example.edu/login')
  await page.getByRole('option',{name:'直接用此 URL 登录',exact:true}).click()
  await page.getByRole('alertdialog').waitFor()
  expect(await page.getByRole('link').count()).toBe(0)
  expect(await database(page)).toEqual(before)
  expect(outsideRequests).toEqual([])
}),60000)

it('management append selects groups, previews clock conflicts and saves only accepted courses with a frozen backup',async()=>session(async(page)=>{
  await management(page)
  const before=await database(page)
  const target=before.tables.find(table=>table.isDefault===1)!
  const occupied=before.courses.find(course=>course.tableId===target.id)!
  const appendPayload=JSON.stringify({name:'追加来源',startDate:target.startDate,tableInfo:{importSourceJson:source},courses:[
    {...occupied,name:'浏览器冲突课',groupId:'conflict'},
    {name:'浏览器追加单次课',day:7,startNode:1,step:1,startWeek:1,endWeek:20,type:0,startTime:'00:00',endTime:'00:10',fixedDate:'2026-11-15',groupId:'accepted'},
  ]})
  await page.getByRole('button',{name:/^手动添加课程/}).click()
  await page.getByRole('button',{name:'从课表或文件导入课程',exact:true}).click()
  await page.locator('input[type=file]').setInputFiles({name:'append.json',mimeType:'application/json',buffer:Buffer.from(appendPayload)})
  await page.getByRole('heading',{name:'选择导入课程',exact:true}).waitFor()
  await page.getByRole('button',{name:'取消全选',exact:true}).click()
  expect(await page.getByRole('button',{name:'确定',exact:true}).isDisabled()).toBe(true)
  await page.getByRole('button',{name:'全选',exact:true}).click()
  await page.getByRole('button',{name:'确定',exact:true}).click()
  await page.getByRole('heading',{name:'导入预览',exact:true}).waitFor()
  expect(await page.getByRole('dialog').textContent()).toContain('浏览器冲突课')
  expect(await page.getByLabel('导入前备份原课表').isChecked()).toBe(true)
  expect(await page.getByLabel('同时追加冲突课程').isChecked()).toBe(false)
  await page.getByRole('button',{name:'确认导入',exact:true}).click()
  await page.getByRole('heading',{name:'课表管理',exact:true}).waitFor()
  const saved=await database(page)
  expect(saved.tables.find(table=>table.id===target.id)).toMatchObject({name:target.name,startDate:target.startDate})
  expect(saved.tables.find(table=>table.id===target.id)?.importSourceJson).toBe(target.importSourceJson)
  expect(saved.periods).toEqual(before.periods)
  const accepted=saved.courses.filter(course=>course.tableId===target.id)
  expect(accepted.some(course=>course.courseName==='浏览器冲突课')).toBe(false)
  expect(accepted.find(course=>course.courseName==='浏览器追加单次课')).toMatchObject({fixedDate:'2026-11-15',startTime:'00:00',endTime:'00:10'})
  expect(accepted).toHaveLength(before.courses.filter(course=>course.tableId===target.id).length+1)
  const backup=saved.tables.find(table=>!before.tables.some(old=>old.id===table.id))!
  expect(backup).toMatchObject({periodTableId:null,reminderEnabled:0,preBindSnapshotJson:''})
  expect(saved.courses.filter(course=>course.tableId===backup.id)).toHaveLength(before.courses.filter(course=>course.tableId===target.id).length)
}),60000)

it('current and legacy academic deep links restore only the guarded school directory',async()=>session(async(page)=>{
  for(const hash of ['#/管理/教务导入','#/我的/教务导入']) {
    // Load each deep link as a fresh document, rather than a hash-only navigation.
    await page.goto('about:blank')
    await page.goto(base+hash)
    await page.getByRole('searchbox').waitFor()
    const before=await database(page)
    await page.getByRole('searchbox').fill('https://jw.example.edu/login')
    await page.getByRole('option',{name:'直接用此 URL 登录',exact:true}).click()
    expect(await page.getByRole('alertdialog').textContent()).toContain('网页暂不支持教务导入，请使用安卓版导入')
    expect(await page.getByRole('link').count()).toBe(0)
    expect(await database(page)).toEqual(before)
  }
}),60000)
