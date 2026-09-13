/**
 * ManageView — Kotlin ManagementPage.kt 1:1 移植
 * 标题(headlineMedium+Medium) + 当前课表摘要卡(标签/名称/startDate|第N周|N门课)
 * + 5 张 ManageCard(导入/新建/手动添加/编辑当前/导出, 44dp 图标方块布局)
 * + 全部课表列表(web 承载切默认, 行高亮同 AllTablesScreen primary-container 就地高亮)
 * + 删除二次确认弹窗(EditTableScreen.kt:329-355 同款, N>0 提示课数)。
 * 新建动线 = MainActivity createEmptyTable(commitSelection=false) 1:1:
 * 默认N 查重 + 上周一开学日 + 首表自动置默认, 建后跳 EditTable 让用户立即命名。
 * 重命名不入本页 — Android 真源重命名仅发生在 EditTableScreen(名称字段), 经编辑卡完成。
 */

import { useState } from 'react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { useBackStack } from '../state/backStack'
import {
  insertTable,
  deleteTable,
  setDefault,
  countCourses,
} from '../data/repository'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import type { Table } from '../data/types'
import { ImportView } from './ImportView'
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
  IconCheckCircle,
} from '../components/icons'

type IconComponent = ComponentType<{ size?: number; color?: string }>

export function ManageView({ navExtraBottom = 0 }: { navExtraBottom?: number }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), [])
  const counts = useLiveQuery(async () => {
    const all = await db.timetables.toArray()
    const out: Record<number, number> = {}
    for (const tb of all) out[tb.id] = await countCourses(tb.id)
    return out
  }, [])
  const [importing, setImporting] = useState(false)
  const [addingCourse, setAddingCourse] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)
  const back = useBackStack((s) => s.pop)
  const push = useBackStack((s) => s.push)

  const list = tables ?? []
  const defaultTable = list.find((x) => x.isDefault === 1)
  const confirming = confirmingDelete !== null ? list.find((x) => x.id === confirmingDelete) : undefined

  // 二级页 push 入栈 (浏览器返回可弹); 返回按钮 pop 出栈。
  const enter = (key: Parameters<typeof push>[0]) => {
    push(key)
  }
  const leave = () => back()

  if (importing) {
    enter('addCourse')
    return <ImportView onDone={() => { leave(); setImporting(false) }} />
  }
  if (addingCourse) {
    enter('addCourse')
    return (
      <AddCourseView
        onBack={() => { leave(); setAddingCourse(false) }}
        onSaved={() => { leave(); setAddingCourse(false) }}
      />
    )
  }
  if (exporting) {
    enter('export')
    return <ExportView onBack={() => { leave(); setExporting(false) }} />
  }
  if (editingId !== null) {
    enter('editTable')
    return (
      <EditTableView
        tableId={editingId}
        onBack={() => { leave(); setEditingId(null) }}
        onSaved={() => { leave(); setEditingId(null) }}
        onDeleted={() => { leave(); setEditingId(null) }}
      />
    )
  }

  /** ScheduleViewModel.createEmptyTable(commitSelection=false) 1:1 —
   *  名称「默认N」对已有名查重递增; startDate=上周一; 首表自动 isDefault=1
   *  (MainActivity.kt:293 同款动线: 建后跳 EditTable 让用户立刻命名/设日期)。 */
  async function handleNewTable() {
    const existingNames = new Set(list.map((x) => x.name))
    let index = list.length + 1
    let name = t('default_table_with_num', { v1: index })
    while (existingNames.has(name)) {
      index += 1
      name = t('default_table_with_num', { v1: index })
    }
    const now = new Date()
    // 本周一 = 今天 - ((getDay()+6)%7) 天; 再减 7 天 = 上周一 (LocalDate.with(MONDAY).minusWeeks(1))
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7)
    const p = (x: number) => String(x).padStart(2, '0')
    const lastWeekMonday = `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`
    const newId = await insertTable({
      name,
      timeJson: DEFAULT_TIME_JSON,
      smartConfigJson: '',
      isDefault: 0,
      startDate: lastWeekMonday,
      nodeCount: 12,
      maxWeek: 20,
      createdAt: Date.now(),
    })
    if (list.length === 0) await setDefault(newId)
    setEditingId(newId)
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
              v3: counts?.[defaultTable.id] ?? 0,
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
          onClick={() => setImporting(true)}
        />
        <ManageCard
          icon={IconAutoAwesome}
          title={t('manage_new_table')}
          subtitle={t('manage_new_table_sub')}
          onClick={() => void handleNewTable()}
        />
        <ManageCard
          icon={IconAdd}
          title={t('manage_manual_add')}
          subtitle={t('manage_manual_add_sub')}
          onClick={() => setAddingCourse(true)}
        />
        <ManageCard
          icon={IconEdit}
          title={t('manage_edit_current')}
          subtitle={t('manage_edit_current_sub')}
          onClick={() => {
            if (defaultTable) setEditingId(defaultTable.id)
          }}
        />
        <ManageCard
          icon={IconShare}
          title={t('manage_export', '导出当前课表')}
          subtitle={t('manage_export_sub', '以原生格式 / WakeUp JSON / ICS / 文本分享')}
          onClick={() => setExporting(true)}
        />
      </div>

      {/* 全部课表 — web 承载切默认(Android 在 Mine→AllTables); 行样式 AllTablesScreen.kt:81-97:
          当前=primary-container 底 + onPrimaryContainer 文本 + CheckCircle, 点击当前行 no-op */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((tb: Table) => {
          const isCurrent = tb.isDefault === 1
          return (
            <div
              key={tb.id}
              className="m3-card m3-card-clickable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                background: isCurrent ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
              }}
              onClick={() => {
                if (!isCurrent) void setDefault(tb.id)
              }}
            >
              {isCurrent ? (
                <span style={{ color: 'var(--md-primary)', flexShrink: 0, display: 'flex' }}>
                  <IconCheckCircle size={24} />
                </span>
              ) : (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: 'var(--md-outline-variant)',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="m3-title-small"
                  style={{
                    fontWeight: 600,
                    color: isCurrent ? 'var(--md-on-primary-container)' : 'var(--md-on-surface)',
                  }}
                >
                  {tb.name}
                </div>
                <div
                  className="m3-body-small"
                  style={{
                    fontSize: 12,
                    lineHeight: '16px',
                    color: isCurrent ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                    // SleepyTheme.Alpha.highContent = 0.8f (Theme.kt:327)
                    opacity: isCurrent ? 0.8 : undefined,
                  }}
                >
                  {t('table_info', {
                    v1: tb.startDate || '—',
                    v2: computeCurrentWeek(tb.startDate, tb.maxWeek || 20),
                    v3: counts?.[tb.id] ?? 0,
                  })}
                </div>
              </div>
              <SmallBtn
                label={t('edit_table_title')}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingId(tb.id)
                }}
              />
              <SmallBtn
                label={t('delete')}
                danger
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmingDelete(tb.id)
                }}
              />
            </div>
          )
        })}
      </div>

      {/* 删除二次确认 — EditTableScreen.kt:329-355 (N>0 提示一并删除的课数) */}
      {confirming && (
        <Overlay onDismiss={() => setConfirmingDelete(null)}>
          <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('edit_table_delete_confirm')}</h2>
          <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
            {(counts?.[confirming.id] ?? 0) > 0
              ? t('edit_table_delete_msg_count', {
                  v1: confirming.name,
                  v2: counts?.[confirming.id] ?? 0,
                })
              : t('edit_table_delete_msg', { v1: confirming.name })}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmingDelete(null)} style={ghostBtnStyle}>
              {t('cancel')}
            </button>
            <button
              onClick={() => {
                const id = confirming.id
                setConfirmingDelete(null)
                void deleteTable(id)
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                color: 'var(--md-error)',
                background: 'transparent',
                fontWeight: 600,
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Overlay>
      )}
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

function SmallBtn({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 8,
        border: 'none',
        background: danger ? 'var(--md-error-container)' : 'var(--md-surface-container-high)',
        color: danger ? 'var(--md-on-error-container)' : 'var(--md-on-surface)',
        fontSize: 12,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

const ghostBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--md-surface-container-high)',
  color: 'var(--md-on-surface)',
  fontSize: 13,
}

function Overlay({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}
      >
        {children}
      </div>
    </div>
  )
}
