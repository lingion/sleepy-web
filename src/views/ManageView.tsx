/**
 * ManageView — 课表管理 tab (ManageScreen 骨架 1:1 核心路径)
 * 课表列表 (当前默认高亮) + 新建 + 切默认 + 重命名 + 删除 + 学期设置。
 * 撤回: 删除/新建等写操作走 repository captureForUndo, 顶栏撤回键可退。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import {
  insertTable,
  deleteTable,
  setDefault,
  updateTable,
  countCourses,
} from '../data/repository'
import { DEFAULT_TIME_JSON } from '../domain/timeTable'
import type { Table } from '../data/types'
import { ImportView } from './ImportView'

export function ManageView() {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), [])
  const counts = useLiveQuery(async () => {
    const all = await db.timetables.toArray()
    const out: Record<number, number> = {}
    for (const tb of all) out[tb.id] = await countCourses(tb.id)
    return out
  }, [])
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [importing, setImporting] = useState(false)

  if (importing) return <ImportView onDone={() => setImporting(false)} />

  async function handleNewTable() {
    const n = (tables?.length ?? 0) + 1
    await insertTable({
      name: `${t('manage_new_table')} ${n}`,
      timeJson: DEFAULT_TIME_JSON,
      smartConfigJson: '',
      isDefault: 0,
      startDate: '',
      nodeCount: 12,
      maxWeek: 20,
      createdAt: Date.now(),
    })
    // 首表自动 isDefault (repository 契约)
  }

  async function handleDelete(id: number) {
    // 删除是写用户数据 — 但有 undo 快照兜底 (与 Android deleteTable 同: 撤回可恢复)
    await deleteTable(id)
  }

  async function handleRename(id: number) {
    if (!renameValue.trim()) return
    const table = await db.timetables.get(id)
    if (table) await updateTable({ ...table, name: renameValue.trim() })
    setRenaming(null)
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="m3-title-large" style={{ marginTop: 0 }}>
        {t('tab_manage')}
      </h1>

      {tables?.length === 0 && (
        <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('manage_empty_hint', '还没有课表')}
        </p>
      )}

      {tables?.map((tb: Table) => (
        <div
          key={tb.id}
          className="m3-card m3-card-clickable"
          style={{
            padding: 16,
            border: tb.isDefault === 1 ? '2px solid var(--md-primary)' : undefined,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          onClick={() => void setDefault(tb.id)}
        >
          {renaming === tb.id ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRename(tb.id)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                autoFocus
                style={{
                  flex: 1,
                  background: 'var(--md-surface-container-high)',
                  color: 'var(--md-on-surface)',
                  border: '1px solid var(--md-outline)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 15,
                }}
              />
              <button onClick={(e) => { e.stopPropagation(); void handleRename(tb.id) }}>{t('ok')}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="m3-title-medium" style={{ fontWeight: 600, flex: 1 }}>
                {tb.name}
                {tb.isDefault === 1 && (
                  <span
                    className="m3-label-small"
                    style={{
                      marginLeft: 8,
                      background: 'var(--md-primary-container)',
                      color: 'var(--md-on-primary-container)',
                      padding: '2px 8px',
                      borderRadius: 8,
                    }}
                  >
                    {t('manage_current_table')}
                  </span>
                )}
              </span>
              <span className="m3-label-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
                {counts?.[tb.id] ?? 0} {t('course_unit', '门课')}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <SmallBtn
              label={t('rename')}
              onClick={(e) => {
                e.stopPropagation()
                setRenaming(tb.id)
                setRenameValue(tb.name)
              }}
            />
            <SmallBtn
              label={t('delete')}
              danger
              onClick={(e) => {
                e.stopPropagation()
                void handleDelete(tb.id)
              }}
            />
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setImporting(true)}
          style={{
            padding: 16,
            borderRadius: 16,
            border: 'none',
            background: 'var(--md-secondary-container)',
            color: 'var(--md-on-secondary-container)',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            flex: 1,
          }}
        >
          {t('manage_import')}
        </button>
        <button
          onClick={() => void handleNewTable()}
          style={{
            padding: 16,
            borderRadius: 16,
            border: 'none',
            background: 'var(--md-primary-container)',
            color: 'var(--md-on-primary-container)',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            flex: 1,
          }}
        >
          + {t('manage_new_table')}
        </button>
      </div>
    </div>
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
      }}
    >
      {label}
    </button>
  )
}
