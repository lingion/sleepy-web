/**
 * FormatDetailDialog — Android ImportSheet.kt:575-772 FormatDetailDialog 1:1 移植。
 *
 * "支持格式" 每行 ⓘ 点开: 什么时候用 → 识别要求(逐条 •) → 示例(monospace 色块)。
 * 纯文本格式额外带 "AI 截图转换" 区 (primaryContainer 色块 + 可复制 Prompt)。
 * 全纯色块禁描线 (Android 2026-08-25 用户指令同构)。
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
    document.execCommand('copy')
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
    try {
      await writeClipboard(decodePromptForClipboard(promptRaw))
    } catch {
      // 剪贴板被浏览器拒绝时不弹错误 — 文本已在色块内可见, 用户可选中手抄
    }
    setCopied(true)
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
      <div
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
            <button
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
          <button
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
