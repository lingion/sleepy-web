/**
 * abi 契约测试 — 高熵值/UA 正则映射 + 下载直链格式。
 * 资产名与 lingion/sleepy Release 固定命名锁定 (app-<abi>-release.apk)。
 */
import { describe, expect, it } from 'vitest'
import { abiFromHighEntropy, abiFromUserAgent, apkDownloadUrl } from './abi'

describe('abiFromHighEntropy (CH 高熵值)', () => {
  it('arm + 64 → arm64-v8a', () => {
    expect(abiFromHighEntropy('arm', '64')).toBe('arm64-v8a')
  })
  it('arm + 32 → armeabi-v7a', () => {
    expect(abiFromHighEntropy('arm', '32')).toBe('armeabi-v7a')
  })
  it('x86 任意位宽 → x86_64 (32 位无资产)', () => {
    expect(abiFromHighEntropy('x86', '64')).toBe('x86_64')
    expect(abiFromHighEntropy('x86', '32')).toBe('x86_64')
  })
  it('未知/缺失 → null', () => {
    expect(abiFromHighEntropy(undefined, undefined)).toBeNull()
    expect(abiFromHighEntropy('mips', '64')).toBeNull()
  })
})

describe('abiFromUserAgent (UA 串兜底)', () => {
  it('显式 aarch64 → arm64-v8a', () => {
    expect(abiFromUserAgent('Mozilla/5.0 (Linux; aarch64) Firefox/128.0')).toBe('arm64-v8a')
  })
  it('x86_64 → x86_64', () => {
    expect(abiFromUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0')).toBe('x86_64')
  })
  it('32 位 arm → armeabi-v7a', () => {
    expect(abiFromUserAgent('Mozilla/5.0 (Android 8.1; ARM; Tablet) Gecko/ Firefox')).toBe('armeabi-v7a')
  })
  it('i686 → x86_64 (32 位 x86 无资产, 归 64)', () => {
    expect(abiFromUserAgent('Mozilla/5.0 (Linux i686) Firefox')).toBe('x86_64')
  })
  it('桌面 Mac UA (无架构关键字) → null', () => {
    expect(abiFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBeNull()
  })
})

describe('apkDownloadUrl', () => {
  it('latest 稳定直链 + ABI 资产名', () => {
    expect(apkDownloadUrl('arm64-v8a')).toBe(
      'https://github.com/lingion/sleepy/releases/latest/download/app-arm64-v8a-release.apk',
    )
    expect(apkDownloadUrl('armeabi-v7a')).toContain('app-armeabi-v7a-release.apk')
    expect(apkDownloadUrl('x86_64')).toContain('app-x86_64-release.apk')
  })
})
