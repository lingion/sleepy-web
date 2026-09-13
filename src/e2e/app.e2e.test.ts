/**
 * E2E 冒烟 — Playwright + vite preview (W7)
 * 全链路: 首屏空态 → 建表 → 导入 WakeUp 分享 → 课表渲染 → 详情弹层。
 * 测试内自起 preview server (端口 4173), 结束即停 — 不留 dev server 长驻
 * (memory: no-runtime-verification-static-only 的例外通道 = 测试进程内短生命周期)。
 */

import { describe, it, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright-core'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 随机端口 — 防残留进程占位 / 并行运行撞 strictPort
const PORT = 30000 + Math.floor(Math.random() * 20000)
const BASE = `http://localhost:${PORT}/sleepy-web/`

let server: ChildProcess | null = null
let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null
let userDataDir: string | null = null

// WakeUp 分享文本 fixture (两门课)
const WAKEUP_SHARE = (() => {
  const courses = [
    { name: '高等数学', teacher: '张三', position: 'A101', day: 1, startNode: 1, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '' },
    { name: '大学英语', teacher: '李四', position: 'B202', day: 3, startNode: 3, step: 2, startWeek: 1, endWeek: 16, type: 0, color: '' },
  ]
  const detail = encodeURIComponent(JSON.stringify(courses))
  return `【来自WakeUp课程表】\n课程分享:\n{"name":"E2E课表","startDate":"2026-09-07","courseDetailJson":"${detail}"}`
})()

beforeAll(async () => {
  // 起 preview (dist 已由 vite build 产出)
  // 直接 spawn node_modules/.bin/vite (绕开 npx 包装进程), 非 detached —
  // 上会话 detached + kill(-pid) 杀不穿 npm exec 包装层 → 残留 preview 进程泄漏
  server = spawn(join(process.cwd(), 'node_modules', '.bin', 'vite'), ['preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  })
  // 轮询等就绪
  const deadline = Date.now() + 15000
  let ready = false
  while (Date.now() < deadline && !ready) {
    try {
      const res = await fetch(BASE.replace(/\/$/, '') + '/')
      if (res.ok) ready = true
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  if (!ready) throw new Error('preview server 15s 未就绪')

  // 系统 Chromium (免下载浏览器二进制) — persistent context (Playwright userDataDir 契约)
  const executablePath = '/Applications/Chromium.app/Contents/MacOS/Chromium'
  userDataDir = mkdtempSync(join(tmpdir(), 'sleepy-e2e-'))
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: true,
    args: ['--no-first-run'],
  })
}, 30000)

afterAll(async () => {
  if (context) await context.close()
  if (server && server.pid) {
    try {
      server.kill('SIGTERM')
    } catch {
      /* already dead */
    }
  }
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
})

describe('Sleepy Web E2E — 全链路冒烟', () => {
  it('首访空态 → 建表 → 加课渲染', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    page.on('pageerror', (err) => {
      throw new Error(`页面 JS 错误: ${err.message}`)
    })

    await page.goto(BASE, { waitUntil: 'networkidle' })

    // 1. 首访: 空态 (不 seed 示例 — Android 对齐: 没有课表就老实空着)
    await page.getByText('还没有课表').first().waitFor({ state: 'visible', timeout: 8000 })

    // 2. 空态建表 → EditTableView 打开
    await page.getByRole('button', { name: '创建第一张课表' }).first().click()
    await page.getByText('编辑课表').first().waitFor({ state: 'visible', timeout: 8000 })

    // 3. 返回按钮退出编辑页 (返回栈: 按钮 pop 出栈 → 回有表无课态, 新建的空表留在库)
    await page.locator('button[aria-label="back"]').first().click()
    await page.getByText('还是空的').first().waitFor({ state: 'visible', timeout: 8000 })
  }, 60000)

  it('导入 WakeUp 分享 → 新课表渲染', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle' })

    // 导入入口: nav「课表管理」tab → 「导入课表」按钮
    await page.locator('nav').getByRole('button', { name: '课表管理' }).click()
    await page.getByRole('button', { name: '导入课表' }).click()
    await page.getByLabel('粘贴课表文本').fill(WAKEUP_SHARE)
    await page.getByRole('button', { name: '预览导入' }).click()

    await page.getByText('导入预览').waitFor({ state: 'visible', timeout: 8000 })
    await page.getByRole('button', { name: '导入为新课表' }).first().click()

    await page.getByText('导入前确认').waitFor({ state: 'visible', timeout: 8000 })
    const dateInput = page.locator('input[type="date"]')
    await dateInput.fill('2026-09-07')
    await page.getByRole('button', { name: '确认导入' }).click()

    // 导入完成回管理页 → 新表「E2E课表」在列表中
    await page.getByText('E2E课表').first().waitFor({ state: 'visible', timeout: 8000 })

    // 切回课表 tab 看渲染 (当前默认表 = 示例课表, 导入不切默认)
    await page.locator('nav').getByRole('button', { name: '课表', exact: true }).click()
    await page.getByText('张三').first().waitFor({ state: 'visible', timeout: 8000 })
  }, 60000)

  it('导出页可开 (悬浮导航 → Mine → 导出课表)', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle' })

    // 悬浮胶囊导航 → 我的 (aria-label 恒在, 未选中项只显示图标)
    await page.locator('nav').getByRole('button', { name: '我的' }).click()
    await page.getByText('导出课表').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('导出课表').first().click()
    await page.getByText('WakeUp 兼容 JSON').waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('分享文本').waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('ICS 日历').waitFor({ state: 'visible', timeout: 8000 })
  }, 30000)

  it('主页触摸滑动切换周次 (HorizontalPager 同构, CDP 真触摸)', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    page.on('pageerror', (err) => {
      throw new Error(`页面 JS 错误: ${err.message}`)
    })
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' })
      await page.getByText('高等数学').first().waitFor({ state: 'visible', timeout: 8000 })

      const weekLabel = () =>
        page.evaluate(() => document.querySelector('span[role="button"][aria-label*="周"]')?.textContent)
      const before = await weekLabel()

      // 左滑 = 下一周 (HorizontalPager currentPage+1 同向)。
      // CDP Input.dispatchTouchEvent: touchEnd 必须带 touchPoints (终点坐标), 空=
      // dx=0 判定不翻页 — dispatchEvent TouchEvent 合成走不通 (React 委托丢失), CDP 真事件链路通
      const cdp = await context.newCDPSession(page)
      const dims = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
      const cy = Math.floor(dims.h / 2)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 350, y: cy }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 100, y: cy + 2 }] })
      await page.waitForTimeout(600)

      const after = await weekLabel()
      if (before === after) throw new Error(`滑动切换未生效: before=${before} after=${after}`)
    } finally {
      await page.close()
    }
  }, 60000)

  it('主页跟手翻页动画 (HorizontalPager 页面实时平移同构, CDP 真触摸)', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    page.on('pageerror', (err) => {
      throw new Error(`页面 JS 错误: ${err.message}`)
    })
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' })
      await page.getByText('高等数学').first().waitFor({ state: 'visible', timeout: 8000 })

      const cdp = await context.newCDPSession(page)
      const cy = 400
      const readTransform = () =>
        page.evaluate(
          () => (document.querySelector('div[style*="translateX"]') as HTMLElement | null)?.style.transform ?? null
        )

      // 跟手: touchMove 中途 transform 必须实时反映位移 (页面平移层)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 350, y: cy }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: cy }] })
      await page.waitForTimeout(150)
      const mid = await readTransform()
      if (mid !== 'translateX(-70px)') throw new Error(`跟手位移未生效: ${mid}`)

      // 松手翻页: 阈值内位移 → 周次变化
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: cy }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 150, y: cy + 2 }] })
      await page.waitForTimeout(600)
      const after = await page.evaluate(() =>
        document.querySelector('span[role="button"][aria-label*="周"]')?.textContent
      )
      if (!after || !after.includes('2')) throw new Error(`翻页未生效: ${after}`)

      // 回弹: 轻扫不足阈值 → 回原页 (周次不变)
      const beforeBounce = await page.evaluate(() =>
        document.querySelector('span[role="button"][aria-label*="周"]')?.textContent
      )
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: cy }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 270, y: cy }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 265, y: cy + 2 }] })
      await page.waitForTimeout(600)
      const afterBounce = await page.evaluate(() =>
        document.querySelector('span[role="button"][aria-label*="周"]')?.textContent
      )
      if (beforeBounce !== afterBounce) throw new Error(`回弹失败: ${beforeBounce} → ${afterBounce}`)
    } finally {
      await page.close()
    }
  }, 60000)
})
