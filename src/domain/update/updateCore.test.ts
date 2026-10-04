/**
 * 更新检查纯函数测试 — UpdateNoticeCoreTest.kt 1:1 + VersionUtils/parseReleaseJson 对位。
 */

import { describe, it, expect } from 'vitest'
import { compareVersions, parseReleaseJson, noticeVisible } from './updateCore'

describe('compareVersions (VersionUtils.compare 1:1)', () => {
  it('数字段逐项比较, 短侧补 0, v 前缀剥离', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.0.58', '1.0.57')).toBe(1)
    expect(compareVersions('1.0.9', '1.0.10')).toBe(-1)
    expect(compareVersions('1.1', '1.0.9')).toBe(1)
    expect(compareVersions('1.2.3-debug', '1.2.3')).toBe(0) // 非数字段忽略
    expect(compareVersions('abc', '0')).toBe(0) // 全非数字 → [0]
  })
})

describe('parseReleaseJson (UpdateInfo.parseReleaseJson 对位)', () => {
  const current = '1.0.57'

  it('tag_name 剥 v 前缀; 更高版本 → isUpdateAvailable', () => {
    const info = parseReleaseJson({ tag_name: 'v1.0.58', body: 'notes', html_url: 'https://x' }, current)
    expect(info.version).toBe('1.0.58')
    expect(info.changelog).toBe('notes')
    expect(info.releaseUrl).toBe('https://x')
    expect(info.isUpdateAvailable).toBe(true)
  })

  it('同版本/更旧 → 无更新', () => {
    expect(parseReleaseJson({ tag_name: 'v1.0.57' }, current).isUpdateAvailable).toBe(false)
    expect(parseReleaseJson({ tag_name: 'v1.0.56' }, current).isUpdateAvailable).toBe(false)
  })

  it('SLEEPY_FORCE_UPDATE=true 强制可用 (FORCE_FLAG)', () => {
    const info = parseReleaseJson({ tag_name: 'v1.0.57', body: 'xx SLEEPY_FORCE_UPDATE=true yy' }, current)
    expect(info.isUpdateAvailable).toBe(true)
  })

  it('缺 tag_name → version 空串按 "0" 比较 → 无更新', () => {
    const info = parseReleaseJson({}, current)
    expect(info.version).toBe('')
    expect(info.isUpdateAvailable).toBe(false)
  })
})

describe('noticeVisible (UpdateNoticeCore.isVisible 1:1)', () => {
  const update = (version: string, available = true) => ({
    version,
    changelog: 'notes',
    releaseUrl: 'url',
    isUpdateAvailable: available,
  })

  it('new_update_is_visible_without_dismissal', () => {
    expect(noticeVisible(update('1.2.0'), null)).toBe(true)
  })

  it('dismissal_hides_only_the_same_version', () => {
    expect(noticeVisible(update('1.2.0'), '1.2.0')).toBe(false)
    expect(noticeVisible(update('1.3.0'), '1.2.0')).toBe(true)
  })

  it('no_update_or_blank_version_is_not_visible', () => {
    expect(noticeVisible(update('1.2.0', false), null)).toBe(false)
    expect(noticeVisible(update(''), null)).toBe(false)
    expect(noticeVisible(null, null)).toBe(false)
  })
})
