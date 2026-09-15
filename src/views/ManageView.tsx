/**
 * ManageView — Kotlin ManagementPage.kt 1:1 移植
 * 标题(headlineMedium+Medium) + 当前课表摘要卡(标签/名称/startDate|第N周|N门课)
 * + 5 张 ManageCard(导入/新建/手动添加/编辑当前/导出, 44dp 图标方块布局)
 * 管理页只承载 Android ManagementPage.kt 的当前课表摘要与 5 张管理卡；
 * 全部课表列表属于 Mine → AllTablesScreen，不能嵌入本页。
 * 新建动线 = MainActivity createEmptyTable(commitSelection=false) 1:1:
 * 默认N 查重 + 上周一开学日 + 首表自动置默认, 建后跳 EditTable 让用户立即命名。
 * 重命名不入本页 — Android 真源重命名仅发生在 EditTableScreen(名称字段), 经编辑卡完成。
 */

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { installBackHandler, useBackStack, chainFromHash, type BackKey } from '../state/backStack'
import { abandonPendingTable, beginNewTable, usePendingTable } from '../state/pendingTable'
import { ImportView } from './ImportView'
import { JwImportView } from './jw/JwImportView'
import { EditTableView } from './EditTableView'
import { AddCourseView } from './AddCourseView'
import { ExportView } from './ExportView'
import { computeCurrentWeek } from './ScheduleView'
import {
  IconFileUpload,
  IconAutoAwesome,
  IconAdd,
  IconEdit,
  IconShare,
} from '../components/icons'

type IconComponent = ComponentType<{ size?: number; color?: string }>

export function ManageView({ navExtraBottom = 0 }: { navExtraBottom?: number }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), [])
  const defaultTable = tables?.find((x) => x.isDefault === 1)
  const currentCourseCount = useLiveQuery(
    () => (defaultTable ? db.courses.where('tableId').equals(defaultTable.id).count() : Promise.resolve(0)),
    [defaultTable?.id],
  )
  const [importing, setImporting] = useState(false)
  // 教务导入层 — 深链直达时初始即开 (restoreChain 已建栈);旧 #/我的/教务导入 别名同判
  const [jwImporting, setJwImporting] = useState(() => {
    const chain = chainFromHash(window.location.hash)
    return chain[chain.length - 1] === 'jwImport'
  })
  const [addingCourse, setAddingCourse] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const back = useBackStack((s) => s.pop)
  const push = useBackStack((s) => s.push)
  const replace = useBackStack((s) => s.replace)
  const pendingId = usePendingTable((s) => s.pendingId)

  const list = tables ?? []

  // 浏览器返回时同步本地 page state (popstate 广播 popped key → 收回本视图的层)。
  useEffect(() => installBackHandler((key) => {
    if (key === 'addCourse') { setImporting(false); setAddingCourse(false) }
    else if (key === 'jwImport') setJwImporting(false)
    else if (key === 'export') setExporting(false)
    else if (key === 'editTable') setEditingId(null)
  }), [])

  // 二级页 push 入栈 (带 hash 地址, 浏览器返回可弹); 返回按钮 pop 出栈。
  // 🚫 渲染期 push: 视图每次重渲染都会再入一层 (导入写库 → liveQuery 重渲染 →
  // 栈里两个 addCourse → 返回一次弹不干净, 底栏卡在隐藏态)。只在事件处理器里入栈。
  const open = (key: BackKey, show: () => void) => {
    push(key)
    show()
  }
  const leave = () => back()

  if (jwImporting) {
    return <JwImportView onBack={() => { leave(); setJwImporting(false) }} />
  }
  if (importing) {
    return (
      <ImportView
        onDone={() => { leave(); setImporting(false) }}
        // 教务直连 — Android「关 sheet + startActivity」: 导入层原地换成教务层,
        // 历史条目不新增 → 教务页返回直达管理页 (不会退回导入页)。
        onJwImport={() => { replace('jwImport'); setImporting(false); setJwImporting(true) }}
      />
    )
  }
  if (addingCourse) {
    return (
      <AddCourseView
        onBack={() => { leave(); setAddingCourse(false) }}
        onSaved={() => { leave(); setAddingCourse(false) }}
      />
    )
  }
  if (exporting) {
    return <ExportView onBack={() => { leave(); setExporting(false) }} />
  }
  if (editingId !== null) {
    return (
      <EditTableView
        tableId={editingId}
        pendingNewTableId={pendingId}
        onBack={() => { leave(); setEditingId(null) }}
        onDiscardPending={() => { void abandonPendingTable(); leave(); setEditingId(null) }}
        onSaved={() => { leave(); setEditingId(null) }}
        onDeleted={() => { leave(); setEditingId(null) }}
      />
    )
  }

  // 新建动线 — MainActivity:311-317 同款: 建空表(不切选中) + 记住原默认表 + 跳 EditTable,
  // 用户没保存就返回 → discardNewTable 删表落回原表 (pendingTable 状态机)。
  const handleNewTable = () => {
    void beginNewTable().then((newId) => open('editTable', () => setEditingId(newId)))
  }

  return (
    <div
      style={{
        padding: 16,
        paddingBottom: 16 + navExtraBottom,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: 'var(--md-background)',
      }}
    >
      <h1
        className="m3-headline-medium"
        style={{ margin: 0, fontSize: 28, lineHeight: '36px', fontWeight: 500, color: 'var(--md-on-background)' }}
      >
        {t('tab_manage')}
      </h1>

      {list.length === 0 && (
        <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
          {t('manage_empty_hint', '还没有课表，点击下方按钮创建或导入')}
        </p>
      )}

      {/* 当前课表摘要 — ManagementPage.kt:91-116 */}
      {defaultTable && (
        <div
          style={{
            background: 'var(--md-surface-container)',
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-primary)' }}>
            {t('manage_current_table')}
          </div>
          <div className="m3-title-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>
            {defaultTable.name}
          </div>
          <div
            className="m3-body-small"
            style={{ fontSize: 12, lineHeight: '16px', color: 'var(--md-on-surface-variant)' }}
          >
            {t('table_info', {
              v1: defaultTable.startDate || '—',
              v2: computeCurrentWeek(defaultTable.startDate, defaultTable.maxWeek || 20),
              v3: currentCourseCount ?? 0,
            })}
          </div>
        </div>
      )}

      {/* 管理按钮 5 卡 — ManagementPage.kt:120-153, spacedBy(12dp) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ManageCard
          icon={IconFileUpload}
          title={t('manage_import')}
          subtitle={t('manage_import_sub')}
          onClick={() => open('addCourse', () => setImporting(true))}
        />
        <ManageCard
          icon={IconAutoAwesome}
          title={t('manage_new_table')}
          subtitle={t('manage_new_table_sub')}
          onClick={() => handleNewTable()}
        />
        <ManageCard
          icon={IconAdd}
          title={t('manage_manual_add')}
          subtitle={t('manage_manual_add_sub')}
          onClick={() => open('addCourse', () => setAddingCourse(true))}
        />
        <ManageCard
          icon={IconEdit}
          title={t('manage_edit_current')}
          subtitle={t('manage_edit_current_sub')}
          onClick={() => defaultTable && open('editTable', () => setEditingId(defaultTable.id))}
        />
        <ManageCard
          icon={IconShare}
          title={t('manage_export', '导出当前课表')}
          subtitle={t('manage_export_sub', '以原生格式 / WakeUp JSON / ICS / 文本分享')}
          onClick={() => open('export', () => setExporting(true))}
        />
      </div>

    </div>
  )
}

/** ManageCard — ManagementPage.kt:172-203 1:1:
 *  surface-container 底 radius 16 padding 16; 左 44×44 radius 12 primary-container
 *  图标方块(22px 图标 on-primary-container); 右列 padding-start 14, titleSmall SemiBold
 *  + 2dp spacer + bodySmall on-surface-variant。 */
function ManageCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: IconComponent
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: 16,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 16,
        background: 'var(--md-surface-container)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'var(--md-primary-container)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color="var(--md-on-primary-container)" />
      </div>
      <div style={{ flex: 1, paddingLeft: 14, minWidth: 0 }}>
        <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>
          {title}
        </div>
        <div style={{ height: 2 }} />
        <div
          className="m3-body-small"
          style={{ fontSize: 12, lineHeight: '16px', color: 'var(--md-on-surface-variant)' }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  )
}

