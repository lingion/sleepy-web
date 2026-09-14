/**
 * JwImportView — 教务导入 (#/我的/教务导入)。
 * 占位 stub: 渲染带标题的空容器, 后续由教务抓取区 agent 替换为真正的导入流程。
 * 路由已在 backStack (jwImport) 与 MineView 路由表预注册, 触发入口待抓取区补齐后接入。
 */

import { useTranslation } from 'react-i18next'
import { SettingsScaffold } from '../mine/shared'

export function JwImportView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <SettingsScaffold title={t('jw_import_view_title')} onBack={onBack}>
      <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('mine_todo_placeholder', { defaultValue: '功能开发中 · Coming soon' })}
      </div>
    </SettingsScaffold>
  )
}

