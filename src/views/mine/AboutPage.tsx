/**
 * AboutPage — 关于 (AboutScreen.kt 1:1 核心)。从 MineView.tsx 拆出。
 * web 无应用内更新检查, 省更新卡。
 */

import { useTranslation } from 'react-i18next'
import { SleepyLogo } from '../../components/icons'
import { SettingsScaffold, HDiv } from './shared'


export function AboutPage({ onBack }: { onBack: () => void }) {
  const t = useTranslation().t
  const version = '1.0.53'

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
          {t('about_version_detail', { v1: '1.0.53', v2: '53' })}
        </div>
      </div>

      <div className="m3-card" style={{ padding: 0 }}>
        <InfoRow label={t('about_version')} value={`${version} (53)`} />
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

      <div className="m3-card" style={{ padding: 16 }}>
        <div className="m3-title-medium" style={{ marginBottom: 8 }}>{t('about_license_title')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'pre-line' }}>
          {t('about_license_body')}
        </div>
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
