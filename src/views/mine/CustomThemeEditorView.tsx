/**
 * CustomThemeEditorView — 自定义主题编辑器 (#/我的/外观/自定义主题)。
 * 占位 stub: 渲染带标题的空容器, 后续由主题区 agent 替换为真正的 CustomThemeEditor。
 * 路由已在 backStack (customTheme) 与 MineView 路由表预注册, 触发入口待主题区补齐后接入。
 */

import { useTranslation } from 'react-i18next'
import { SettingsScaffold } from './shared'

export function CustomThemeEditorView({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <SettingsScaffold title={t('custom_theme_editor_title')} onBack={onBack}>
      <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('mine_todo_placeholder', { defaultValue: '功能开发中 · Coming soon' })}
      </div>
    </SettingsScaffold>
  )
}
