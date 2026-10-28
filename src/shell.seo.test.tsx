/**
 * 壳层 SEO 契约 — 2026-10-28 Bing 站长扫描两条直报的回归锁。
 *
 * ①meta description:index.html head 必须携带非空 description。
 *   Worker 直接服务 dist 快照(vite build 拷贝 index.html → dist/index.html),
 *   爬虫首包只读这份静态 head,运行时 JS 注入的 meta 对 Bing 不可见,故产物级断言。
 * ②唯一 H1:App 主屏渲染恰好一个 <h1>(可及性树标题 + 爬虫语义锚点)。
 *   Android MainActivity 顶栏标题的 web 对应物;此前全站只有 div.m3-title-large,
 *   无任何 h1 → Bing 报「missing H1」。
 *
 * 红绿验证:description 行删掉 → 用例①红;App 的 h1 换回 div → 用例②红。
 * ①消费 dist/index.html —— 先跑 npm run build(同 site 仓产物级验收约定)。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { App } from './App'
import { initI18n } from './i18n'

// jsdom 环境里 import.meta.url 非 file scheme,产物读取按项目根 cwd 相对路径
// (vitest 从仓库根运行,同 package.json scripts 的调用约定)。
const readAt = (p: string) => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    throw new Error(`${p} 不存在——先跑 npm run build 再跑本测试`)
  }
}

beforeAll(() => {
  initI18n('zh-CN')
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试替身
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

afterEach(() => cleanup())

describe('壳层 SEO(Bing 扫描回归)', () => {
  it('dist/index.html head 携带非空 meta description', () => {
    const html = readAt('dist/index.html')
    const match = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)
    expect(match, 'dist/index.html 缺 meta description —— 先跑 npm run build').not.toBeNull()
    expect(match![1]!.trim().length).toBeGreaterThan(20)
  })

  it('index.html 源文件与产物同步(源码 head 也必须有 description)', () => {
    const html = readAt('index.html')
    expect(/<meta\s+name="description"\s+content="[^"]+"/.test(html)).toBe(true)
  })

  it('App 主屏渲染恰好一个 h1', () => {
    const { container } = render(<App />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]!.textContent).toContain('Sleepy')
  })
})
