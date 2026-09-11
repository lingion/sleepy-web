/**
 * TodayView — 今日 tab 骨架 (Week3 完善今日课程卡)
 */

import { useTranslation } from 'react-i18next'

export function TodayView() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 16 }}>
      <h1 className="m3-title-large" style={{ marginTop: 0 }}>
        {t('nav_today')}
      </h1>
    </div>
  )
}
