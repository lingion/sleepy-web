/**
 * SchoolSelectPage — ui/screen/imports/SchoolSelectScreen.kt 的 web 移植。
 *
 * 与 Android 一致的行为:
 *  · 计数行左侧永远是「共 N 所」(全量), 只有搜索时才在右侧补「匹配 M」
 *  · 输入看起来像 URL 时, 列表顶部插一条「直接用此 URL 登录」行 (UrlDirectRow)
 *  · 行可点条件 = status 已适配 且 配了 URL; 否则整行降透明度且不可点
 *  · 字母索引条只在无搜索词且分组 > 1 时出现
 */

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconLink, IconSchool } from '../../components/icons'
import { HDiv } from '../mine/shared'
import { filterSchools } from './pinyin'
import {
  detectProtocolFromUrl,
  displayHost,
  looksLikeUrl,
  matchSchoolByDomain,
  normalizeUrl,
  protocolDisplayName,
} from './protocol'
import {
  SCHOOLS,
  groupByLetter,
  isSelectable,
  statusBadge,
  type SchoolInfo,
} from './schools'

export interface UrlPick {
  /** 归一化后的可抓取 URL */
  url: string
  /** URL 判型结果;null = 交给 parser 兜底裁决 */
  protocol: string | null
  /** 注册域命中目录里的哪所学校;null = 自定义教务 */
  matched: SchoolInfo | null
}

export function SchoolSelectPage({
  onPickSchool,
  onPickUrl,
}: {
  onPickSchool: (school: SchoolInfo) => void
  onPickUrl: (pick: UrlPick) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => filterSchools(SCHOOLS, query), [query])
  const sections = useMemo(() => groupByLetter(filtered), [filtered])
  const isUrl = looksLikeUrl(query)
  const showIndexBar = query.trim() === '' && sections.length > 1

  const urlPick = useMemo<UrlPick | null>(() => {
    if (!isUrl) return null
    const raw = query.trim()
    const url = normalizeUrl(raw)
    return { url, protocol: detectProtocolFromUrl(url), matched: matchSchoolByDomain(url, SCHOOLS) }
  }, [isUrl, query])

  function scrollToLetter(letter: string) {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-letter="${letter}"]`)
    el?.scrollIntoView({ block: 'start' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 搜索框 + supportingText */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search_school_url')}
          aria-label={t('select_school')}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--md-outline)',
            background: 'var(--md-surface)',
            color: 'var(--md-on-surface)',
            font: 'inherit',
          }}
        />
        <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('school_pinyin_hint')}
        </span>
      </label>

      {/* 计数行 — 左侧恒为全量, 右侧仅搜索时出现 */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('school_count_total', { v1: SCHOOLS.length })}
        </span>
        <div style={{ flex: 1 }} />
        {query.trim() !== '' && (
          <span className="m3-body-small" style={{ color: 'var(--md-primary)' }}>
            {t('jw_matched_count', { v1: filtered.length })}
          </span>
        )}
      </div>

      {urlPick && <UrlDirectRow pick={urlPick} typedUrl={query.trim()} onPick={() => onPickUrl(urlPick)} />}

      <div style={{ display: 'flex', gap: 4 }}>
        <div
          ref={listRef}
          role="listbox"
          aria-label={t('select_school')}
          style={{ flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}
        >
          {filtered.length === 0 && !isUrl ? (
            <div className="m3-body-medium" style={{ padding: '32px 0', textAlign: 'center', color: 'var(--md-on-surface-variant)' }}>
              {SCHOOLS.length === 0 ? t('loading') : t('no_school_found')}
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.letter}>
                <div
                  data-letter={sec.letter}
                  className="m3-title-small"
                  style={{
                    fontWeight: 700,
                    color: 'var(--md-on-primary-container)',
                    background: 'var(--md-primary-container)',
                    padding: '2px 10px',
                    borderRadius: 8,
                    margin: '6px 0',
                    display: 'inline-block',
                  }}
                >
                  {sec.letter}
                </div>
                {sec.schools.map((s, i) => (
                  <div key={`${s.sortKey}-${s.name}-${i}`}>
                    <SchoolRow school={s} onPick={() => onPickSchool(s)} />
                    <HDiv />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {showIndexBar && (
          <div
            role="navigation"
            aria-label={t('select_school')}
            style={{ width: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, paddingTop: 6 }}
          >
            {sections.map((sec) => (
              <button
                key={sec.letter}
                type="button"
                onClick={() => scrollToLetter(sec.letter)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  font: 'inherit', fontSize: 11, lineHeight: '15px', color: 'var(--md-primary)',
                }}
              >
                {sec.letter}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 学校行 — 36dp primaryContainer 图标块 + 名称/协议两行; 不可点时降透明度 */
function SchoolRow({ school, onPick }: { school: SchoolInfo; onPick: () => void }) {
  const { t } = useTranslation()
  const clickable = isSelectable(school)
  const badge = statusBadge(school)
  return (
    <div
      role="option"
      aria-selected={false}
      aria-disabled={!clickable}
      aria-label={school.name}
      onClick={clickable ? onPick : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'var(--md-primary-container)', color: 'var(--md-on-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <IconSchool size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="m3-body-large" style={{ display: 'flex', alignItems: 'center' }}>
          {badge && (
            <>
              <span
                className="m3-label-small"
                style={{
                  background: badge.bg, color: badge.fg,
                  padding: '1px 6px', borderRadius: 6, flexShrink: 0,
                }}
              >
                {t(badge.labelKey)}
              </span>
              <span style={{ width: 6 }} />
            </>
          )}
          <span style={{ color: clickable ? 'var(--md-on-surface)' : 'var(--md-on-surface-variant)' }}>
            {school.name}
          </span>
        </div>
        {school.url.trim() !== '' && (
          <div
            className="m3-body-small"
            style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {protocolDisplayName(school.type)} · {displayHost(school.url)}
          </div>
        )}
      </div>
    </div>
  )
}

/** 直接输入网址行 — 命中目录 > 判出协议 > 自动检测 */
function UrlDirectRow({ pick, typedUrl, onPick }: { pick: UrlPick; typedUrl: string; onPick: () => void }) {
  const { t } = useTranslation()
  const hint = pick.matched
    ? t('url_match_school', { v1: pick.matched.name })
    : pick.protocol
      ? `${t('url_detected')}${protocolDisplayName(pick.protocol)}`
      : t('url_auto_detect')
  const hintIsPrimary = pick.matched !== null || pick.protocol !== null
  return (
    <div
      role="option"
      aria-selected={false}
      aria-label={t('url_direct_login')}
      onClick={onPick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', cursor: 'pointer',
        border: '1px solid var(--md-outline-variant)', borderRadius: 12, marginBottom: 4,
      }}
    >
      <div
        style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <IconLink size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="m3-body-large" style={{ color: 'var(--md-primary)' }}>{t('url_direct_login')}</div>
        <div
          className="m3-body-small"
          style={{ color: 'var(--md-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {typedUrl}
        </div>
        <div className="m3-body-small" style={{ color: hintIsPrimary ? 'var(--md-primary)' : 'var(--md-on-surface-variant)' }}>
          {hint}
        </div>
      </div>
    </div>
  )
}

/** 供 JwImportView 复用: URL 直连行落到哪个「学校」条目 (Android 同构兜底对象) */
export function urlPickToSchool(pick: UrlPick): SchoolInfo {
  if (pick.matched) {
    return { ...pick.matched, url: pick.url, type: pick.protocol ?? pick.matched.type }
  }
  return {
    sortKey: '',
    name: '自定义教务',
    url: pick.url,
    type: pick.protocol,
    aliases: [],
    sortKeyFull: '',
    status: 'supported',
  }
}
