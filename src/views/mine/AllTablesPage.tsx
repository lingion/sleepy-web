/**
 * AllTablesPage — 全部课表 (AllTablesScreen.kt 1:1)。从 MineView.tsx 拆出。
 * 列表 + 设为默认 + 复制 + 进入 EditTable (走返回栈, MainActivity:317 pushOverlay(EditTable))。
 * EditTable 是本页内的子层: editingId 局部态 + push('editTable') 让浏览器返回先收回编辑页。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import { installBackHandler, useBackStack } from '../../state/backStack'
import { abandonPendingTable, beginNewTable, usePendingTable } from '../../state/pendingTable'
import { computeCurrentWeek } from '../ScheduleView'
import { EditTableView } from '../EditTableView'
import { duplicateTable, setDefault } from '../../data/repository'
import { IconCheckCircle, IconContentCopy, IconSettings, IconAdd } from '../../components/icons'
import type { Table } from '../../data/types'
import { SettingsScaffold } from './shared'


export function AllTablesPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const selectedId = useLiveQuery(async () => (await db.timetables.where('isDefault').equals(1).first())?.id)
  const [editingId, setEditingId] = useState<number | null>(null)
  const push = useBackStack((s) => s.push)
  const back = useBackStack((s) => s.pop)
  const pendingId = usePendingTable((s) => s.pendingId)

  // EditTable 走返回栈 (MainActivity:317 pushOverlay(EditTable)) — 此前 editingId 是纯局部态,
  // 浏览器返回只弹历史不收回页面, 且底栏在编辑页仍露出来 (违反 overlay 不变量)。
  useEffect(() => installBackHandler((key) => {
    if (key === 'editTable') setEditingId(null)
  }), [])

  if (editingId !== null) {
    return (
      <EditTableView
        tableId={editingId}
        pendingNewTableId={pendingId}
        onBack={() => { back(); setEditingId(null) }}
        onDiscardPending={() => { void abandonPendingTable(); back(); setEditingId(null) }}
        onSaved={() => { back(); setEditingId(null) }}
        onDeleted={() => { back(); setEditingId(null) }}
      />
    )
  }

  return (
    <SettingsScaffold title={t('all_tables')} onBack={onBack}>
      {tables.map((tb: Table) => {
        const isCurrent = tb.id === selectedId
        return (
          <div
            key={tb.id}
            onClick={() => {
              if (!isCurrent) void setDefault(tb.id)
            }}
            className="m3-card"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer',
              background: isCurrent ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
            }}
          >
            {isCurrent ? (
              <span style={{ color: 'var(--md-primary)', flexShrink: 0 }}><IconCheckCircle size={24} /></span>
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--md-outline-variant)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-title-small" style={{ fontWeight: 600 }}>{tb.name}</div>
              <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                {isCurrent ? formatWeekLine(tb) : startDateLine(tb)}
              </div>
              {tb.createdAt > 0 && (
                <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                  {formatCreatedAt(tb.createdAt)}
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); void duplicateTable(tb.id) }}
              aria-label={t('all_tables_duplicate')}
              style={iconBtnStyle}
            >
              <IconContentCopy size={20} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); push('editTable'); setEditingId(tb.id) }}
              aria-label={t('action_settings')}
              style={iconBtnStyle}
            >
              <IconSettings size={20} />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => {
          // 待保存新建 (MainActivity:311-317): 建空表不切选中 → EditTable, 不保存返回即丢弃
          void beginNewTable().then((id) => { push('editTable'); setEditingId(id) })
        }}
        className="m3-card"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: 14, cursor: 'pointer', border: 'none', width: '100%',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
        }}
      >
        <IconAdd size={20} />
        <span className="m3-label-large">{t('all_tables_new')}</span>
      </button>
    </SettingsScaffold>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', background: 'transparent',
  color: 'var(--md-on-surface-variant)', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

function formatWeekLine(tb: Table): string {
  return t2('current_table_week', { v1: computeCurrentWeek(tb.startDate, tb.maxWeek || 20) })
}
function startDateLine(tb: Table): string {
  return t2('table_start_date', { v1: tb.startDate || '—' })
}
function formatCreatedAt(ms: number): string {
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return t2('table_created_at', { v1: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` })
}
/** AllTables 行副标题专用 — 组件顶层外禁 hook, 用 i18next 实例轻量包装 */
function t2(key: string, opts?: Record<string, unknown>): string {
  return i18next.t(key, opts)
}
