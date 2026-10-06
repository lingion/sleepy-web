/**
 * feedback 契约测试 — FeedbackComposerTest / versionFromGit 的 web 对位。
 */
import { describe, expect, it } from 'vitest'
import { formatDiagnostic, githubIssueUrl, mailtoUri, qqWebFallbackUri, versionCodeOf, type Diagnostic } from './feedback'

const diag: Diagnostic = {
  versionName: '1.0.57',
  versionCode: 10057,
  platform: 'Web',
  device: 'Mozilla/5.0 (X11; Linux)',
  resolution: '390x844',
  locale: 'zh-CN',
  isDebug: false,
}

describe('versionCodeOf', () => {
  it('major*10000 + minor*100 + patch', () => {
    expect(versionCodeOf('1.0.57')).toBe(10057)
    expect(versionCodeOf('v2.3.4-rc1')).toBe(20304)
  })
  it('无法解析 → 1', () => {
    expect(versionCodeOf('dev')).toBe(1)
  })
})

describe('formatDiagnostic', () => {
  it('逐行格式 + markdown 转义', () => {
    const s = formatDiagnostic(diag)
    expect(s.split('\n')).toEqual([
      '---',
      '**Version:** 1.0.57',
      '**VersionCode:** 10057',
      '**Platform:** Web',
      '**Device:** Mozilla/5.0 \\(X11; Linux\\)',
      '**Resolution:** 390x844',
      '**Locale:** zh-CN',
      '**Build:** Release',
    ])
  })
})

describe('githubIssueUrl', () => {
  it('template 在前, title/body 编码, body 附诊断块', () => {
    const url = new URL(githubIssueUrl('[Sleepy] ', '请描述', diag, 'bug_report.yml'))
    expect(url.origin + url.pathname).toBe('https://github.com/lingion/sleepy/issues/new')
    expect([...url.searchParams.keys()]).toEqual(['template', 'title', 'body'])
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    expect(url.searchParams.get('title')).toBe('[Sleepy] ')
    expect(url.searchParams.get('body')).toBe(`请描述\n\n${formatDiagnostic(diag)}`)
  })
  it('无 template 时省略该参数', () => {
    expect(githubIssueUrl('t', 'b', diag)).not.toContain('template=')
  })
})

describe('mailtoUri', () => {
  it('收件人 + subject/body 百分号编码', () => {
    const uri = mailtoUri('[Sleepy 反馈]', '正文', diag)
    expect(uri.startsWith('mailto:lingion@hrbeu.edu.cn?subject=')).toBe(true)
    const q = new URLSearchParams(uri.slice(uri.indexOf('?') + 1))
    expect(q.get('subject')).toBe('[Sleepy 反馈]')
    expect(q.get('body')).toBe(`正文\n\n${formatDiagnostic(diag)}`)
    expect(uri).not.toContain('+')
  })
})

describe('qqWebFallbackUri', () => {
  it('QqJoin.webFallbackUri 同形', () => {
    expect(qqWebFallbackUri('1063407652')).toBe('https://qm.qq.com/cgi-bin/qm/qr?from=app&jump_from=webapi&href=1063407652')
  })
})
