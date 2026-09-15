/**
 * abi — 浏览器端 Android 安装包架构探测。
 * 关于页下载按钮据此选 GitHub Release 对应 ABI 资产 (app-<abi>-release.apk)。
 *
 * 探测优先级:
 * 1. Client Hints 高熵值 (Chromium): platform/architecture/bitness 精确判定
 * 2. UA 串正则 (Firefox/Safari/旧内核): aarch64/arm/x86_64/i686 关键字
 * 3. 兜底 arm64-v8a — 当前 Android 存量绝对多数, 错选概率最低
 *
 * 32 位 x86 真机已绝迹且 release 无 x86 资产 → x86 系一律归 x86_64。
 */

export type Abi = 'arm64-v8a' | 'armeabi-v7a' | 'x86_64'

export const ALL_ABIS: Abi[] = ['arm64-v8a', 'armeabi-v7a', 'x86_64']

/** GitHub Release 稳定直链 — latest 永远指向最新 tag, 资产名含 ABI */
export function apkDownloadUrl(abi: Abi): string {
  return `https://github.com/lingion/sleepy/releases/latest/download/app-${abi}-release.apk`
}

/** 纯函数: 高熵值 → ABI (无匹配返回 null) — 单测直打 */
export function abiFromHighEntropy(arch: string | undefined, bitness: string | undefined): Abi | null {
  const a = (arch ?? '').toLowerCase()
  const b64 = bitness === '64'
  if (a === 'arm') return b64 ? 'arm64-v8a' : 'armeabi-v7a'
  if (a === 'x86') return 'x86_64' // 32 位 x86 无资产, 归 64
  return null
}

/** 纯函数: UA 串 → ABI (无匹配返回 null) — 单测直打 */
export function abiFromUserAgent(ua: string): Abi | null {
  if (/aarch64|arm64/i.test(ua)) return 'arm64-v8a'
  if (/x86_64|win64|wow64|x64/i.test(ua)) return 'x86_64'
  if (/\barm\b|armeabi/i.test(ua)) return 'armeabi-v7a'
  if (/i686|i386\b/i.test(ua)) return 'x86_64' // 32 位 x86 无资产, 归 64
  return null
}

interface HighEntropyNav {
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>
  }
}

/** 异步探测: CH 高熵 → UA 正则 → arm64-v8a 兜底 */
export async function detectAbi(): Promise<Abi> {
  try {
    const nav = navigator as Navigator & HighEntropyNav
    const hev = await nav.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness'])
    const fromHev = abiFromHighEntropy(hev?.architecture, hev?.bitness)
    if (fromHev) return fromHev
  } catch {
    /* 非安全上下文/不支持 → 落 UA 正则 */
  }
  return abiFromUserAgent(navigator.userAgent) ?? 'arm64-v8a'
}
