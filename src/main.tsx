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
  const [publicError, setPublicError] = useState<string | null>(null)

  useEffect(() => {
    if (!authorized) return
    initI18n('system')
    const prepare = publicScheduleEnabled() ? loadPublicSchedule() : seedSampleTable()
    // 公开课表或示例课表落库后再载入偏好，首屏只读取完整状态。
    void prepare
      .catch((error) => {
        setPublicError(error instanceof Error ? error.message : String(error))
        throw error
      })
      .then(() => load())
      .then(() => setPublicLoaded(true), () => setPublicLoaded(true))
  }, [authorized, load])

  if (!authorized) return <PublicAccessGate onGranted={() => setAuthorized(true)} />
  if (publicError) {
    return (
      <main style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--md-background)' }}>
        <div role="alert" className="m3-card" style={{ maxWidth: 520, padding: 24 }}>
          <h1 className="m3-headline-small">课表加载失败</h1>
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
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 注册失败不影响课表主功能 */
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
)
