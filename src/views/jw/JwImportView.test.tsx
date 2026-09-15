/**
 * JwImportView 渲染冒烟 + 全流程契约 — 选学校 → 抓取 → 确认 → 落库。
 * 抓取一律注入 mock fetcher, 测试期间零真实网络。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JwImportView } from './JwImportView'
import { initI18n } from '../../i18n'
import { getCourses, observeAllTables } from '../../data/repository'
import { useBackStack } from '../../state/backStack'
import type { ProxyFetcher } from './proxyClient'
import { SCHOOLS } from './schools'

const OK_HTML = readFileSync(
  resolve(__dirname, '../../domain/jw/__fixtures__', 'cf-chengfang-typical_two_courses.html'),
  'utf-8'
)
const LOGIN_HTML = readFileSync(
  resolve(__dirname, '../../domain/jw/__fixtures__', 'cf-chengfang-login_page_no_kbxx.html'),
  'utf-8'
)

const okFetcher: ProxyFetcher = async () => ({
  ok: true,
  status: 200,
  body: OK_HTML,
  finalUrl: 'https://jw.example.edu.cn/kb',
  charset: 'utf-8',
})

beforeAll(() => {
  initI18n('zh-CN')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useBackStack.getState().reset()
})

/** 目录里首个可点学校 (有 URL 且已适配) */
function pickable() {
  const s = SCHOOLS.find((x) => x.status === 'supported' && x.url.trim() !== '')!
  return s
}

function renderView(fetcher: ProxyFetcher = okFetcher) {
  const onBack = vi.fn()
  render(<JwImportView onBack={onBack} fetcher={fetcher} />)
  return { onBack }
}

describe('JwImportView', () => {
  it('初始落在选学校页: 标题 + 全量计数 + 搜索框', () => {
    renderView()
    expect(screen.getByText('选择学校')).toBeTruthy()
    expect(screen.getByText(`共 ${SCHOOLS.length} 所`)).toBeTruthy()
    expect(screen.getByPlaceholderText(/搜索学校/)).toBeTruthy()
    // 计数行永远是全量, 未搜索时不出现「匹配」
    expect(screen.queryByText(/匹配 \d+/)).toBeNull()
  })

  it('搜索出匹配数, 无结果时给空态', () => {
    renderView()
    const box = screen.getByPlaceholderText(/搜索学校/)
    fireEvent.change(box, { target: { value: 'hrbeu' } })
    expect(screen.getByText('匹配 1')).toBeTruthy()
    fireEvent.change(box, { target: { value: '不存在的学校xyz' } })
    expect(screen.getByText('未找到匹配的学校')).toBeTruthy()
  })

  it('输入 URL 出现「直接用此 URL 登录」行, 点击进抓取页', () => {
    renderView()
    const box = screen.getByPlaceholderText(/搜索学校/)
    fireEvent.change(box, { target: { value: 'jw.hrbeu.edu.cn/kb' } })
    expect(screen.getByText('直接用此 URL 登录')).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: '直接用此 URL 登录' }))
    expect(screen.getByText('打开教务系统')).toBeTruthy()
  })

  it('点学校行进抓取页, 顶部显示校名', () => {
    renderView()
    const s = pickable()
    fireEvent.click(screen.getByRole('option', { name: s.name }))
    expect(screen.getByText(`教务导入 - ${s.name}`)).toBeTruthy()
    expect(screen.getByText('直接抓取教务页面')).toBeTruthy()
  })

  it('抓取页点「直接抓取教务页面」→ 解析成功进确认页并列出课程', async () => {
    renderView()
    const s = pickable()
    fireEvent.click(screen.getByRole('option', { name: s.name }))
    fireEvent.click(screen.getByRole('button', { name: /直接抓取教务页面/ }))

    await waitFor(() => expect(screen.getByText('导入前确认')).toBeTruthy())
    expect(screen.getByText('课表预览')).toBeTruthy()
    expect(screen.getByText('高等数学')).toBeTruthy()
    expect(screen.getByText('大学英语')).toBeTruthy()
    expect(screen.getByText('已选 2 / 2 门')).toBeTruthy()
  })

  it('抓到登录页 → 会话过期错误浮层, 点「知道了」原地关闭', async () => {
    const loginFetcher: ProxyFetcher = async () => ({
      ok: true, status: 200, body: LOGIN_HTML, finalUrl: 'https://jw.example.edu.cn/login', charset: 'utf-8',
    })
    renderView(loginFetcher)
    fireEvent.click(screen.getByRole('option', { name: pickable().name }))
    fireEvent.click(screen.getByRole('button', { name: /直接抓取教务页面/ }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('登录')
    fireEvent.click(screen.getByRole('button', { name: '知道了' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // 关浮层后仍停在抓取页, 可再试
    expect(screen.getByText('直接抓取教务页面')).toBeTruthy()
  })

  it('抓取失败 (网络) → 抓取失败浮层', async () => {
    const badFetcher: ProxyFetcher = async () => ({
      ok: false, kind: 'network', status: 0, detail: 'Failed to fetch', finalUrl: 'https://x/',
    })
    renderView(badFetcher)
    fireEvent.click(screen.getByRole('option', { name: pickable().name }))
    fireEvent.click(screen.getByRole('button', { name: /直接抓取教务页面/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('抓取失败')
  })

  it('粘贴 HTML 也能解析进确认页', () => {
    renderView()
    fireEvent.click(screen.getByRole('option', { name: pickable().name }))
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴课表网页源码' }), {
      target: { value: OK_HTML },
    })
    fireEvent.click(screen.getByRole('button', { name: '解析此 HTML' }))
    expect(screen.getByText('课表预览')).toBeTruthy()
  })

  it('未填节次时间就确认 → 内联报错, 补齐后落库成功并写进仓储', async () => {
    const { onBack } = renderView()
    fireEvent.click(screen.getByRole('option', { name: pickable().name }))
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴课表网页源码' }), {
      target: { value: OK_HTML },
    })
    fireEvent.click(screen.getByRole('button', { name: '解析此 HTML' }))

    // 样本最大节次 = 4, 时间全空 → 第 1 节时间不能为空
    fireEvent.click(screen.getByRole('button', { name: /确认导入/ }))
    expect(screen.getByText('第 1 节时间不能为空')).toBeTruthy()

    for (const node of [1, 2, 3, 4]) {
      fireEvent.change(screen.getByLabelText(`第${node}节 开始`), { target: { value: '08:00' } })
      fireEvent.change(screen.getByLabelText(`第${node}节 结束`), { target: { value: '08:45' } })
    }
    fireEvent.click(screen.getByRole('button', { name: /确认导入/ }))

    await screen.findAllByText('成功导入 2 门课程')
    const tables = await observeAllTables()
    expect(tables).toHaveLength(1)
    expect(tables[0].isDefault).toBe(1)
    const courses = await getCourses(tables[0].id)
    expect(courses.map((c) => c.courseName).sort()).toEqual(['大学英语', '高等数学'])
    // 同名课程归同一组
    expect(new Set(courses.map((c) => c.groupId)).size).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    await act(async () => {})
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('全不选后确认 → 提示至少选一门', () => {
    renderView()
    fireEvent.click(screen.getByRole('option', { name: pickable().name }))
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴课表网页源码' }), {
      target: { value: OK_HTML },
    })
    fireEvent.click(screen.getByRole('button', { name: '解析此 HTML' }))
    fireEvent.click(screen.getByRole('button', { name: '全不选' }))
    fireEvent.click(screen.getByRole('button', { name: /确认导入/ }))
    expect(screen.getByText('请至少选择一门课程')).toBeTruthy()
  })

  it('确认页「返回」退回抓取页, 抓取页「返回」退回选学校', () => {
    const { onBack } = renderView()
    const s = pickable()
    fireEvent.click(screen.getByRole('option', { name: s.name }))
    fireEvent.change(screen.getByRole('textbox', { name: '粘贴课表网页源码' }), {
      target: { value: OK_HTML },
    })
    fireEvent.click(screen.getByRole('button', { name: '解析此 HTML' }))
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.getByText('直接抓取教务页面')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `教务导入 - ${s.name}` }))
    expect(screen.getByText('选择学校')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '选择学校' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
