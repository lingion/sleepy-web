import { useTranslation } from 'react-i18next'
import { IconLink, IconSchool } from '../../components/icons'
import { displayHost, protocolDisplayName } from './protocol'
import { hasUrl, isSupported, statusBadge, type SchoolInfo } from './schools'
import type { UrlPick } from './SchoolSelectPage'

/** Android SchoolRow: 36dp icon, 12dp gap, 14dp vertical and 4dp horizontal padding. */
export function SchoolRow({ school, onPick, position, total }: { school: SchoolInfo; onPick: () => void; position?: number; total?: number }) {
  const { t } = useTranslation()
  const badge = statusBadge(school)
  // Every unverified protocol in this frozen catalogue has an Android parser. This only controls tint.
  const availableOnAndroid = hasUrl(school) && (isSupported(school) || school.status === 'unverified' || school.status === 'grad_unverified')
  return <button type="button" role="option" aria-selected={false} aria-label={school.name}
    aria-posinset={position} aria-setsize={total} data-glass-plain className="jw-school-row"
    data-android-available={availableOnAndroid} onClick={onPick}>
    <span className="jw-row-icon"><IconSchool size={20} /></span>
    <span className="jw-row-copy">
      <span className="jw-school-name m3-body-large">
        {badge && <span className="jw-school-badge m3-label-small" style={{ background: badge.bg, color: badge.fg }}>
          {t(badge.labelKey)}{badge.secondaryLabelKey ? ` · ${t(badge.secondaryLabelKey)}` : ''}
        </span>}
        <span>{school.name}</span>
      </span>
      {school.url.trim() && <span className="jw-row-detail m3-body-small">{protocolDisplayName(school.type)} · {displayHost(school.url)}</span>}
    </span>
  </button>
}

export function CustomUrlEntryRow({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return <button type="button" className="jw-school-row jw-link-row" data-glass-plain onClick={onClick}>
    <span className="jw-row-icon"><IconLink size={20} /></span>
    <span className="jw-row-copy">
      <span className="jw-school-name m3-body-large">{t('custom_url_entry')}</span>
      <span className="jw-row-detail m3-body-small">{t('custom_url_entry_hint')}</span>
    </span>
  </button>
}

export function UrlDirectRow({ pick, typedUrl, onPick }: { pick: UrlPick; typedUrl: string; onPick: () => void }) {
  const { t } = useTranslation()
  const hint = pick.matched ? t('url_match_school', { v1: pick.matched.name })
    : pick.protocol ? `${t('url_detected')} ${protocolDisplayName(pick.protocol)}` : t('url_auto_detect')
  return <button type="button" role="option" aria-selected={false} aria-label={t('url_direct_login')}
    className="jw-school-row jw-link-row jw-url-direct" data-glass-plain onClick={onPick}>
    <span className="jw-row-icon"><IconLink size={20} /></span>
    <span className="jw-row-copy">
      <span className="jw-school-name m3-body-large">{t('url_direct_login')}</span>
      <span className="jw-row-detail m3-body-small">{typedUrl}</span>
      <span className="jw-url-hint m3-label-small" data-detected={!!(pick.matched || pick.protocol)}>{hint}</span>
    </span>
  </button>
}

export function SchoolDivider() { return <div className="jw-school-divider" aria-hidden="true" /> }
