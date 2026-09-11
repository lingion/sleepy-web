/**
 * ManageView — 课表管理 tab 骨架 (Week3 完善课表列表/新建/切换)
 */

import { useTranslation } from 'react-i18next'

export function ManageView() {
  const { t } = useTranslation()
  return (
    <div style={{ padding: 16 }}>
      <h1 className="m3-title-large" style={{ marginTop: 0 }}>
        {t('nav_manage')}
      </h1>
    </div>
  )
}
