/**
 * AboutPage — 关于 (AboutScreen.kt 1:1 核心)。从 MineView.tsx 拆出。
 * web 无应用内更新检查, 省更新卡。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SleepyLogo, IconChevronRight, IconDownload } from '../../components/icons'
import { SettingsScaffold, HDiv } from './shared'
import { ALL_ABIS, apkDownloadUrl, detectAbi, type Abi } from '../../domain/abi'


export function AboutPage({ onBack, onOpenLicense }: { onBack: () => void; onOpenLicense?: () => void }) {
  const t = useTranslation().t
  const version = '1.0.55'
  // 架构探测: CH 高熵 → UA 正则 → arm64 兜底; 用户可点芯片手动改选
  const [abi, setAbi] = useState<Abi>('arm64-v8a')
  useEffect(() => { void detectAbi().then(setAbi) }, [])

  return (
    <SettingsScaffold title={t('about_title')} onBack={onBack}>
      <div className="m3-card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 12px',
          background: 'var(--md-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <SleepyLogo size={48} />
        </div>
        <div className="m3-headline-small" style={{ fontWeight: 700 }}>{t('app_name')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 4 }}>
          v1.0.55
        </div>
      </div>

      {/* 下载卡 — 探测浏览器架构, 直链 GitHub Release 对应 ABI 资产; 芯片可手动改选 */}
      <div className="m3-card" style={{ padding: 16 }}>
        <div className="m3-title-medium" style={{ marginBottom: 4 }}>{t('about_download_title')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('about_download_sub', { abi })}
        </div>
        <a
          href={apkDownloadUrl(abi)}
          className="m3-label-large"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginTop: 12, padding: '12px 0', borderRadius: 20, textDecoration: 'none',
            background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          }}
        >
          <IconDownload size={18} />
          {t('about_download_btn', { abi })}
        </a>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {ALL_ABIS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAbi(a)}
              className="m3-label-medium"
              style={{
                flex: 1, padding: '7px 0', borderRadius: 16, cursor: 'pointer',
                border: a === abi ? 'none' : '1px solid var(--md-outline)',
                background: a === abi ? 'var(--md-secondary-container)' : 'transparent',
                color: a === abi ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
                fontFamily: 'monospace', fontSize: 11,
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="m3-card" style={{ padding: 0 }}>
        <InfoRow label={t('about_version')} value={`${version} (61)`} />
        <HDiv inset={16} />
        <InfoRow label={t('about_author')} value={t('about_author_name')} />
        <HDiv inset={16} />
        <InfoRow
          label={t('about_source')}
          value={t('about_source_url')}
          href={`https://${t('about_source_url')}`}
        />
      </div>

      <div className="m3-card" style={{ padding: 16 }}>
        <div className="m3-title-medium" style={{ marginBottom: 8 }}>{t('about_feedback')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('about_feedback_detail')}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <a
            href="https://github.com/lingion/sleepy/issues"
            target="_blank" rel="noreferrer"
            className="m3-label-large"
            style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 20,
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
              textDecoration: 'none',
            }}
          >
            {t('about_feedback_github')}
          </a>
          <a
            href="mailto:lingion@hrbeu.edu.cn?subject=%5BSleepy%20%E5%8F%8D%E9%A6%88%5D"
            className="m3-label-large"
            style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 20,
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
              textDecoration: 'none',
            }}
          >
            {t('about_feedback_email')}
 </a>
        </div>
      </div>

      {/* License 入口行 (v1.0.46 用户令): 长卡拆独立二级页, 这里只留入口 */}
      <div
        className="m3-card"
        onClick={() => onOpenLicense?.()}
        style={{ padding: 16, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
      >
        <div style={{ flex: 1 }}>
          <div className="m3-body-medium" style={{ fontWeight: 600 }}>{t('about_license_title')}</div>
          <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-on-surface-variant)' }}>
            {t('about_license_detail')}
          </div>
        </div>
        <IconChevronRight size={20} color="var(--md-on-surface-variant)" />
      </div>
    </SettingsScaffold>
  )
}

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', gap: 12 }}>
      <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', flexShrink: 0 }}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="m3-body-medium" style={{ color: 'var(--md-primary)', textAlign: 'right' }}>{value}</a>
      ) : (
        <span className="m3-body-medium" style={{ textAlign: 'right' }}>{value}</span>
      )}
    </div>
  )
}
