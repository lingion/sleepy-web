/**
 * MineView — 我的 tab 薄路由。页面本体已按页拆到 src/views/mine/*, 本文件只做:
 * 主页/二级页 page 状态机 + 返回栈接线 (MainActivity pushOverlay/popOverlay 同构) + 路由表。
 * 导出签名 (navExtraBottom) 保持不变 → App.tsx / backStack.ts 无需改动。
 *
 * 返回栈语义: 进页 push(浏览器返回可出栈), 返回按钮 pop(每层只弹自己 — v7.10.8 修复语义)。
 * popstate 只收回属于本页的层;customTheme 嵌在外观下 → 弹回 appearance;
 * jwImport 是 mine 顶层覆盖层 → 弹回 main。editTable 由 AllTablesPage 内部自管, 不在此列。
 */

import { useEffect, useState } from 'react'
import { installBackHandler, useBackStack, type BackKey } from '../state/backStack'
import { ExportView } from './ExportView'
import { MineHome } from './mine/MineHome'
import { GeneralSettingsPage } from './mine/GeneralSettingsPage'
import { AppearancePage } from './mine/AppearancePage'
import { HolidayPage } from './mine/HolidayPage'
import { ReminderPage } from './mine/ReminderPage'
import { AboutPage } from './mine/AboutPage'
import { AllTablesPage } from './mine/AllTablesPage'
import { CustomThemeEditorView } from './mine/CustomThemeEditorView'
import { JwImportView } from './jw/JwImportView'

type Page =
  | 'main' | 'general' | 'appearance' | 'holiday' | 'export' | 'alltables' | 'about' | 'reminder'
  | 'customTheme' | 'jwImport'

/** MineView 自己拥有的返回层 — popstate 只在这些 key 弹出时收回页面状态 */
const MINE_KEYS = new Set<string>(['general', 'appearance', 'export', 'allTables', 'about', 'reminder', 'license', 'jwImport'])

export function MineView({ navExtraBottom = 0 }: { navExtraBottom?: number }) {
  const [page, setPage] = useState<Page>('main')
  // 编辑器微调目标: null = 新建 (Android editingTheme 同构)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const back = useBackStack((s) => s.pop)
  const push = useBackStack((s) => s.push)

  // 浏览器返回时同步本地 page state;否则只弹历史而页面仍停在二级页。
  useEffect(() => installBackHandler((key) => {
    // 只收回属于本页的层 — 别的 tab 的弹层 (课程详情/周次跳转…) 弹出时不得误跳
    if (key === 'holiday') setPage('general')
    else if (key === 'customTheme') setPage('appearance')
    else if (MINE_KEYS.has(key ?? '')) setPage('main')
  }), [])

  // 二级页导航接线返回栈 (MainActivity pushOverlay/popOverlay 同构):
  // 进页 push(浏览器返回可出栈), 返回按钮 pop(每层只弹自己 — v7.10.8 修复语义)。
  const go = (p: Page, key: BackKey) => {
    push(key)
    setPage(p)
  }
  const backTo = (p: Page) => {
    back()
    setPage(p)
  }

  switch (page) {
    case 'general':
      return (
        <GeneralSettingsPage
          onBack={() => backTo('main')}
          onOpenHoliday={() => go('holiday', 'holiday')}
        />
      )
    case 'holiday':
      // HolidaySettingsScreen 的 back 回通用设置页(GSS 的二级页), 非回主页
      return <HolidayPage onBack={() => backTo('general')} />
    case 'appearance':
      return (
        <AppearancePage
          onBack={() => backTo('main')}
          onOpenThemeEditor={(id) => {
            setEditingThemeId(id)
            go('customTheme', 'customTheme')
          }}
        />
      )
    case 'customTheme':
      return <CustomThemeEditorView onBack={() => backTo('appearance')} editingId={editingThemeId} />
    case 'jwImport':
      return <JwImportView onBack={() => backTo('main')} />
    case 'export':
      return <ExportView onBack={() => backTo('main')} />
    case 'alltables':
      return <AllTablesPage onBack={() => backTo('main')} />
    case 'about':
      return <AboutPage onBack={() => backTo('main')} />
    case 'reminder':
      return <ReminderPage onBack={() => backTo('main')} />
    default:
      return (
        <MineHome
          navExtraBottom={navExtraBottom}
          onOpenGeneral={() => go('general', 'general')}
          onOpenAppearance={() => go('appearance', 'appearance')}
          onOpenExport={() => go('export', 'export')}
          onOpenAllTables={() => go('alltables', 'allTables')}
          onOpenAbout={() => go('about', 'about')}
          onOpenReminder={() => go('reminder', 'reminder')}
        />
      )
  }
}
