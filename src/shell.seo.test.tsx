/**
 * 壳层 SEO 契约 — 2026-10-28 Bing 站长扫描两条直报的回归锁。
 *
 * ①meta description:index.html head 必须携带非空 description。
 *   Worker 直接服务 dist 快照(vite build 拷贝 index.html → dist/index.html),
 *   爬虫首包只读这份静态 head,运行时 JS 注入的 meta 对 Bing 不可见,故产物级断言。
 * ②唯一 H1:Bing 扫描(SEO005_H1Exists)只读 HTML 源码,运行期 React 注入的 h1
 *   爬虫不可见 —— 2026-10-28 首轮修复把 h1 放 App 内(运行期),Bing 次日复报
 *   「missing H1」(/preview 双 URL)。定案:H1 由 index.html 壳层静态携带,置于
 *   #root 之外(ReactDOM.createRoot 挂载清空 #root 子节点,放里面会被抹掉),
 *   文案「Sleepy 课程表」= 页面主题关键词、远小于 150 字符上限(Bing 建议)。
 *   App 主屏不再自带 h1;gate/错误屏标题降 h2 → 文档任意状态恒为单 H1。
 *
 * 红绿验证:description 行删掉 → 用例①红;index.html 静态 h1 删掉 → 用例②红;
 *   App 的 h1 留着不动 → 用例③红(双 H1)。
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

  it('index.html 壳层源码静态携带恰好一个 h1(Bing 只读源码,运行期注入不可见)', () => {
    const html = readAt('index.html')
    const body = html.slice(html.indexOf('<body'))
    const h1s = body.match(/<h1[\s>]/g) ?? []
    expect(h1s).toHaveLength(1)
    // 必须在 #root 之外:ReactDOM.createRoot(...).render() 挂载即清空 #root 子节点。
    const h1At = body.indexOf('<h1')
    const rootDivAt = body.indexOf('<div id="root">')
    expect(h1At).toBeLessThan(rootDivAt)
    // Bing 建议:关键词反映页面主题,≤ 约 150 字符。
    const text = /<h1[^>]*>([^<]+)<\/h1>/.exec(body)?.[1] ?? ''
    expect(text).toContain('Sleepy')
    expect(text.length).toBeLessThanOrEqual(150)
  })

  it('dist 产物 index.html 同样静态携带该 h1(爬虫实际读到的就是这份)', () => {
    const html = readAt('dist/index.html')
    expect(html.slice(html.indexOf('<body')).match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('React 源码不再自带 h1(H1 唯一持有者 = 壳层)', () => {
    for (const file of ['src/App.tsx', 'src/main.tsx']) {
      expect(readAt(file), `${file} 不应再渲染 h1`).not.toMatch(/<h1[\s>]/)
    }
  })

  it('壳层挂载后文档恰好一个 h1(静态 H1 存活 + App 不自加)', () => {
    const root = document.createElement('div')
    root.id = 'root'
    const shellH1 = document.createElement('h1')
    shellH1.textContent = 'Sleepy 课程表'
    document.body.append(shellH1, root)
    try {
      render(<App />, { container: root })
      expect(document.body.querySelectorAll('h1')).toHaveLength(1)
    } finally {
      root.remove()
      shellH1.remove()
    }
  })

  it('App 主屏渲染不带 h1(标题归壳层,避免双 H1)', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('h1')).toHaveLength(0)
  })
})
