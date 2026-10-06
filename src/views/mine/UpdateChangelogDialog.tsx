/**
 * UpdateChangelogDialog — UpdateChangelogDialog.kt 的 web 对位。
 *
 * Android UpdateUiState 中会弹窗的分支: UpdateAvailable / Failed / Downloading / Installing。
 * web 无 APK 自装 → 只保留 UpdateAvailable (下载 = 打开 Releases 页) 与 Failed (检查失败, 重试 = 重新检查)。
 * changelog 用 MarkdownBlocks 确定性排版, 正文/标题 onSurfaceVariant, 圆点/链接 primary。
 */

import { useTranslation } from 'react-i18next'
import { parse, parseInline, type Inline } from '../../domain/markdownBlocks'

export type UpdateDialogState =
  | { kind: 'available'; version: string; changelog: string; url: string }
  | { kind: 'failed'; message: string; version: string; changelog: string; url: string }

export function UpdateChangelogDialog({
  state,
  onDismiss,
  onDownload,
  onRetry,
}: {
  state: UpdateDialogState
  onDismiss: () => void
  onDownload: (url: string) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const failed = state.kind === 'failed'
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
          borderRadius: 28, padding: 24, gap: 16, boxSizing: 'border-box',
        }}
      >
        <div className="m3-title-large" style={{ fontWeight: 700, color: 'var(--md-on-surface)' }}>
          {t('update_found_title', { v1: state.version })}
        </div>
        <div style={{ overflowY: 'auto', flex: 1, color: 'var(--md-on-surface-variant)' }}>
          {state.kind === 'failed' && (
            <div className="m3-body-medium" style={{ color: 'var(--md-error)', marginBottom: 8 }}>
              {t('update_download_failed', { v1: state.message })}
            </div>
          )}
          {state.changelog.trim() !== '' && <MarkdownChangelog markdown={state.changelog} />}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <DialogButton label={t('update_cancel')} onClick={onDismiss} secondary />
          <DialogButton
            label={failed ? t('update_retry') : t('update_download')}
            onClick={failed ? onRetry : () => onDownload(state.url)}
          />
        </div>
      </div>
    </div>
  )
}

/** M3 Button (min 40, 24/8 内边距) + SleepyTheme.Buttons.shape 16; 次级动作 secondaryContainer 色块 */
function DialogButton({ label, onClick, secondary = false }: { label: string; onClick: () => void; secondary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="m3-label-large"
      style={{
        flex: 1, minWidth: 0, minHeight: 40, padding: '8px 24px', borderRadius: 16, border: 'none', cursor: 'pointer',
        background: secondary ? 'var(--md-secondary-container)' : 'var(--md-primary)',
        color: secondary ? 'var(--md-on-secondary-container)' : 'var(--md-on-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  )
}

/** 块级: # titleLarge / ## titleMedium / ### titleSmall (Bold); - 列表 (圆点+缩进); 段落 bodySmall。 */
function MarkdownChangelog({ markdown }: { markdown: string }) {
  return (
    <div>
      {parse(markdown).map((block, bi) => {
        if (block.kind === 'heading') {
          const cls = block.level === 1 ? 'm3-title-large' : block.level === 2 ? 'm3-title-medium' : 'm3-title-small'
          return (
            <div key={bi} className={cls} style={{ fontWeight: 700, color: 'var(--md-on-surface-variant)', padding: '10px 0 2px' }}>
              {block.text}
            </div>
          )
        }
        if (block.kind === 'bullet') {
          return (
            <div key={bi}>
              {block.items.map((item, ii) => (
                <div key={ii} className="m3-body-small" style={{ display: 'flex', gap: 8, padding: '2px 0 2px 6px' }}>
                  <span style={{ color: 'var(--md-primary)' }}>•</span>
                  <span style={{ flex: 1, color: 'var(--md-on-surface-variant)' }}>
                    <InlineSpans text={item} />
                  </span>
                </div>
              ))}
            </div>
          )
        }
        return (
          <div key={bi} className="m3-body-small" style={{ padding: '2px 0', color: 'var(--md-on-surface-variant)' }}>
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
        if (span.kind === 'code') return <code key={i} style={{ fontFamily: 'monospace' }}>{span.text}</code>
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
