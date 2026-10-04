/**
 * UpdateChangelogDialog — UpdateChangelogDialog.kt 的 web 对位。
 *
 * Android UpdateUiState 多态 (Checking/Downloading/Installing/Failed) 在 web 塌缩:
 * 无 APK 自装语义 → 只有 UpdateAvailable 弹窗; 「下载」= window.open(Releases 页)。
 * changelog 用 MarkdownBlocks 确定性排版 (标题层级/列表/粗体/代码/链接), 无第三方依赖。
 */

import { useTranslation } from 'react-i18next'
import { parse, parseInline, type Inline } from '../../domain/markdownBlocks'

export function UpdateChangelogDialog({
  version,
  changelog,
  onDismiss,
  onDownload,
}: {
  version: string
  changelog: string
  onDismiss: () => void
  /** Android onDownload(version, changelog, url) 塌缩 — url 由调用方 (AboutPage) 持有 */
  onDownload: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
          borderRadius: 28, padding: 24, gap: 16,
        }}
      >
        <div className="m3-title-large" style={{ fontWeight: 700 }}>
          {t('update_found_title', { v1: version })}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <MarkdownChangelog markdown={changelog} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onDismiss}
            className="m3-label-large"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
            }}
          >
            {t('update_cancel')}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="m3-label-large"
            style={{
              flex: 1, padding: '12px 0', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: 'var(--md-primary)', color: 'var(--md-on-primary)',
            }}
          >
            {t('update_download')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 确定性 Markdown 排版: ## 标题(层级字号) / - 列表(圆点+缩进) / 段落; 行内粗体/代码/链接。 */
function MarkdownChangelog({ markdown }: { markdown: string }) {
  return (
    <div>
      {parse(markdown).map((block, bi) => {
        if (block.kind === 'heading') {
          const size = block.level === 1 ? 22 : block.level === 2 ? 18 : 16
          return (
            <div
              key={bi}
              style={{ fontSize: size, lineHeight: 1.35, fontWeight: 700, color: 'var(--md-on-surface)', padding: '10px 0 2px' }}
            >
              <InlineSpans text={block.text} />
            </div>
          )
        }
        if (block.kind === 'bullet') {
          return (
            <div key={bi}>
              {block.items.map((item, ii) => (
                <div key={ii} style={{ display: 'flex', gap: 8, padding: '2px 0 2px 6px' }}>
                  <span style={{ color: 'var(--md-primary)' }}>•</span>
                  <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: 'var(--md-on-surface-variant)' }}>
                    <InlineSpans text={item} />
                  </span>
                </div>
              ))}
            </div>
          )
        }
        return (
          <div key={bi} style={{ fontSize: 13, lineHeight: 1.5, padding: '2px 0', color: 'var(--md-on-surface-variant)' }}>
            <InlineSpans text={block.text} />
          </div>
        )
      })}
    </div>
  )
}

function InlineSpans({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((span: Inline, i) => {
        if (span.kind === 'bold') return <b key={i}>{span.text}</b>
        if (span.kind === 'code') {
          return (
            <code key={i} style={{ fontFamily: 'monospace', background: 'var(--md-surface-container-high)', padding: '0 4px', borderRadius: 4 }}>
              {span.text}
            </code>
          )
        }
        if (span.kind === 'link') {
          return (
            <a key={i} href={span.url} target="_blank" rel="noreferrer" style={{ color: 'var(--md-primary)', textDecoration: 'underline' }}>
              {span.text}
            </a>
          )
        }
        return <span key={i}>{span.text}</span>
      })}
    </>
  )
}
