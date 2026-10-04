/**
 * AboutPage — 关于 (AboutScreen.kt 1:1 核心)。从 MineView.tsx 拆出。
 * 版本号直接来源于 package.json, 不再硬编码。
 * 更新检查 (AboutScreen.kt:96-220/250-270): 冷启动自动拉 Releases latest +
 * 顶部更新 banner (按版本 dismiss) + 手动检查 + 自动检查开关。
 * web 差异: 无 APK 自装语义 → 下载按钮 = 打开 GitHub Releases 页。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SleepyLogo, IconChevronRight, IconDownload, IconContentCopy, IconCheck, IconNewReleases } from '../../components/icons'
import { SettingsScaffold, HDiv, ToggleRow } from './shared'
import { ALL_ABIS, apkDownloadUrl, detectAbi, type Abi } from '../../domain/abi'
import { usePrefsStore } from '../../state/prefsStore'
import { getCachedUpdate, maybeCheckOnStart, dismissUpdate, clearUpdateCache } from '../../domain/update/updateChecker'
import { parseReleaseJson, type UpdateInfo } from '../../domain/update/updateCore'
import pkg from '../../../package.json'

const QQ_GROUP = '1063407652'
const GITHUB_LATEST = 'https://github.com/lingion/sleepy/releases/latest'

export function AboutPage({ onBack, onOpenLicense }: { onBack: () => void; onOpenLicense?: () => void }) {
  const t = useTranslation().t
  const version: string = pkg.version
  // 架构探测: CH 高熵 → UA 正则 → arm64 兜底; 用户可点芯片手动改选
  const [abi, setAbi] = useState<Abi>('arm64-v8a')
  useEffect(() => { void detectAbi().then(setAbi) }, [])
  const [qqCopied, setQqCopied] = useState(false)

  // ---- 更新检查 (UpdateNotifier/UpdateManager 的 web 接线) ----
  const updateCheckEnabled = usePrefsStore((s) => s.prefs.updateCheckEnabled)
  const dismissedVersion = usePrefsStore((s) => s.prefs.updateNoticeDismissedVersion)
  const updatePrefs = usePrefsStore((s) => s.update)
  const [refresh, setRefresh] = useState(0)
  const [checking, setChecking] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => {
    void maybeCheckOnStart(version).then(() => setRefresh((c) => c + 1))
  }, [version])
  const bannerInfo = getCachedUpdate()
  void refresh // 拉取完成后重渲染, getCachedUpdate 重算

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3000)
  }

  // checkUpdate (AboutScreen.kt:171-186): 手动检查总是重新拉取;
  // 有更新 → 打开 Releases 页 (web 对位"下载"弹窗); 无更新 → toast "已是最新"。
  const checkUpdate = async () => {
    if (checking) return
    setChecking(true)
    try {
      const res = await fetch('https://api.github.com/repos/lingion/sleepy/releases/latest', {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const info: UpdateInfo = parseReleaseJson(await res.json(), version)
      if (info.isUpdateAvailable) {
        window.open(info.releaseUrl || GITHUB_LATEST, '_blank', 'noopener')
      } else {
        showToast(t('about_update_latest', { v1: info.version }))
      }
    } catch {
      showToast(t('about_update_failed', { defaultValue: '检查更新失败，请稍后重试' }))
    } finally {
      setChecking(false)
    }
  }

  const copyQqGroup = async () => {
    try {
      await navigator.clipboard.writeText(QQ_GROUP)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = QQ_GROUP
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setQqCopied(true)
    window.setTimeout(() => setQqCopied(false), 2000)
  }

  return (
    <SettingsScaffold title={t('about_title')} onBack={onBack}>
      {/* 顶部更新 banner (AboutScreen.kt:254-270 UpdateBanner): 点击开 Releases tag 页, 右侧 X dismiss */}
      {bannerInfo && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16,
            background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          }}
        >
          <IconNewReleases size={22} />
          <button
            type="button"
            onClick={() => window.open(bannerInfo.releaseUrl || GITHUB_LATEST, '_blank', 'noopener')}
            className="m3-label-large"
            style={{
              flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
              color: 'inherit', padding: 0,
            }}
          >
            {t('about_update_available', { v1: bannerInfo.version })}
          </button>
          <button
            type="button"
            aria-label={t('about_update_dismiss')}
            onClick={() => { dismissUpdate(bannerInfo.version); setRefresh((c) => c + 1) }}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', color: 'inherit',
              fontSize: 16, padding: 4,
            }}
          >
            ✕
          </button>
        </div>
      )}

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

      {/* QQ 群卡 — 一键复制群号, 在 QQ 搜索群号申请加入 */}
      <div className="m3-card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="m3-title-medium">{t('about_qq_title')}</div>
            <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>
              {t('about_qq_detail', { group: QQ_GROUP })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void copyQqGroup() }}
            className="m3-label-large"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '9px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
            }}
          >
            {qqCopied ? <IconCheck size={16} /> : <IconContentCopy size={16} />}
            {qqCopied ? t('about_qq_copied') : t('about_qq_copy')}
          </button>
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

      {/* 获取更新卡 (AboutScreen.kt UpdateUiState 分支的 web 对位: 无下载/安装态, 只有检查) */}
      <div
        className="m3-card"
        style={{
          padding: 16,
          background: bannerInfo ? 'var(--md-secondary-container)' : 'var(--md-surface-container)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconNewReleases size={22} color="var(--md-on-surface-variant)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m3-title-medium">{t('about_update')}</div>
            <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', marginTop: 2 }}>
              {checking
                ? t('about_update_checking')
                : bannerInfo
                  ? t('about_update_available', { v1: bannerInfo.version })
                  : t('about_update_detail')}
            </div>
          </div>
          <button
            type="button"
            disabled={checking}
            onClick={() => { void checkUpdate() }}
            className="m3-label-large"
            style={{
              flexShrink: 0, padding: '9px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: 'var(--md-primary)', color: 'var(--md-on-primary)',
              opacity: checking ? 0.6 : 1,
            }}
          >
            {checking ? t('about_update_checking') : t('about_update_check_button', { defaultValue: '检查' })}
          </button>
        </div>
      </div>

      {/* 自动检查更新开关 (about_update_check / UpdateNotifier.maybeCheckOnStart 门控) */}
      <div className="m3-card" style={{ padding: 0 }}>
        <ToggleRow
          label={t('about_update_check')}
          subtitle={t('about_update_check_detail')}
          checked={updateCheckEnabled}
          onChange={(v) => {
            void updatePrefs({ updateCheckEnabled: v })
            if (!v) {
              void updatePrefs({ updateNoticeDismissedVersion: '' })
              clearUpdateCache()
            }
            setRefresh((c) => c + 1)
          }}
        />
        {dismissedVersion !== '' && updateCheckEnabled && (
          <>
            <HDiv inset={16} />
            <div style={{ padding: '10px 16px' }}>
              <button
                type="button"
                className="m3-label-medium"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--md-primary)',
                }}
                onClick={() => {
                  void updatePrefs({ updateNoticeDismissedVersion: '' })
                  setRefresh((c) => c + 1)
                }}
              >
                {t('about_update_redisplay', {
                  v1: dismissedVersion,
                  defaultValue: `重新显示 v${dismissedVersion} 的更新提示`,
                })}
              </button>
            </div>
          </>
        )}
      </div>

      {toast !== '' && (
        <div
          role="status"
          className="m3-body-medium"
          style={{
            padding: '12px 16px', borderRadius: 12,
            background: 'var(--md-inverse-surface, var(--md-surface-container-highest))',
            color: 'var(--md-inverse-on-surface, var(--md-on-surface))',
          }}
        >
          {toast}
        </div>
      )}

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
