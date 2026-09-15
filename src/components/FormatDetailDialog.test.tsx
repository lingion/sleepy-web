/**
 * FormatDetailDialog 渲染契约 — 验证 i18next 真的能把 @ 前缀 string-array 取出来,
 * 以及"纯文本独有 AI Prompt 区"这条 Android 分支在 web 上成立。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { FormatDetailDialog } from './FormatDetailDialog'
import { initI18n } from '../i18n'

beforeAll(() => {
  initI18n('zh-CN')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('FormatDetailDialog', () => {
  it('ICS: 标题 + 识别要求逐条渲染 + 示例已还原换行', () => {
    render(<FormatDetailDialog format="ICS" onDismiss={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'ICS 日历' })).toBeTruthy()
    expect(screen.getByText('识别要求')).toBeTruthy()
    // @format_ics_spec 第一条 (returnObjects 取数组成功才会出现独立 li)
    expect(screen.getByText(/文本必须以 BEGIN:VCALENDAR 开头/)).toBeTruthy()
    expect(screen.getByText('示例')).toBeTruthy()
    expect(screen.getByText(/BEGIN:VEVENT/).textContent).toContain('\n')
    expect(screen.queryByText('复制 Prompt')).toBeNull()
  })

  it('纯文本: 额外渲染 AI 截图转换区与复制按钮', () => {
    render(<FormatDetailDialog format="PLAIN" onDismiss={() => {}} />)

    expect(screen.getByText('让 AI 帮你转换截图（Sleepy 原生格式）')).toBeTruthy()
    expect(screen.getByText(/把下面的 Prompt 复制给豆包/)).toBeTruthy()
    expect(screen.getByText('复制 Prompt')).toBeTruthy()
    // 展示路径只还原 \n, Prompt 正文里的字面 \t 必须保持两字符
    expect(screen.getByText(/制表符写成 \\t/)).toBeTruthy()
  })

  it('复制按钮写入剪贴板并回弹"已复制"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<FormatDetailDialog format="PLAIN" onDismiss={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByText('复制 Prompt'))
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('#sleepy-v1')
    expect(copied).toContain('\n')
    // 复制路径比展示路径多还原 \t 与 XML 实体 (Android ImportSheet.kt:700-706)
    expect(copied).toContain('制表符写成 \t')
    expect(copied).toContain('&lt; { (')
    expect(copied).not.toContain('&amp;lt;')
    expect(screen.getByText('已复制')).toBeTruthy()
  })

  it('遮罩点击与"知道了"都关闭', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<FormatDetailDialog format="CSV" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('知道了'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    unmount()

    const second = vi.fn()
    render(<FormatDetailDialog format="CSV" onDismiss={second} />)
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
