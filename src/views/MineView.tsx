/**
 * MineView — 我的 tab 骨架 (Week4 完善设置项)
 */

import { useTranslation } from 'react-i18next'

export function MineView() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 16 }}>
      <h1 className="m3-title-large" style={{ marginTop: 0 }}>
        {t('nav_mine')}
      </h1>
    </div>
  )
}
