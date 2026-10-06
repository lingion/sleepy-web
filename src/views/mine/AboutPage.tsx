/**
 * AboutPage — 关于 (AboutScreen.kt 1:1)。
 * 顺序: 更新 banner → 应用名/版本 → 版本 → 获取更新 → 作者 → 开源地址 → 反馈 → QQ 群 → 开源声明 → 自动检查更新。
 * 有新版且未关闭时内容区底色 primary@5% + 顶部 banner (按版本 dismiss)。
 * web 差异: 无 APK 自装 → 更新弹窗「下载」= 打开 Releases 页; QQ 拉起链只剩浏览器加群页;
 * 尾部 ABI 下载卡为 web 独有 (浏览器端没有已安装的 APK, 需要给出安装包入口)。
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconBugReport, IconChevronRight, IconClose, IconCode, IconContentCopy, IconDownload, IconEmail,
  IconGroups, IconNewReleases, IconOpenInNew, IconPerson,
} from '../../components/icons'
import { SettingsScaffold, Switch } from './shared'
import { ALL_ABIS, apkDownloadUrl, detectAbi, type Abi } from '../../domain/abi'
import { usePrefsStore } from '../../state/prefsStore'
import { getCachedUpdate, maybeCheckOnStart, dismissUpdate, clearUpdateCache } from '../../domain/update/updateChecker'
import { parseReleaseJson } from '../../domain/update/updateCore'
import {
  githubIssueUrl, mailtoUri, qqWebFallbackUri, versionCodeOf, QQ_GROUP_NUMBER, type Diagnostic,
} from '../../domain/feedback'
import { UpdateChangelogDialog, type UpdateDialogState } from './UpdateChangelogDialog'
import pkg from '../../../package.json'

const GITHUB_LATEST = 'https://github.com/lingion/sleepy/releases/latest'
const SNACKBAR_SHORT_MS = 4000

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export function AboutPage({ onBack, onOpenLicense }: { onBack: () => void; onOpenLicense?: () => void }) {
  const { t, i18n } = useTranslation()
  const version: string = pkg.version
  const versionCode = versionCodeOf(version)
  const [abi, setAbi] = useState<Abi>('arm64-v8a')
  useEffect(() => { void detectAbi().then(setAbi) }, [])
  const [dialog, setDialog] = useState<UpdateDialogState | null>(null)

  const updateCheckEnabled = usePrefsStore((s) => s.prefs.updateCheckEnabled)
  // 订阅 dismiss 版本: 写穿后重渲染, getCachedUpdate 重算可见性
  usePrefsStore((s) => s.prefs.updateNoticeDismissedVersion)
  const updatePrefs = usePrefsStore((s) => s.update)
  const [refresh, setRefresh] = useState(0)
  const [checking, setChecking] = useState(false)
  const [snackbar, setSnackbar] = useState('')
  useEffect(() => {
    void maybeCheckOnStart(version).then(() => setRefresh((c) => c + 1))
  }, [version])
  const updateAvailable = getCachedUpdate()
  void refresh

  useEffect(() => {
    if (snackbar === '') return
    const id = window.setTimeout(() => setSnackbar(''), SNACKBAR_SHORT_MS)
    return () => window.clearTimeout(id)
  }, [snackbar])

  const diagnostic = (): Diagnostic => ({
    versionName: version,
    versionCode,
    platform: 'Web',
    device: navigator.userAgent,
    resolution: `${window.innerWidth}x${window.innerHeight}`,
    locale: i18n.language,
    isDebug: import.meta.env.DEV,
  })

  const openGitHubFeedback = () => {
    openExternal(githubIssueUrl('[Sleepy] ', '请描述你遇到的问题或建议：', diagnostic(), 'bug_report.yml'))
  }

  const openEmailFeedback = () => {
    window.location.href = mailtoUri(t('about_feedback_email_subject'), t('about_feedback_email_body'), diagnostic())
  }

  const joinQqGroup = () => {
    void copyText(QQ_GROUP_NUMBER)
    openExternal(qqWebFallbackUri(QQ_GROUP_NUMBER))
    setSnackbar(t('about_qq_copied'))
  }

  // checkUpdate (AboutScreen.kt): 有更新 → 更新弹窗; 无更新 → snackbar「已是最新」; 失败 → 弹窗 Failed 态 (重试 = 再查)
  const checkUpdate = async () => {
    if (checking) return
    setChecking(true)
    setDialog(null)
    try {
      const res = await fetch('https://api.github.com/repos/lingion/sleepy/releases/latest', {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const info = parseReleaseJson(await res.json(), version)
      if (info.isUpdateAvailable) {
        setDialog({ kind: 'available', version: info.version, changelog: info.changelog, url: info.releaseUrl || GITHUB_LATEST })
      } else {
        setSnackbar(t('about_update_latest', { v1: info.version }))
      }
    } catch (e) {
      const message = e instanceof Error && e.message !== '' ? e.message : t('error_unknown')
      setDialog({ kind: 'failed', message, version: '', changelog: '', url: '' })
    } finally {
      setChecking(false)
    }
  }

  const noticeBg = updateAvailable ? 'color-mix(in srgb, var(--md-primary) 5%, transparent)' : undefined

  return (
    <SettingsScaffold title={t('about_title')} onBack={onBack} bg={noticeBg}>
      <div style={{ margin: '-16px 4px 0', display: 'flex', flexDirection: 'column' }}>
        {updateAvailable && (
          <>
            <div style={{ height: 12 }} />
            <UpdateBanner
              text={t('about_update_available', { v1: `v${updateAvailable.version}` })}
              dismissLabel={t('about_update_dismiss')}
              onOpen={() => openExternal(`https://github.com/lingion/sleepy/releases/tag/v${updateAvailable.version}`)}
              onDismiss={() => { dismissUpdate(updateAvailable.version); setRefresh((c) => c + 1) }}
            />
            <div style={{ height: 8 }} />
          </>
        )}
        <div style={{ height: 24 }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, paddingBottom: 24 }}>
          <div className="m3-headline-medium" style={{ fontWeight: 700, color: 'var(--md-on-surface)' }}>{t('app_name')}</div>
          <div className="m3-body-medium" style={{ marginTop: 4, color: 'var(--md-on-surface-variant)' }}>v{version}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <InfoCard>
            <CardRow
              icon={<IconNewReleases size={24} />}
              title={t('about_version')}
              detail={t('about_version_detail', { v1: version, v2: versionCode })}
              detailClass="m3-body-medium"
            />
          </InfoCard>

          <InfoCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CardRow icon={<IconDownload size={24} />} title={t('about_update')} detail={t('about_update_detail')} />
              <FilledButton disabled={checking} onClick={() => { void checkUpdate() }}>
                <IconDownload size={24} />
                <span style={{ width: 8 }} />
                {checking ? t('about_update_checking') : t('about_update')}
              </FilledButton>
            </div>
          </InfoCard>

          <InfoCard>
            <CardRow
              icon={<IconPerson size={24} />}
              title={t('about_author')}
              detail={t('about_author_name')}
              detailClass="m3-body-medium"
              trailing={<IconBtn onClick={() => openExternal('https://github.com/lingion')}><IconOpenInNew size={20} /></IconBtn>}
            />
          </InfoCard>

          <InfoCard>
            <CardRow
              icon={<IconCode size={24} />}
              title={t('about_source')}
              detail={
                <span style={{ color: 'var(--md-primary)', textDecoration: 'underline' }}>{t('about_source_url')}</span>
              }
              detailClass="m3-body-medium"
              trailing={<IconBtn onClick={() => openExternal('https://github.com/lingion/sleepy')}><IconOpenInNew size={20} /></IconBtn>}
            />
          </InfoCard>

          <InfoCard>
            <CardRow
              icon={<IconBugReport size={24} />}
              title={t('about_feedback')}
              detail={t('about_feedback_detail')}
              trailing={
                <>
                  <IconBtn label={t('about_feedback_github')} onClick={openGitHubFeedback}><IconOpenInNew size={20} /></IconBtn>
                  <IconBtn label={t('about_feedback_email')} onClick={openEmailFeedback}><IconEmail size={20} /></IconBtn>
                </>
              }
            />
          </InfoCard>

          <InfoCard>
            <CardRow
              onClick={joinQqGroup}
              icon={<IconGroups size={24} />}
              title={t('about_qq_title')}
              detail={t('about_qq_detail', { v1: QQ_GROUP_NUMBER })}
              trailing={<IconBtn label={t('about_qq_copy_action')} onClick={joinQqGroup}><IconContentCopy size={20} /></IconBtn>}
            />
          </InfoCard>

          <InfoCard>
            <CardRow
              onClick={() => onOpenLicense?.()}
              title={t('about_license_title')}
              detail={t('about_license_detail')}
              trailing={<IconChevronRight size={20} color="var(--md-on-surface-variant)" />}
            />
          </InfoCard>

          <InfoCard>
            <CardRow
              title={t('about_update_check')}
              detail={t('about_update_check_detail')}
              trailing={
                <Switch
                  checked={updateCheckEnabled}
                  uncheckedTrack="var(--md-surface-variant)"
                  onChange={(v) => {
                    void updatePrefs({ updateCheckEnabled: v })
                    if (!v) clearUpdateCache()
                    setRefresh((c) => c + 1)
                  }}
                />
              }
            />
          </InfoCard>

          <InfoCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CardRow
                icon={<IconDownload size={24} />}
                title={t('about_download_title')}
                detail={t('about_download_sub', { abi })}
              />
              <FilledButton href={apkDownloadUrl(abi)}>
                <IconDownload size={24} />
                <span style={{ width: 8 }} />
                {t('about_download_btn', { abi })}
              </FilledButton>
              <div style={{ display: 'flex', gap: 8 }}>
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
          </InfoCard>
        </div>
      </div>

      {snackbar !== '' && (
        <div
          role="status"
          className="m3-body-medium"
          style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1100, maxWidth: 'calc(100vw - 32px)', padding: '10px 16px', borderRadius: 8,
            background: 'var(--md-inverse-surface, var(--md-surface-container-highest))',
            color: 'var(--md-inverse-on-surface, var(--md-on-surface))',
          }}
        >
          {snackbar}
        </div>
      )}

      {dialog && (
        <UpdateChangelogDialog
          state={dialog}
          onDismiss={() => setDialog(null)}
          onDownload={(url) => { openExternal(url); setDialog(null) }}
          onRetry={() => { void checkUpdate() }}
        />
      )}
    </SettingsScaffold>
  )
}

/** InfoCard — surfaceContainer + shapes.large(16) + padding 20 */
function InfoCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ borderRadius: 16, background: 'var(--md-surface-container)', padding: 20 }}>
      {children}
    </div>
  )
}

/** 卡内行: 24dp primary 图标 + 12 间距 + 标题 bodyLarge SemiBold / 副文 (默认 bodySmall) + 尾部动作 */
function CardRow({
  icon, title, detail, detailClass = 'm3-body-small', trailing, onClick,
}: {
  icon?: ReactNode
  title: string
  detail: ReactNode
  detailClass?: string
  trailing?: ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', cursor: onClick ? 'pointer' : undefined }}
    >
      {icon && <span style={{ color: 'var(--md-primary)', display: 'inline-flex', marginRight: 12, flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="m3-body-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
        <div className={detailClass} style={{ color: 'var(--md-on-surface-variant)' }}>{detail}</div>
      </div>
      {trailing}
    </div>
  )
}

/** IconButton — 48dp 触达区, primary tint; 阻止冒泡避免与可点卡片重复触发 */
function IconBtn({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 48, height: 48, borderRadius: 24, border: 'none', background: 'transparent', padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        color: 'var(--md-primary)', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

/** M3 Button 默认形态: 高 40 stadium, 24/8 内边距, primary; 禁用 onSurface 12%/38% */
function FilledButton({
  children, onClick, disabled = false, href,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  href?: string
}) {
  const style = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', boxSizing: 'border-box' as const,
    minHeight: 40, padding: '8px 24px', borderRadius: 20, border: 'none', textDecoration: 'none',
    background: disabled ? 'color-mix(in srgb, var(--md-on-surface) 12%, transparent)' : 'var(--md-primary)',
    color: disabled ? 'color-mix(in srgb, var(--md-on-surface) 38%, transparent)' : 'var(--md-on-primary)',
    cursor: disabled ? 'default' : 'pointer',
  }
  if (href) return <a href={href} className="m3-label-large" style={style}>{children}</a>
  return <button type="button" disabled={disabled} onClick={onClick} className="m3-label-large" style={style}>{children}</button>
}

function UpdateBanner({
  text, dismissLabel, onOpen, onDismiss,
}: {
  text: string
  dismissLabel: string
  onOpen: () => void
  onDismiss: () => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', borderRadius: 16, padding: '8px 4px 8px 16px',
        background: 'color-mix(in srgb, var(--md-primary) 12%, transparent)', color: 'var(--md-primary)',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', background: 'none', border: 'none',
          padding: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', font: 'inherit',
        }}
      >
        <IconNewReleases size={20} />
        <span className="m3-body-medium" style={{ flex: 1, minWidth: 0, marginLeft: 10, fontWeight: 600 }}>{text}</span>
        <IconOpenInNew size={18} />
      </button>
      <IconBtn label={dismissLabel} onClick={onDismiss}><IconClose size={24} /></IconBtn>
    </div>
  )
}
