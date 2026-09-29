import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initI18n } from './i18n'
import { seedSampleTable } from './data/sampleTable'
import { usePrefsStore } from './state/prefsStore'
import { loadPublicSchedule, publicScheduleEnabled } from './publicSchedule'
import { publicAccessGranted, publicAccessRequired, grantPublicAccess } from './publicAccess'
import './theme/global.css'

function PublicAccessGate({ onGranted }: { onGranted: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState(false)
  return (
    <main style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--md-background)' }}>
      <form onSubmit={(event) => { event.preventDefault(); void grantPublicAccess(key).then((ok) => { setError(!ok); if (ok) onGranted() }) }} style={{ width: 'min(100%, 360px)', display: 'grid', gap: 16 }}>
        <h1 className="m3-headline-small">Sleepy Web</h1>
        <label className="m3-body-medium" htmlFor="public-access-key">访问密钥</label>
        <input id="public-access-key" autoFocus type="password" value={key} onChange={(event) => setKey(event.target.value)} style={{ minHeight: 48, padding: '0 12px', borderRadius: 8, border: '1px solid var(--md-outline)' }} />
        {error && <div role="alert" className="m3-body-small" style={{ color: 'var(--md-error)' }}>密钥不正确</div>}
        <button type="submit" className="m3-button-filled">进入课表</button>
      </form>
    </main>
  )
}

function Bootstrap() {
  const load = usePrefsStore((s) => s.load)
  const loaded = usePrefsStore((s) => s.loaded)
  const [authorized, setAuthorized] = useState(!publicAccessRequired() || publicAccessGranted())
  const [publicLoaded, setPublicLoaded] = useState(!publicScheduleEnabled())

  useEffect(() => {
    if (!authorized) return
    initI18n('system')
    const prepare = publicScheduleEnabled() ? loadPublicSchedule() : seedSampleTable()
    // 公开课表或示例课表落库后再载入偏好，首屏只读取完整状态。
    void prepare.finally(() => {
      void load().finally(() => setPublicLoaded(true))
    })
  }, [authorized, load])

  if (!authorized) return <PublicAccessGate onGranted={() => setAuthorized(true)} />
  if (!loaded || !publicLoaded) return null
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
)
