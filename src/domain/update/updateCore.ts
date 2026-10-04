/**
 * 更新检查 — VersionUtils.kt + UpdateInfo.parseReleaseJson + UpdateNoticeCore.kt 的 1:1 移植。
 * 纯函数 (无网络), 供 updateChecker 与单测直接消费。
 *
 * 与 Android 的差异: Android 下载 APK 自装, web 无安装语义 →
 * "下载" 改为跳转 GitHub Releases 页面 (releaseUrl)。
 */

/** VersionUtils.compare — 数字段逐项比较, 短侧补 0; "v" 前缀剥离 */
export function compareVersions(left: string, right: string): number {
  const parts = (v: string): number[] => {
    const found = v.replace(/^v/, '').match(/\d+/g)?.map(Number) ?? []
    return found.length > 0 ? found : [0]
  }
  const a = parts(left)
  const b = parts(right)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export interface UpdateInfo {
  version: string
  changelog: string
  /** GitHub Releases tag 页 (web 无 APK 安装 → 跳转页面对位 downloadUrl) */
  releaseUrl: string
  isUpdateAvailable: boolean
}

const FORCE_FLAG = 'SLEEPY_FORCE_UPDATE=true'

/** parseReleaseJson — GitHub releases/latest JSON → UpdateInfo (纯函数)。 */
export function parseReleaseJson(json: unknown, currentVersion: string): UpdateInfo {
  const release = (json ?? {}) as { tag_name?: unknown; body?: unknown; html_url?: unknown }
  const version = String(release.tag_name ?? '').replace(/^v/, '')
  const body = String(release.body ?? '')
  const releaseUrl = String(release.html_url ?? 'https://github.com/lingion/sleepy/releases')
  const force = body.includes(FORCE_FLAG)
  const isUpdateAvailable = force || compareVersions(version.length > 0 ? version : '0', currentVersion) > 0
  return { version, changelog: body, releaseUrl, isUpdateAvailable }
}

/** UpdateNoticeCore.isVisible — 有更新且版本非空且未被按版本 dismiss */
export function noticeVisible(update: UpdateInfo | null, dismissedVersion: string | null | undefined): boolean {
  return update?.isUpdateAvailable === true && update.version.trim() !== '' && update.version !== dismissedVersion
}
