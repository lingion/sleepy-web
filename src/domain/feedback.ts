/**
 * feedback — FeedbackComposer.kt + QqJoin.kt + build.gradle.kts versionFromGit 的 web 对位 (纯函数)。
 * 诊断块格式与 Android 逐行一致; Android/Device 两行换成浏览器平台信息 (web 无 Build.BRAND/MODEL)。
 */

export const GITHUB_REPO = 'lingion/sleepy'
export const FALLBACK_EMAIL = 'lingion@hrbeu.edu.cn'
export const QQ_GROUP_NUMBER = '1063407652'

export interface Diagnostic {
  versionName: string
  versionCode: number
  platform: string
  device: string
  resolution: string
  locale: string
  isDebug: boolean
}

/** versionCode = major*10000 + minor*100 + patch; 无法解析时 1 (Android parse fallback 同值) */
export function versionCodeOf(versionName: string): number {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(versionName)
  if (!m) return 1
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])
}

function escapeMd(s: string): string {
  return s.replace(/[*_`[\]()]/g, (c) => `\\${c}`)
}

export function formatDiagnostic(d: Diagnostic): string {
  return [
    '---',
    `**Version:** ${escapeMd(d.versionName)}`,
    `**VersionCode:** ${d.versionCode}`,
    `**Platform:** ${escapeMd(d.platform)}`,
    `**Device:** ${escapeMd(d.device)}`,
    `**Resolution:** ${escapeMd(d.resolution)}`,
    `**Locale:** ${escapeMd(d.locale)}`,
    `**Build:** ${d.isDebug ? 'Debug' : 'Release'}`,
  ].join('\n')
}

const enc = encodeURIComponent

export function githubIssueUrl(title: string, body: string, diag: Diagnostic, template?: string): string {
  const params: string[] = []
  if (template) params.push(`template=${enc(template)}`)
  params.push(`title=${enc(title)}`)
  params.push(`body=${enc(`${body}\n\n${formatDiagnostic(diag)}`)}`)
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.join('&')}`
}

export function mailtoUri(subject: string, body: string, diag: Diagnostic, email: string = FALLBACK_EMAIL): string {
  return `mailto:${email}?subject=${enc(subject)}&body=${enc(`${body}\n\n${formatDiagnostic(diag)}`)}`
}

/** QqJoin.webFallbackUri — 浏览器加群页 (Android 降级链末端, web 唯一可用通道) */
export function qqWebFallbackUri(groupNumber: string): string {
  return `https://qm.qq.com/cgi-bin/qm/qr?from=app&jump_from=webapi&href=${groupNumber}`
}
