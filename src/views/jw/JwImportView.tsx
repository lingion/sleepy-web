import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsScaffold } from '../mine/shared'
import { SchoolSelectPage } from './SchoolSelectPage'
import type { ProxyFetcher } from './proxyClient'
import { JW_WEB_UNSUPPORTED } from '../../domain/jw/webPolicy'

/** The Web catalogue has no capture, draft-resume, login, or database-write stage. */
export function JwImportView({ onBack }: { onBack: () => void; fetcher?: ProxyFetcher }) {
  const { t } = useTranslation()
  const [showNotice, setShowNotice] = useState(false)
  return <SettingsScaffold title={t('select_school')} onBack={onBack}>
    <SchoolSelectPage onPickSchool={() => setShowNotice(true)} onPickUrl={() => setShowNotice(true)} />
    {showNotice && <div className="m3-scrim-overlay" style={{position:'fixed',inset:0,zIndex:1000,display:'grid',placeItems:'center',padding:24,background:'color-mix(in srgb, var(--md-scrim) 45%, transparent)'}}>
      <div role="alertdialog" aria-modal="true" aria-label="教务导入" className="m3-card" style={{padding:24,maxWidth:420}}>
        <p>{JW_WEB_UNSUPPORTED}</p>
        <button type="button" autoFocus className="m3-btn-regular" onClick={() => setShowNotice(false)}>知道了</button>
      </div>
    </div>}
  </SettingsScaffold>
}
