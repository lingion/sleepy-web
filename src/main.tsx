import { prepareStartupData } from './startup/data'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { flushSync } from 'react-dom'
import { App, preloadInitialRoute } from './App'
import { createStartup } from './startup/prepare'
import { usePrefsStore } from './state/prefsStore'
import { publicAccessGranted, publicAccessRequired, grantPublicAccess } from './publicAccess'
import './theme/global.css'
import { appAssetUrl } from './appAssetUrl'
import { discardInitialScheduleData } from './startup/scheduleData'

function PublicAccessGate({ onGranted }: { onGranted: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState(false)
  return (
    <main style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--md-background)' }}>
      <form onSubmit={(event) => { event.preventDefault(); void grantPublicAccess(key).then((ok) => { setError(!ok); if (ok) onGranted() }) }} style={{ width: 'min(100%, 360px)', display: 'grid', gap: 16 }}>
        <h2 className="m3-headline-small">Sleepy Web</h2>
        <label className="m3-body-medium" htmlFor="public-access-key">访问密钥</label>
        <input id="public-access-key" autoFocus type="password" value={key} onChange={(event) => setKey(event.target.value)} style={{ minHeight: 48, padding: '0 12px', borderRadius: 8, border: '1px solid var(--md-outline)' }} />
        {error && <div role="alert" className="m3-body-small" style={{ color: 'var(--md-error)' }}>密钥不正确</div>}
        <button type="submit" className="m3-button-filled">进入课表</button>
      </form>
    </main>
  )
}

// Route code and persisted data prepare concurrently. StrictMode joins this
// promise instead of reseeding the database or downloading the public file twice.
export const prepareStartup = createStartup({
  prepareData: prepareStartupData,
  prepareRoute: () => preloadInitialRoute(),
})
if (!publicAccessRequired() || publicAccessGranted()) void prepareStartup().catch(() => {})

export function Bootstrap({ initialError = null }: { initialError?: string | null } = {}) {
  const loaded = usePrefsStore((s) => s.loaded)
  const [authorized, setAuthorized] = useState(!publicAccessRequired() || publicAccessGranted())
  const [publicLoaded, setPublicLoaded] = useState(prepareStartup.isReady)
  const [publicError, setPublicError] = useState<string | null>(initialError)

  useEffect(() => {
    if (publicLoaded) discardInitialScheduleData()
  }, [publicLoaded])

  useEffect(() => {
    if (!authorized || publicLoaded || publicError) return
    let active = true
    void prepareStartup().then(() => {
      if (active) setPublicLoaded(true)
    }, error => {
      if (active) setPublicError(error instanceof Error ? error.message : String(error))
    })
    return () => { active = false }
  }, [authorized, publicLoaded, publicError])

  if (!authorized) return <PublicAccessGate onGranted={() => setAuthorized(true)} />
  if (publicError) {
    return (
      <main style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--md-background)' }}>
        <div role="alert" className="m3-card" style={{ maxWidth: 520, padding: 24 }}>
          <h2 className="m3-headline-small">课表加载失败</h2>
          <p className="m3-body-medium">请检查部署中的 schedule.sleepy 文件和访问路径。</p>
          <p className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', wordBreak: 'break-word' }}>{publicError}</p>
          <button type="button" className="m3-button-filled" onClick={() => window.location.reload()}>重新加载</button>
        </div>
      </main>
    )
  }
  if (!loaded || !publicLoaded) return null
  return <App />
}

// 通知点击聚焦等事件由 SW 承接; https/localhost 才注册 (http 局域网调试跳过)。
if ('serviceWorker' in navigator && (window.isSecureContext || import.meta.env.DEV)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(appAssetUrl('sw.js')).catch(() => {
      /* 注册失败不影响课表主功能 */
    })
  })
}

const root = ReactDOM.createRoot(document.getElementById('root')!)
const initialPage = (initialError: string | null = null) => <React.StrictMode><Bootstrap initialError={initialError} /></React.StrictMode>
const commitInitialPage = (error: string | null = null) => {
  // This continuation performs real rendering only. No top-level await or load
  // listener waits for startup, and the complete boot snapshot is still alive.
  flushSync(() => root.render(initialPage(error)))
}

if (publicAccessRequired() && !publicAccessGranted()) {
  // The gate remains usable before any authorized disk or public-file work.
  root.render(initialPage())
} else if (prepareStartup.isReady()) {
  commitInitialPage()
} else {
  // Avoid committing a null Bootstrap and then enqueueing the real first page
  // as a separate concurrent update after database/language preparation.
  void prepareStartup().then(() => commitInitialPage(), error => {
    commitInitialPage(error instanceof Error ? error.message : String(error))
  })
}
