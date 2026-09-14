import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initI18n } from './i18n'
import { seedSampleTable } from './data/sampleTable'
import { usePrefsStore } from './state/prefsStore'
import './theme/global.css'

function Bootstrap() {
  const load = usePrefsStore((s) => s.load)
  const loaded = usePrefsStore((s) => s.loaded)

  useEffect(() => {
    initI18n('system')
    // 首次打开 seed 示例课表 (空库才 seed; 标记防删后复活) — 先于 prefs load
    void seedSampleTable().finally(() => void load())
  }, [load])

  if (!loaded) return null
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
)
