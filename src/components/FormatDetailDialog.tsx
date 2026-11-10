/**
 * FormatDetailDialog — Android ImportSheet.kt:575-772 FormatDetailDialog 1:1 移植。
 *
 * "支持格式" 每行 ⓘ 点开: 什么时候用 → 识别要求(逐条 •) → 示例(monospace 色块)。
 * 纯文本格式额外带 "AI 截图转换" 区 (primaryContainer 色块 + 可复制 Prompt)。
 * 全纯色块禁描线 (Android 2026-08-25 指令同构)。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconContentCopy } from './icons'
import {
  FORMAT_KEYS,
  decodeExampleBlock,
  decodePromptForClipboard,
  decodePromptForDisplay,
  hasAiPromptSection,
  toSpecItems,
  type ImportFormat,
} from './formatHelp'

export type { ImportFormat } from './formatHelp'

/** 复制成功后按钮文案回弹时长 (ms) */
const COPIED_RESET_MS = 2000

/** 剪贴板写入 — navigator.clipboard 在非安全上下文缺失时退回 execCommand */
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    if (!document.execCommand('copy')) throw Error('复制失败')
  } finally {
    document.body.removeChild(ta)
  }
}

export function FormatDetailDialog({
  format,
  onDismiss,
}: {
  format: ImportFormat
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const keys = FORMAT_KEYS[format]
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const specItems = toSpecItems(t(keys.spec, { returnObjects: true }) as unknown)
  const example = decodeExampleBlock(t(keys.example))
  const showAi = hasAiPromptSection(format)
  const promptRaw = showAi ? t('ai_prompt_text') : ''

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => window.clearTimeout(id)
  }, [copied])

  async function copyPrompt() {
    setCopied(false)
    setCopyError(null)
    try {
      await writeClipboard(decodePromptForClipboard(promptRaw))
      setCopied(true)
    } catch {
      setCopyError(t('copy_failed', '复制失败，请检查浏览器权限或手动选择文本。'))
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onDismiss}
    >
      <div data-glass-role="alert" data-glass-motion="static"
        role="dialog"
        aria-modal="true"
        aria-label={t(keys.title)}
        className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 20,
        }}
      >
        <h2 className="m3-title-large" style={{ margin: 0 }}>{t(keys.title)}</h2>

        <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
          {t(keys.when)}
        </p>
        {format === 'WAKEUP_SHARE' && <p className="m3-body-medium">
          {t('format_wakeup_online_hint', '也可粘贴 WakeUP 分享口令或含“分享口令”的完整文案，联网获取后预览。Sleepy 分享文本使用 sleepy-v1 标记，可离线导入。')}
        </p>}
        {copyError && <p role="alert" style={{color:'var(--md-error)'}}>{copyError}</p>}

        <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('format_help_spec')}</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {specItems.map((item, idx) => (
            <li key={`${idx}-${item}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span aria-hidden style={{ color: 'var(--md-primary)', lineHeight: '20px' }}>•</span>
              <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', flex: 1 }}>
                {item}
              </span>
            </li>
          ))}
        </ul>

        <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('format_help_example')}</div>
        <pre
          style={{
            margin: 0,
            background: 'var(--md-surface-container)',
            color: 'var(--md-on-surface)',
            borderRadius: 12,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {example}
        </pre>

        {showAi && (
          <div
            style={{
              background: 'var(--md-primary-container)',
              color: 'var(--md-on-primary-container)',
              borderRadius: 16,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('ai_prompt_title')}</div>
            <div className="m3-body-small">{t('ai_prompt_hint')}</div>
            <pre
              style={{
                margin: 0,
                maxHeight: 260,
                overflow: 'auto',
                background: 'var(--md-surface-container)',
                color: 'var(--md-on-primary-container)',
                borderRadius: 12,
                padding: 10,
                fontSize: 11,
                lineHeight: 1.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {decodePromptForDisplay(promptRaw)}
            </pre>
            <button data-glass-role="tinted" data-glass-tint="var(--md-primary-container)"
              type="button"
              onClick={() => void copyPrompt()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                padding: 12,
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: 'var(--md-primary)',
                color: 'var(--md-on-primary)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <IconContentCopy size={16} />
              {copied ? t('copied') : t('copy_prompt')}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button data-glass-role="regular"
            type="button"
            onClick={onDismiss}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--md-primary)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {t('format_help_close')}
          </button>
        </div>
      </div>
    </div>
  )
}
