import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowBack } from '../../components/icons'
import { SchoolSelectPage } from './SchoolSelectPage'
import type { ProxyFetcher } from './proxyClient'
import { JW_WEB_UNSUPPORTED } from '../../domain/jw/webPolicy'

/** The Web catalogue has no capture, draft-resume, login, or database-write stage. */
export function JwImportView({ onBack }: { onBack: () => void; fetcher?: ProxyFetcher }) {
  const { t } = useTranslation()
  const [showNotice, setShowNotice] = useState(false)
  const dismissRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  useEffect(() => { if (showNotice) dismissRef.current?.focus() }, [showNotice])
  function notice() {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setShowNotice(true)
  }
  function dismiss() { setShowNotice(false); triggerRef.current?.focus() }
  return <div className="jw-import-view">
    <header className="jw-import-topbar">
      <button data-glass-role="regular" data-glass-icon="true" type="button" className="m3-icon-button" aria-label={t('back')} onClick={onBack}><IconArrowBack size={24} /></button>
      <h1 className="m3-title-large">{t('select_school')}</h1>
    </header>
    <SchoolSelectPage onPickSchool={notice} onPickUrl={notice} />
    {showNotice && <div className="m3-scrim-overlay jw-unsupported-scrim">
      <div data-glass-role="alert" data-glass-motion="static" role="alertdialog" aria-modal="true" aria-label="教务导入" className="jw-unsupported-dialog"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); dismiss() }
          if (event.key === 'Tab') { event.preventDefault(); dismissRef.current?.focus() }
        }}>
        <p className="m3-body-medium">{JW_WEB_UNSUPPORTED}</p>
        <div className="jw-unsupported-actions"><button data-glass-role="regular" ref={dismissRef} type="button" className="m3-button-text" onClick={dismiss}>知道了</button></div>
      </div>
    </div>}
  </div>
}
