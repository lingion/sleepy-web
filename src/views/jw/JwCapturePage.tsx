/**
 * JwCapturePage — ui/screen/imports/JwWebViewLoginScreen.kt 的 web 等价实现。
 *
 * Android 在应用内 WebView 里登录, 然后从 DOM 抓 HTML; 浏览器做不到:
 * 教务站普遍带 X-Frame-Options/CSP, 且 CORS 代理明确剥离 Cookie 头 → 会话无法穿越。
 * 所以本页提供两条等价通道, 产物都是「一段课表 HTML」交给上层解析:
 *   A. 直接抓取教务页面 (走 Worker 代理, 公开页/已带 SSO 的场景可直接命中)
 *   B. 粘贴课表网页源码 (用户在自己浏览器登录后保存/复制整页源码)
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconContentCopy, IconDescription, IconLink, IconRefresh } from '../../components/icons'
import { HDiv } from '../mine/shared'
import { displayHost, protocolDisplayName } from './protocol'
import type { FetchOutcome, ProxyFetcher } from './proxyClient'
import type { SchoolInfo } from './schools'

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  width: '100%',
  padding: '10px 14px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
}

export function JwCapturePage({
  school,
  fetcher,
  onHtml,
  onFetchError,
}: {
  school: SchoolInfo
  /** 注入的抓取实现 (测试里 mock, 绝不真连教务站) */
  fetcher: ProxyFetcher
  /** 拿到 HTML → 上层跑 resolveCapture */
  onHtml: (html: string) => void
  /** 抓取失败 → 上层映射成错误文案 */
  onFetchError: (outcome: Extract<FetchOutcome, { ok: false }>) => void
}) {
  const { t } = useTranslation()
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)

  async function fetchNow() {
    setBusy(true)
    try {
      const outcome = await fetcher(school.url)
      if (outcome.ok) onHtml(outcome.body)
      else onFetchError(outcome)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 学校 + 协议 */}
      <div className="m3-card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <IconLink size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="m3-title-small" style={{ fontWeight: 600 }}>{school.name}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {protocolDisplayName(school.type)} · {displayHost(school.url)}
          </div>
        </div>
      </div>

      <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('jw_capture_intro')}
      </div>

      {/* 步骤 1 — 自己登录 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="m3-label-medium">{t('jw_capture_step1')}</div>
        <button
          type="button"
          className="m3-btn-regular"
          style={btnStyle}
          onClick={() => window.open(school.url, '_blank', 'noopener,noreferrer')}
        >
          <IconLink size={16} />
          {t('jw_capture_open_site')}
        </button>
      </div>

      <HDiv />

      {/* 步骤 2 — 抓取 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="m3-label-medium">{t('jw_capture_step2')}</div>
        <button
          type="button"
          className="m3-btn-cta"
          style={btnStyle}
          disabled={busy}
          onClick={() => void fetchNow()}
        >
          <IconRefresh size={16} />
          {busy ? t('jw_fetching') : t('jw_capture_fetch')}
        </button>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('jw_capture_fetch_note')}
        </div>
      </div>

      <HDiv />

      {/* 兜底 — 粘贴源码 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="m3-label-medium">{t('jw_capture_paste')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('jw_capture_paste_hint')}
        </div>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={t('jw_capture_paste_placeholder')}
          aria-label={t('jw_capture_paste')}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 120,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--md-outline)',
            background: 'var(--md-surface)',
            color: 'var(--md-on-surface)',
            font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
            resize: 'vertical',
          }}
        />
        <button
          type="button"
          className="m3-btn-cta"
          style={btnStyle}
          disabled={pasted.trim() === ''}
          onClick={() => onHtml(pasted)}
        >
          <IconDescription size={16} />
          {t('jw_capture_parse')}
        </button>
      </div>

      {busy && (
        <div className="m3-body-small" style={{ color: 'var(--md-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconContentCopy size={14} />
          {t('jw_fetching')}
        </div>
      )}
    </div>
  )
}
