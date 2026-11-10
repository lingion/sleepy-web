/**
 * MineView — 我的 tab 薄路由。页面本体已按页拆到 src/views/mine/*, 本文件只做:
 * 主页/二级页 page 状态机 + 返回栈接线 (MainActivity pushOverlay/popOverlay 同构) + 路由表。
 * 导出签名 (navExtraBottom) 保持不变 → App.tsx / backStack.ts 无需改动。
 *
 * 返回栈语义: 进页 push(浏览器返回可出栈), 返回按钮 pop(每层只弹自己 — v7.10.8 修复语义)。
 * popstate 只收回属于本页的层;customTheme 嵌在外观下 → 弹回 appearance;
 * editTable 由 AllTablesPage 内部自管, 不在此列。教务导入入口在管理页 (Android ImportSheet 同构)。
 */

import { startTransition, useEffect, useState } from 'react'
import { lazyPage, PageSuspense } from '../startup/lazyPage'
import { preparePageTranslations } from '../i18n'
import { chainFromHash, installBackHandler, useBackStack, type BackKey } from '../state/backStack'
const ExportView = lazyPage(() => import('./ExportView').then(module => ({ default: module.ExportView })))
import { MineHome } from './mine/MineHome'
const GeneralSettingsPage = lazyPage(() => import('./mine/GeneralSettingsPage').then(module => ({ default: module.GeneralSettingsPage })))
const AppearancePage = lazyPage(() => import('./mine/AppearancePage').then(module => ({ default: module.AppearancePage })))
const HolidayPage = lazyPage(() => import('./mine/HolidayPage').then(module => ({ default: module.HolidayPage })))
const ReminderPage = lazyPage(() => import('./mine/ReminderPage').then(module => ({ default: module.ReminderPage })))
const TableReminderPage = lazyPage(() => import('./mine/TableReminderPage').then(module => ({ default: module.TableReminderPage })))
const AboutPage = lazyPage(() => import('./mine/AboutPage').then(module => ({ default: module.AboutPage })))
const LicensePage = lazyPage(() => import('./mine/LicensePage').then(module => ({ default: module.LicensePage })), preparePageTranslations)
const AllTablesPage = lazyPage(() => import('./mine/AllTablesPage').then(module => ({ default: module.AllTablesPage })))
const PeriodTablesPage = lazyPage(() => import('./mine/PeriodTablesPage').then(module => ({ default: module.PeriodTablesPage })))
const CustomThemeEditorView = lazyPage(() => import('./mine/CustomThemeEditorView').then(module => ({ default: module.CustomThemeEditorView })))
const CourseListPage = lazyPage(() => import('./mine/CourseListPage').then(module => ({ default: module.CourseListPage })))
const PeriodHeaderSettingsPage = lazyPage(() => import('./mine/PeriodHeaderSettingsPage').then(module => ({ default: module.PeriodHeaderSettingsPage })))
const WidgetGalleryPage = lazyPage(() => import('./mine/WidgetGalleryPage').then(module => ({ default: module.WidgetGalleryPage })))
const WidgetManagementPage = lazyPage(() => import('./mine/WidgetGalleryPage').then(module => ({ default: module.WidgetManagementPage })))
const WidgetSettingsPage = lazyPage(() => import('./mine/WidgetSettingsPage').then(module => ({ default: module.WidgetSettingsPage })))
const ScheduleDisplayPage = lazyPage(() => import('./mine/ScheduleDisplayPage').then(module => ({ default: module.ScheduleDisplayPage })))

type Page =
  | 'main' | 'general' | 'appearance' | 'holiday' | 'export' | 'alltables' | 'about' | 'reminder' | 'license'
  | 'widgetGallery' | 'widgetManagement' | 'backup' | 'widgets' | 'customTheme' | 'periodTables' | 'courseList' | 'periodHeader' | 'scheduleDisplay' | 'tableReminder'

/** MineView 自己拥有的返回层 — popstate 只在这些 key 弹出时收回页面状态 */
const MINE_KEYS = new Set<string>(['backup', 'widgets', 'general', 'appearance', 'export', 'allTables', 'periodTables', 'about', 'reminder', 'license', 'courseList', 'periodHeader', 'scheduleDisplay'])

/** 刷新/直达恢复: 栈链栈顶 → 初始 page (App 挂载 effect 同步 restoreChain 重建历史) */
export function minePageFromHash(hash: string): Page {
  const chain = chainFromHash(hash)
  switch (chain[chain.length - 1]) {
    case 'backup': return 'backup'
    case 'widgets': return 'widgets'
    case 'widgetManagement': return 'widgetManagement'
    case 'widgetGallery': return 'widgetGallery'
    case 'general': return 'general'
    case 'holiday': return 'holiday'
    case 'appearance': return 'appearance'
    case 'customTheme': return 'customTheme'
    case 'about': return 'about'
    case 'license': return 'license'
    case 'reminder': return 'reminder'
    case 'tableReminder': return 'tableReminder'
    case 'periodTables': return 'periodTables'
    case 'courseList': return 'courseList'
    case 'periodHeader': return 'periodHeader'
    case 'scheduleDisplay': return 'scheduleDisplay'
    default: return 'main'
  }
}

/** Bootstrap waits for the actual deep-link page, not every settings page. */
export async function preloadMineRoute(hash: string): Promise<void> {
  const pages = {
    main: null, general: GeneralSettingsPage, appearance: AppearancePage,
    holiday: HolidayPage, export: ExportView, alltables: AllTablesPage,
    about: AboutPage, reminder: ReminderPage, license: LicensePage,
    widgetGallery: WidgetGalleryPage, widgetManagement: WidgetManagementPage,
    backup: GeneralSettingsPage, widgets: WidgetSettingsPage,
    customTheme: CustomThemeEditorView, periodTables: PeriodTablesPage,
    courseList: CourseListPage, periodHeader: PeriodHeaderSettingsPage,
    scheduleDisplay: ScheduleDisplayPage, tableReminder: TableReminderPage,
  }
  await pages[minePageFromHash(hash)]?.preload()
}

export function MineView(props: { navExtraBottom?: number }) {
  return <PageSuspense><MineContent {...props} /></PageSuspense>
}

function MineContent({ navExtraBottom = 0 }: { navExtraBottom?: number }) {
  const [page, setPage] = useState<Page>(() => minePageFromHash(window.location.hash))
  // 编辑器微调目标: null = 新建 (Android editingTheme 同构)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null)
  const back = useBackStack((s) => s.pop)
  const push = useBackStack((s) => s.push)

  // 浏览器返回时同步本地 page state;否则只弹历史而页面仍停在二级页。
  useEffect(() => installBackHandler((key) => startTransition(() => {
    // 只收回属于本页的层 — 别的 tab 的弹层 (课程详情/周次跳转…) 弹出时不得误跳
    if (key === 'holiday') {
      const parent = useBackStack.getState().peek()
      setPage(parent === 'reminder' ? 'reminder' : parent === 'general' ? 'general' : 'main')
    }
    else if (key === 'widgetGallery') setPage('widgetManagement')
    else if (key === 'widgetManagement') setPage('widgets')
    else if (key === 'tableReminder') setPage('reminder')
    else if (key === 'customTheme') setPage('appearance')
    else if (key === 'license') setPage('about')
    else if (key === 'periodTableEdit') setPage('periodTables')
    else if (key === 'periodHeader') setPage('scheduleDisplay')
    else if (key === 'scheduleDisplay') setPage(useBackStack.getState().peek() === 'widgets' ? 'widgets' : 'appearance')
    else if (MINE_KEYS.has(key ?? '')) setPage('main')
  })), [])

  // 二级页导航接线返回栈 (MainActivity pushOverlay/popOverlay 同构):
  // 进页 push(浏览器返回可出栈), 返回按钮 pop(每层只弹自己 — v7.10.8 修复语义)。
  const go = (p: Page, key: BackKey) => {
    push(key)
    startTransition(() => setPage(p))
  }
  const backTo = (p: Page) => {
    back()
    startTransition(() => setPage(p))
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
      return <HolidayPage onBack={() => {
        const parent = useBackStack.getState().stack.at(-2)
        backTo(parent === 'reminder' ? 'reminder' : parent === 'general' ? 'general' : 'main')
      }} />
    case 'appearance':
      return (
        <AppearancePage
          onBack={() => backTo('main')}
          onOpenThemeEditor={(id) => {
            setEditingThemeId(id)
            go('customTheme', 'customTheme')
          }}
          onOpenScheduleDisplay={() => go('scheduleDisplay', 'scheduleDisplay')}
        />
      )
    case 'customTheme':
      return <CustomThemeEditorView onBack={() => backTo('appearance')} editingId={editingThemeId} />
    case 'export':
      return <ExportView onBack={() => backTo('main')} />
    case 'alltables':
      return <AllTablesPage onBack={() => backTo('main')} />
    case 'periodTables':
      return <PeriodTablesPage onBack={() => backTo('main')} />
    case 'about':
      return <AboutPage onBack={() => backTo('main')} onOpenLicense={() => go('license', 'license')} />
    case 'license':
      return <LicensePage onBack={() => backTo('about')} />
    case 'reminder':
      return <ReminderPage onBack={() => backTo('main')} onOpenTableReminder={() => go('tableReminder', 'tableReminder')} onOpenHoliday={() => go('holiday', 'holiday')} />
    case 'tableReminder':
      return <TableReminderPage onBack={() => backTo('reminder')} />
    case 'courseList':
      return <CourseListPage onBack={() => backTo('main')} />
    case 'periodHeader':
      return <PeriodHeaderSettingsPage onBack={() => backTo('scheduleDisplay')} />
    case 'scheduleDisplay':
      return <ScheduleDisplayPage onBack={() => backTo(useBackStack.getState().stack[useBackStack.getState().stack.length - 2] === 'widgets' ? 'widgets' : 'appearance')} onOpenPeriodHeader={() => go('periodHeader', 'periodHeader')} />
    case 'backup':
      return <GeneralSettingsPage onBack={() => backTo('main')} backupOnly />
    case 'widgetManagement':
      return <WidgetManagementPage onBack={() => backTo('widgets')} onOpenGallery={() => go('widgetGallery', 'widgetGallery')} />
    case 'widgetGallery':
      return <WidgetGalleryPage onBack={() => backTo('widgetManagement')} />
    case 'widgets':
      return <WidgetSettingsPage onOpenManagement={() => go('widgetManagement', 'widgetManagement')} onBack={() => backTo('main')} onOpenScheduleDisplay={() => go('scheduleDisplay', 'scheduleDisplay')} />
    default:
      return (
        <MineHome
          navExtraBottom={navExtraBottom}
          onOpenHoliday={() => go('holiday', 'holiday')}
          onOpenBackup={() => go('backup', 'backup')}
          onOpenWidgets={() => go('widgets', 'widgets')}
          onOpenGeneral={() => go('general', 'general')}
          onOpenAppearance={() => go('appearance', 'appearance')}
          onOpenExport={() => go('export', 'export')}
          onOpenAllTables={() => go('alltables', 'allTables')}
          onOpenPeriodTables={() => go('periodTables', 'periodTables')}
          onOpenAbout={() => go('about', 'about')}
          onOpenReminder={() => go('reminder', 'reminder')}
          onOpenCourseList={() => go('courseList', 'courseList')}
        />
      )
  }
}
