/**
 * E2E 冒烟 — Playwright + vite preview (W7)
 * 全链路: 首屏空态 → 建表 → 导入 WakeUp 分享 → 课表渲染 → 详情弹层。
 * 测试内自起 preview server (端口 4173), 结束即停 — 不留 dev server 长驻
 * (memory: no-runtime-verification-static-only 的例外通道 = 测试进程内短生命周期)。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Page } from 'playwright-core'
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
    // 手机视口 — 这是手机 App 的 Web 移植; 翻页阈值是"半页宽", 桌面宽度下
    // 半页 = 640px, 真实滑动手势永远达不到, 测的就不是同一条规则
    viewport: { width: 390, height: 844 },
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

    // 1. 首访: 空库自动 seed 示例课表 (web 独有 — Android 无示例表, 差异已上报待裁决)
    await page.getByText('这是一张示例课表').first().waitFor({ state: 'visible', timeout: 8000 })

    // 2. 管理 → 编辑课表 (三级页): 底栏两种形态都必须消失
    await page.getByRole('button', { name: '课表管理' }).first().click()
    await page.getByText('编辑当前课表').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.getByText('编辑当前课表').first().click()
    await page.getByText('课表名称').first().waitFor({ state: 'visible', timeout: 8000 })
    await expect.poll(() => page.locator('nav').count()).toBe(0)

    // 3. 删掉示例表 → 栈清空, 底栏回来
    await page.getByRole('button', { name: /删除课表/ }).first().click()
    await page.getByRole('button', { name: '删除', exact: true }).first().click()
    await expect.poll(() => page.locator('nav').count()).toBe(1)

    // 4. 回课表 tab = 真空态; 空态建表 → 编辑页; 返回 = 丢弃待保存的新表
    //    (Android pendingNewTableId 同构: 没保存就整张丢掉, 库里不留垃圾表)
    await page.getByRole('button', { name: '课表', exact: true }).first().click()
    await page.getByText('还没有课表').first().waitFor({ state: 'visible', timeout: 8000 })
    await page.getByRole('button', { name: '创建第一张课表' }).first().click()
    await page.getByText('课表名称').first().waitFor({ state: 'visible', timeout: 8000 })
    await expect.poll(() => page.locator('nav').count()).toBe(0)
    await page.locator('button[aria-label="back"]').first().click()
    await page.getByText('还没有课表').first().waitFor({ state: 'visible', timeout: 8000 })
    await expect.poll(() => page.locator('nav').count()).toBe(1)
  }, 60000)

  it('导入 WakeUp 分享 → 新课表渲染', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle' })

    // 导入入口: nav「课表管理」tab → 「导入课表」按钮
    await page.locator('nav').getByRole('button', { name: '课表管理' }).click()
    await page.getByRole('button', { name: '导入课表' }).click()
    // overlay 不变量 (MainActivity:301-397 每个 overlay 分支都在底栏之前 return):
    // 二级页在栈上时底栏两种形态都不渲染
    await expect.poll(() => page.locator('nav').count()).toBe(0)
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

    // 栈已清空 → 底栏回来 (此前重复入栈会让它永久卡住)
    await expect.poll(() => page.locator('nav').count()).toBe(1)

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

  // 周次标签 = TopBar 那个可点 span; 数字随学期变化, 一律相对判定, 不硬编码周次
  const weekNum = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector('span[role="button"][aria-label*="周"]')
      const m = el ? /\d+/.exec(el.textContent ?? '') : null
      return m ? Number(m[0]) : Number.NaN
    })

  it('主页触摸滑动切换周次 (HorizontalPager 同构, CDP 真触摸)', async () => {
    if (!context) throw new Error('browser 未初始化')
    const page = await context.newPage()
    page.on('pageerror', (err) => {
      throw new Error(`页面 JS 错误: ${err.message}`)
    })
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' })
      await page.getByText('高等数学').first().waitFor({ state: 'visible', timeout: 8000 })

      // 左滑 = 下一周 (HorizontalPager currentPage+1 同向)。位移必须过半页宽 (390/2=195),
      // 这是 Android 默认 positionalThreshold 的同构规则, 不是随手定的像素
      const cdp = await context.newCDPSession(page)
      const dims = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
      const cy = Math.floor(dims.h / 2)
      const before = await weekNum(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: dims.w - 40, y: cy }] })
      for (let x = dims.w - 80; x >= 40; x -= 60) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: cy }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 40, y: cy + 2 }] })
      await page.waitForTimeout(700)

      const after = await weekNum(page)
      if (!(after === before + 1)) throw new Error(`左滑应进下一周: ${before} → ${after}`)
    } finally {
      await page.close()
    }
  }, 60000)

  it('主页跟手翻页动画 (整条轨道实时平移 + 半页阈值 + 不足回弹)', async () => {
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
          () => (document.querySelector('div[style*="translate3d"]') as HTMLElement | null)?.style.transform ?? null
        )
      // 慢速拖拽: 每步间隔 → 速度低于 fling 阈值, 判定只走"半页"这一条规则
      const slowMove = async (x: number) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: cy }] })
        await page.waitForTimeout(120)
      }
      // 形如 translate3d(calc(-33.3333% - 70px), 0px, 0px) — 取 px 分量判跟手位移
      const offsetPx = async () => {
        const t = await readTransform()
        const m = t ? /(-?\s*[\d.]+)\s*px\s*\)/.exec(t) : null
        if (!m) throw new Error(`读不到轨道位移: ${t}`)
        return Number.parseFloat(m[1].replace(/\s+/g, ''))
      }

      // 轨道 = [上周|本周|下周] 三页并排 (相邻两周连在一起跟着一起动, 不是只平移当前页)
      const slots = await page.evaluate(
        () => document.querySelector('div[style*="translate3d"]')?.children.length ?? 0
      )
      if (slots !== 3) throw new Error(`周次轨道应为 3 页并排, 实际 ${slots}`)

      // 1) 跟手: touchMove 中途 transform 实时反映位移
      const start = 200
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y: cy }] })
      await slowMove(start + 40)
      await slowMove(start + 80)
      const mid = await offsetPx()
      if (Math.abs(mid - 80) > 1) throw new Error(`跟手位移未生效: 期望 80px, 实际 ${mid}`)

      // 2) 未过半页 (390/2=195) 松手 → 回弹, 周次不变
      const beforeBounce = await weekNum(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: start + 80, y: cy + 2 }] })
      await page.waitForTimeout(600)
      if ((await offsetPx()) !== 0) throw new Error('回弹后轨道未归零')
      const afterBounce = await weekNum(page)
      if (beforeBounce !== afterBounce) throw new Error(`不足阈值不该翻页: ${beforeBounce} → ${afterBounce}`)

      // 3) 右滑过半页 → 上一周
      const beforePrev = await weekNum(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: cy }] })
      for (let x = 120; x <= 350; x += 60) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: cy }] })
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 350, y: cy + 2 }] })
      await page.waitForTimeout(700)
      const afterPrev = await weekNum(page)
      if (afterPrev !== beforePrev - 1) throw new Error(`右滑应回上一周: ${beforePrev} → ${afterPrev}`)
    } finally {
      await page.close()
    }
  }, 60000)
})
