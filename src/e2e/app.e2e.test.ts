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
  it('首访示例课表渲染 → 关提示条 → 课程详情', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    page.on('pageerror', (err) => {
      throw new Error(`页面 JS 错误: ${err.message}`)
    })

    await page.goto(BASE, { waitUntil: 'networkidle' })

    // 1. 首访: seed 示例课表 → 表名 + 示例 banner + 课程网格直接渲染
    await page.getByText('示例课表').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('高等数学').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('数据结构').first().waitFor({ state: 'visible', timeout: 8000 })

    // 2. 示例提示条可见 → 关闭
    await page.getByText('这是一张示例课表').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.getByRole('button', { name: '我知道了' }).click()

    // 3. 点课程 → 详情弹层
    await page.getByText('高等数学').first().click()
    await page.getByText('课程详情').or(page.getByText('王教授')).waitFor({ state: 'visible', timeout: 8000 })
    await page.keyboard.press('Escape')
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
})
