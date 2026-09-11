import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initI18n } from './i18n'
import { usePrefsStore } from './state/prefsStore'
import './theme/global.css'

function Bootstrap() {
  const load = usePrefsStore((s) => s.load)
  const loaded = usePrefsStore((s) => s.loaded)

  useEffect(() => {
    initI18n('system')
    void load()
  }, [load])

  if (!loaded) return null
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
)
