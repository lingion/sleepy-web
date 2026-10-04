/**
 * UpdateNotifier.kt 的 web 对位 — 会话内冷启动拉一次 GitHub Releases latest,
 * 结果缓存给 AboutPage 的高亮/banner 用。
 * - updateCheckEnabled 关 → 不发请求, clearCache 立即清高亮 (clearCache 同构)
 * - 同一会话只查一次 (mutex/inFlight 同构); dismiss 按版本持久化, 新版本自然重现
 * - 失败静默 (Android runCatching 同态度)。镜像回退 (gh.qdp.qzz.io) 不移植:
 *   浏览器 CORS 下镜像 HTML 抓取收益不确定, 且 web 侧仅跳转 Releases 页, 失败不影响使用。
 */

import { usePrefsStore } from '../../state/prefsStore'
import { parseReleaseJson, type UpdateInfo } from './updateCore'

const GITHUB_API = 'https://api.github.com/repos/lingion/sleepy/releases/latest'

let cached: UpdateInfo | null = null
let inFlight: Promise<void> | null = null

/** 远端有更新且未 dismiss 时的信息; null = 无 / 未查 / 已关闭检查 */
export function getCachedUpdate(): UpdateInfo | null {
  const { updateCheckEnabled, updateNoticeDismissedVersion } = usePrefsStore.getState().prefs
  if (!updateCheckEnabled) return null
  if (!cached?.isUpdateAvailable) return null
  if (cached.version !== '' && cached.version === updateNoticeDismissedVersion) return null
  return cached
}

/** maybeCheckOnStart — 会话一次; updateCheckEnabled 门控; 失败静默 */
export function maybeCheckOnStart(currentVersion: string): Promise<void> {
  if (!usePrefsStore.getState().prefs.updateCheckEnabled) return Promise.resolve()
  if (inFlight !== null || cached !== null) return inFlight ?? Promise.resolve()
  inFlight = (async () => {
    try {
      const res = await fetch(GITHUB_API, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const info = parseReleaseJson(await res.json(), currentVersion)
      if (info.isUpdateAvailable) cached = info
    } catch {
      /* 静默 — cache 保持 null */
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** dismiss — 按版本记住忽略 (updateNoticeDismissedVersion 写穿 Dexie prefs) */
export function dismissUpdate(version: string): void {
  if (version.trim() === '') return
  void usePrefsStore.getState().update({ updateNoticeDismissedVersion: version })
}

/** 用户关闭自动检查后清空缓存, 立即消失高亮 (UpdateNotifier.clearCache 同构) */
export function clearUpdateCache(): void {
  cached = null
}

/** 测试复位 */
export function resetUpdateCheckerForTest(): void {
  cached = null
  inFlight = null
}
