/** SchoolSelectScreen.kt at Android 77b878fd. Fixed search/counts, one scroll body, separate alphabet rail. */
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { filterSchools } from './pinyin'
import { CityRecommendations } from './schoolLocation'
import { detectProtocolFromUrl, looksLikeUrl, matchSchoolByDomain, normalizeUrl } from './protocol'
import { SCHOOLS, groupByLetter, isSelectable, type SchoolInfo } from './schools'
import { CustomUrlEntryRow, SchoolDivider, SchoolRow, UrlDirectRow } from './SchoolRows'
import './SchoolSelectPage.css'

export interface UrlPick {
  url: string
  protocol: string | null
  matched: SchoolInfo | null
}

export function SchoolSelectPage({ onPickSchool, onPickUrl }: {
  onPickSchool: (school: SchoolInfo) => void
  onPickUrl: (pick: UrlPick) => void
}) {
  const { t } = useTranslation()
  const hintId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const prefixRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(640)
  const [prefixHeight, setPrefixHeight] = useState(0)
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({})
  const draggingIndex = useRef(false)
  const filtered = useMemo(() => filterSchools(SCHOOLS, query), [query])
  const sections = useMemo(() => groupByLetter(filtered), [filtered])
  const isUrl = looksLikeUrl(query)
  const searching = query.trim() !== ''
  const showIndexBar = !searching && sections.length > 1
  const hasList = filtered.length > 0
  const urlPick = useMemo<UrlPick | null>(() => {
    if (!isUrl) return null
    const url = normalizeUrl(query.trim())
    return { url, protocol: detectProtocolFromUrl(url), matched: matchSchoolByDomain(url, SCHOOLS) }
  }, [isUrl, query])
  const counts = useMemo(() => ({
    supported: SCHOOLS.filter(isSelectable).length,
    unverified: SCHOOLS.filter(s => s.status === 'unverified' || s.status === 'grad_unverified').length,
  }), [])

  // Include all catalogue rows in the virtual geometry. Long names are measured instead of clipped to 76px.
  const entries = useMemo(() => {
    let top = 0, position = 0
    return sections.flatMap(section => [
      { key: `header-${section.letter}`, letter: section.letter, school: null as SchoolInfo | null, position: 0, estimate: 42 },
      ...section.schools.map(school => ({ key: school.catalogId || `${school.sortKey}_${school.name}`, letter: section.letter,
        school, position: ++position, estimate: school.url.trim() ? 71 : 67 })),
    ]).map(row => {
      const height = rowHeights[row.key] ?? row.estimate
      const entry = { ...row, top, height }
      top += height
      return entry
    })
  }, [sections, rowHeights])
  const measureRow = useCallback((key: string, height: number) => {
    if (height <= 0) return
    setRowHeights(previous => previous[key] === height ? previous : { ...previous, [key]: height })
  }, [])

  useLayoutEffect(() => {
    const list = listRef.current, prefix = prefixRef.current
    if (!list || !prefix) { setPrefixHeight(0); return }
    let previousWidth = list.clientWidth
    const measure = () => {
      setPrefixHeight(prefix.getBoundingClientRect().height)
      if (list.clientHeight > 0) setViewportHeight(list.clientHeight)
      if (list.clientWidth !== previousWidth) {
        previousWidth = list.clientWidth
        setRowHeights({})
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    observer.observe(prefix)
    return () => observer.disconnect()
  }, [hasList, searching])

  const bodyTop = prefixHeight + 4
  const visible = entries.filter(row => row.top + row.height >= scrollTop - bodyTop - 180 && row.top < scrollTop - bodyTop + viewportHeight + 180)
  const totalHeight = entries.length ? entries[entries.length - 1].top + entries[entries.length - 1].height : 0
  let activeLetter: string | null = null
  for (const row of entries) {
    if (row.top > scrollTop - bodyTop + 1) break
    activeLetter = row.letter
  }
  function scrollToLetter(letter: string) {
    const row = entries.find(entry => !entry.school && entry.letter === letter)
    if (!row) return
    const top = bodyTop + row.top
    if (listRef.current) listRef.current.scrollTop = top
    setScrollTop(top)
  }
  function indexAt(clientY: number, bar: HTMLElement) {
    const bounds = bar.getBoundingClientRect()
    if (!bounds.height) return
    const ratio = Math.max(0, Math.min(.999, (clientY - bounds.top) / bounds.height))
    scrollToLetter(sections[Math.floor(ratio * sections.length)].letter)
  }

  return <div className="jw-school-select">
    <label className="jw-school-search">
      <input ref={searchRef} type="search" name="school" value={query} autoComplete="off" spellCheck={false}
        aria-label={t('select_school')} aria-describedby={hintId} placeholder={t('search_school_url')}
        onChange={event => {
          setQuery(event.target.value)
          setScrollTop(0)
          if (listRef.current) listRef.current.scrollTop = 0
        }} />
      <span id={hintId} className="jw-school-search-hint m3-body-small">{t('school_pinyin_hint')}</span>
    </label>
    <div className="jw-school-counts m3-body-small">
      <span>{t('jw_catalog_counts', { v1: SCHOOLS.length, v2: counts.supported, v3: counts.unverified })}</span>
      {searching && <span className="jw-school-matched" role="status">{t('jw_matched_count', { v1: filtered.length })}</span>}
    </div>
    {urlPick && <UrlDirectRow pick={urlPick} typedUrl={query.trim()} onPick={() => onPickUrl(urlPick)} />}
    {!hasList ? (!isUrl && <div className="jw-school-empty m3-body-medium">{t(SCHOOLS.length ? 'no_school_found' : 'loading')}</div>) :
      <div className="jw-school-viewport">
        <div ref={listRef} className="jw-school-scroll" onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
          <div ref={prefixRef} className="jw-school-prefix">
            {!searching && <CityRecommendations onPick={onPickSchool} />}
            <div className="jw-custom-url-entry">
              <CustomUrlEntryRow onClick={() => searchRef.current?.focus()} />
              <SchoolDivider />
            </div>
          </div>
          <div className="jw-school-window" role="listbox" aria-label={t('select_school')} style={{ height: totalHeight }}>
            {visible.map(row => <MeasuredRow key={row.key} rowKey={row.key} top={row.top} onMeasure={measureRow}>
              {row.school ? <>
                <SchoolRow school={row.school} onPick={() => onPickSchool(row.school!)} position={row.position} total={filtered.length} />
                <SchoolDivider />
              </> : <div className="jw-letter-header" data-letter={row.letter}><span className="m3-title-small">{row.letter}</span></div>}
            </MeasuredRow>)}
          </div>
        </div>
        {showIndexBar && <nav className="jw-school-index" aria-label={t('select_school')}
          onPointerDown={event => {
            if (event.button !== 0) return
            event.preventDefault()
            draggingIndex.current = true
            event.currentTarget.setPointerCapture?.(event.pointerId)
            indexAt(event.clientY, event.currentTarget)
          }}
          onPointerMove={event => { if (draggingIndex.current) indexAt(event.clientY, event.currentTarget) }}
          onPointerUp={() => { draggingIndex.current = false }}
          onPointerCancel={() => { draggingIndex.current = false }}>
          {sections.map(section => <button type="button" data-glass-plain key={section.letter}
            aria-current={activeLetter === section.letter ? 'location' : undefined}
            onClick={() => scrollToLetter(section.letter)}><span>{section.letter}</span></button>)}
        </nav>}
      </div>}
  </div>
}

function MeasuredRow({ rowKey, top, onMeasure, children }: { rowKey: string; top: number; onMeasure: (key: string, height: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    const measure = () => onMeasure(rowKey, row.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    return () => observer.disconnect()
  }, [rowKey, onMeasure])
  return <div ref={ref} className="jw-school-virtual-row" style={{ top }}>{children}</div>
}

export function urlPickToSchool(pick: UrlPick): SchoolInfo {
  if (pick.matched) return { ...pick.matched, url: pick.url, type: pick.protocol ?? pick.matched.type }
  return { sortKey: '', name: '自定义教务', url: pick.url, type: pick.protocol, aliases: [], sortKeyFull: '', status: 'supported' }
}
