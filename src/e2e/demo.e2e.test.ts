import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright-core'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

const port = 30000 + Math.floor(Math.random() * 20000)
const origin = `http://localhost:${port}`
const base = process.env.BASE_PATH || '/sleepy-web/'
let server: ChildProcess
let browser: Browser

beforeAll(async () => {
  server = spawn(join(process.cwd(), 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  const deadline = Date.now() + 15000
  while (true) {
    try { if ((await fetch(origin + base)).ok) break } catch { /* starting */ }
    if (Date.now() > deadline) throw new Error('Preview did not start')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium', headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.kill('SIGTERM')
})

describe('embedded interactive demo', () => {
  it('works in a narrow sandbox without changing host history, real data, or preferences', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 850 } })
    const page = await context.newPage()
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => requests.push(request.url()))
    await page.route('**/demo-host', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body><h1>宿主页</h1><div id="demo"></div></body></html>' }))
    await page.goto(origin + '/demo-host')
    await page.evaluate(async () => {
      localStorage.setItem('sleepy_reminder_master', 'real-preference')
      sessionStorage.setItem('sleepy-public-access', 'real-session')
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('sleepy', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('sentinel')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const tx = database.transaction('sentinel', 'readwrite')
          tx.objectStore('sentinel').put('real-course-data', 'course')
          tx.oncomplete = () => { database.close(); resolve() }
        }
      })
    })
    await page.evaluate((src) => {
      const iframe = document.createElement('iframe')
      iframe.title = 'Sleepy 课表示例'
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads')
      iframe.style.cssText = 'width:320px;height:680px;border:0'
      iframe.src = src
      document.getElementById('demo')!.appendChild(iframe)
    }, base + '?demo=1&embed=1&theme=dark')
    const frame = page.frameLocator('iframe')
    await frame.getByText('高等数学', { exact: true }).first().waitFor({ state: 'visible' })
    expect(await frame.getByLabel('访问密钥').count()).toBe(0)
    expect(await frame.getByRole('button', { name: '添加课程' }).count()).toBe(0)
    expect(await frame.locator('nav').count()).toBe(0)
    const friday = await frame.getByRole('region', { name: '第 2 周课表', exact: true }).getByText('马克思主义基本原理', { exact: true }).boundingBox()
    const iframeBox = await page.locator('iframe').boundingBox()
    expect(friday).not.toBeNull()
    expect(friday!.x + friday!.width).toBeLessThanOrEqual(iframeBox!.x + iframeBox!.width)
    const top = await frame.getByRole('button', { name: '下一周', exact: true }).boundingBox()
    const switcher = await frame.getByRole('button', { name: '网格', exact: true }).boundingBox()
    const banner = await frame.getByText('体验课表：可切换周次，点击课程查看详情。', { exact: true }).boundingBox({ timeout: 2000 })
    const timetable = await frame.getByRole('region', { name: '第 2 周课表', exact: true }).boundingBox()
    expect(top!.y).toBeLessThan(switcher!.y)
    expect(switcher!.y).toBeLessThan(banner!.y)
    expect(banner!.y).toBeLessThan(timetable!.y)
    if (process.env.SLEEPY_DEMO_SCREENSHOT) {
      await page.locator('iframe').screenshot({ path: process.env.SLEEPY_DEMO_SCREENSHOT })
    }
    const embeddedHistory = await page.evaluate(() => history.length)
    await frame.getByRole('button', { name: '第 2 周', exact: true }).waitFor({ state: 'visible' })
    await frame.getByRole('button', { name: '下一周', exact: true }).click()
    await frame.getByRole('button', { name: /第.*3.*周/ }).waitFor({ state: 'visible' })
    await frame.getByRole('region', { name: '第 3 周课表', exact: true }).getByText('高等数学', { exact: true }).click()
    const dialog = frame.getByRole('dialog', { name: '课程详情' })
    await dialog.waitFor({ state: 'visible' })
    expect(await dialog.getByText('王教授', { exact: true }).count()).toBe(1)
    expect(await dialog.getByText('教学楼A-101', { exact: true }).count()).toBe(1)
    // Dismiss through the existing scrim, above the bottom sheet.
    await frame.locator('[role="dialog"]').locator('..').click({ position: { x: 4, y: 4 } })
    await dialog.waitFor({ state: 'hidden' })
    expect(await page.evaluate(() => history.length)).toBe(embeddedHistory)
    const child = page.frames().find((item) => item.url().includes('demo=1'))!
    expect(await child.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      embed: document.documentElement.dataset.embed,
      background: getComputedStyle(document.body).backgroundColor,
      hash: location.hash,
    }))).toMatchObject({ overflow: false, embed: 'true', hash: '' })
    const dark = await child.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await child.goto(origin + base + '?demo=1&embed=1&theme=light')
    await frame.getByText('高等数学', { exact: true }).first().waitFor({ state: 'visible' })
    expect(await child.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(dark)
    expect(await child.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
    expect(requests.some((url) => url.includes('private.sleepy'))).toBe(false)
    expect(page.url()).toBe(origin + '/demo-host')
    expect(await page.evaluate(() => localStorage.getItem('sleepy_reminder_master'))).toBe('real-preference')
    expect(await page.evaluate(() => sessionStorage.getItem('sleepy-public-access'))).toBe('real-session')
    expect(await page.evaluate(async () => {
      const request = indexedDB.open('sleepy', 1)
      return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const read = database.transaction('sentinel').objectStore('sentinel').get('course')
          read.onsuccess = () => { database.close(); resolve(read.result) }
        }
      })
    })).toBe('real-course-data')
    expect(errors).toEqual([])
    await context.close()
  })

  it('opens the standalone demo with a full timetable', async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
    await page.goto(origin + base + '?demo=1')
    await page.getByText('高等数学', { exact: true }).first().waitFor({ state: 'visible' })
    expect(await page.getByRole('navigation').count()).toBe(0)
    await page.getByRole('button', { name: '下一周', exact: true }).click()
    await page.getByRole('region', { name: '第 3 周课表', exact: true }).getByText('高等数学', { exact: true }).click()
    await page.getByRole('dialog', { name: '课程详情' }).waitFor({ state: 'visible' })
    await page.close()
  })
})
