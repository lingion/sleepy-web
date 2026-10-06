/**
 * AboutPage — AboutScreen.kt 1:1 卡序与交互契约。
 * 锁定: 卡片顺序 / 版本号来自 package.json / 反馈 IconButton 走 issues/new 模板 / 检查失败进弹窗 Failed 态。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { usePrefsStore } from '../../state/prefsStore'
import { resetUpdateCheckerForTest } from '../../domain/update/updateChecker'
import { versionCodeOf } from '../../domain/feedback'
import { AboutPage } from './AboutPage'
import { initI18n } from '../../i18n'
import pkg from '../../../package.json'

beforeAll(() => {
  initI18n('zh-CN')
  ;(window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = () => ({ matches: false })
})

beforeEach(async () => {
  localStorage.clear()
  resetUpdateCheckerForTest()
  await usePrefsStore.getState().load()
  await usePrefsStore.getState().update({ updateCheckEnabled: false })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AboutPage', () => {
  it('卡片按 Android 顺序排列, web 独有下载卡在末尾', () => {
    const { container } = render(<AboutPage onBack={() => {}} />)
    const titles = ['版本信息', '获取更新', '作者', '开源地址', '反馈与建议', 'QQ 交流群', '开源声明', '自动检查更新', '下载 Android 安装包']
    const text = container.textContent ?? ''
    const positions = titles.map((title) => text.indexOf(title))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('版本号与构建号来自 package.json', () => {
    render(<AboutPage onBack={() => {}} />)
    expect(screen.getByText(`v${pkg.version}`)).toBeTruthy()
    expect(screen.getByText(`版本 ${pkg.version}（构建 ${versionCodeOf(pkg.version)}）`)).toBeTruthy()
  })

  it('GitHub 反馈打开 issues/new + bug_report 模板', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<AboutPage onBack={() => {}} />)
    fireEvent.click(screen.getByLabelText('GitHub Issue'))
    const url = String(open.mock.calls[0][0])
    expect(url.startsWith('https://github.com/lingion/sleepy/issues/new?template=bug_report.yml&title=')).toBe(true)
  })

  it('检查更新失败 → 弹窗 Failed 态 (错误文案 + 重试)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    render(<AboutPage onBack={() => {}} />)
    fireEvent.click(screen.getAllByText('获取更新').find((el) => el.closest('button')) as HTMLElement)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByText('下载失败：HTTP 503')).toBeTruthy()
    expect(screen.getByText('重试')).toBeTruthy()
  })
})
