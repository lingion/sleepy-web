/**
 * PeriodTablesPage — PeriodTablesScreen.kt 1:1 移植 (issue#40 §4.1)。
 * 列表 + 每张作息表 boundCount (绑定数) + 编辑/复制入口;
 * 新建/删除入口迁到编辑页 (T7 修复)。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import {
  loadPeriodTables,
  insertPeriodTable,
  copyPeriodTableAs,
} from '../../data/repository'
import { DEFAULT_TIME_JSON } from '../../domain/timeTable'
import { SettingsScaffold, HDiv } from './shared'
import {
  IconAdd, IconContentCopy, IconEdit,
} from '../../components/icons'
import { downloadFile, copyText } from './periodTableIo'
import { exportPeriodTableShareText, exportPeriodTableJson } from '../../domain/import/sleepyNativeExporter'
import { isTableNameTaken, suggestUniqueName } from './periodTableNames'
import { useBackStack, type BackKey } from '../../state/backStack'
import { PeriodTableEditView } from './PeriodTableEditView'
import type { PeriodTable, Table } from '../../data/types'

type EditState =
  | { kind: 'list' }
  | { kind: 'edit'; id: number; unsaved: boolean }
  | { kind: 'copying'; source: PeriodTable; name: string }

export function PeriodTablesPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const push = useBackStack((s) => s.push)
  const back = useBackStack((s) => s.pop)
  const [state, setState] = useState<EditState>({ kind: 'list' })
  const periodTables = useLiveQuery(() => loadPeriodTables(), []) ?? []
  const tables = useLiveQuery(() => db.timetables.toArray(), []) ?? []

  const openEdit = (id: number, unsaved: boolean) => {
    push('periodTableEdit' as BackKey)
    setState({ kind: 'edit', id, unsaved })
  }
  const handleBack = () => {
    if (state.kind === 'list') back() // pop stack first then return
    else back()
    onBack()
  }
  const backToList = () => {
    back()
    setState({ kind: 'list' })
  }
  const handleEditBack = () => {
    // 已保存或丢弃残留行 — 回到 list
    if (state.kind === 'edit') setState({ kind: 'list' })
    back()
  }

  if (state.kind === 'edit') {
    return (
      <PeriodTableEditView
        id={state.id}
        unsavedNew={state.unsaved}
        onBack={handleEditBack}
        onSaved={() => setState({ kind: 'list' })}
      />
    )
  }

  if (state.kind === 'copying') {
    return (
      <CopyDialog
        source={state.source}
        name={state.name}
        tables={tables}
        periodTables={periodTables}
        onChange={setState}
        onBack={backToList}
      />
    )
  }

  return (
    <SettingsScaffold title={t('period_tables_title')} onBack={handleBack}>
      <div className="m3-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
        {periodTables.length === 0 && (
          <div className="m3-body-medium" style={{ padding: 16, color: 'var(--md-on-surface-variant)' }}>
            {t('manage_empty_hint', '还没有作息表，点击下方按钮创建')}
          </div>
        )}
        {periodTables.map((pt, idx) => {
          const bound = tables.filter((tb) => tb.periodTableId === pt.id).length
          return (
            <div key={pt.id}>
              {idx > 0 && <HDiv inset={0} />}
              <div
                style={{
                  display: 'flex', alignItems: 'center', padding: 16, gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="m3-title-medium" style={{ fontWeight: 600 }}>{pt.name}</div>
                  <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                    {t('period_table_bound_count', { v1: bound })} · {t('period_table_nodes_count', { v1: pt.nodesPerDay })}
                  </div>
                </div>
                <IconButton aria-label={t('edit_table_title')} onClick={() => openEdit(pt.id, false)}>
                  <IconEdit size={20} />
                </IconButton>
                <IconButton
                  aria-label={t('period_table_copy')}
                  onClick={() => {
                    const courseNames = tables.map((tb) => tb.name)
                    const periodNames = periodTables.map((p) => p.name)
                    const suggested = suggestUniqueName(pt.name, courseNames, periodNames)
                    setState({ kind: 'copying', source: pt, name: suggested })
                  }}
                >
                  <IconContentCopy size={20} />
                </IconButton>
              </div>
            </div>
          )
        })}
      </div>
      <button
        onClick={async () => {
          const courseNames = tables.map((tb) => tb.name)
          const periodNames = periodTables.map((p) => p.name)
          const unique = suggestUniqueName(t('period_table_new'), courseNames, periodNames, t('period_table_new'))
          const id = await insertPeriodTable({
            name: unique,
            nodesPerDay: 12,
            timeJson: DEFAULT_TIME_JSON,
            smartConfigJson: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          openEdit(id, true)
        }}
        className="m3-card"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: 14, cursor: 'pointer', border: 'none',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600,
        }}
      >
        <IconAdd size={20} />
        <span>{t('period_table_new')}</span>
      </button>
    </SettingsScaffold>
  )
}

function CopyDialog({
  source, name, tables, periodTables, onChange, onBack,
}: {
  source: PeriodTable
  name: string
  tables: Table[]
  periodTables: PeriodTable[]
  onChange: (s: { kind: 'list' }) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [localName, setLocalName] = useState(name)
  const courseNames = tables.map((tb) => tb.name)
  const periodNames = periodTables.map((p) => p.name)
  const candidate = localName.trim()
  const nameTaken = candidate !== '' && isTableNameTaken(candidate, courseNames, periodNames)
  return (
    <SettingsScaffold title={t('period_table_copy_dialog_title')} onBack={onBack}>
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('period_table_name_label')}
          </span>
          <input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            autoFocus
            style={{
              background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
              border: `1px solid ${nameTaken ? 'var(--md-error)' : 'var(--md-outline)'}`,
              borderRadius: 8, padding: '8px 10px', fontSize: 14,
            }}
          />
          {nameTaken && (
            <span className="m3-body-small" style={{ color: 'var(--md-error)' }}>
              {t('period_table_name_taken')}
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onBack}
            style={{
              padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', fontSize: 13,
            }}
          >{t('cancel')}</button>
          <button
            disabled={candidate === '' || nameTaken}
            onClick={async () => {
              const newId = await copyPeriodTableAs(source.id, candidate)
              if (newId > 0) onChange({ kind: 'list' })
            }}
            style={{
              padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: candidate === '' || nameTaken ? 'var(--md-surface-container-high)' : 'var(--md-primary)',
              color: candidate === '' || nameTaken ? 'var(--md-on-surface-variant)' : 'var(--md-on-primary)',
              fontSize: 13, fontWeight: 600,
            }}
          >{t('ok')}</button>
        </div>
      </div>
    </SettingsScaffold>
  )
}

function IconButton({ children, onClick, ...rest }: { children: React.ReactNode; onClick: () => void; 'aria-label'?: string }) {
  return (
    <button
      onClick={onClick}
      {...rest}
      style={{
        width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent',
        color: 'var(--md-on-surface-variant)', cursor: 'pointer', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  )
}

// re-export the share helpers (kept as separate module to keep this file short)
export async function sharePeriodTableNative(pt: PeriodTable): Promise<void> {
  await copyText(exportPeriodTableShareText(pt))
}
export async function exportPeriodTableFileNative(pt: PeriodTable): Promise<void> {
  const fileName = `sleepy_pt_${pt.name}_${Date.now()}.sleepy`
  await downloadFile(fileName, exportPeriodTableShareText(pt), 'text/plain')
}
export async function exportPeriodTableFileJson(pt: PeriodTable): Promise<void> {
  const fileName = `sleepy_pt_${pt.name}_${Date.now()}.json`
  await downloadFile(fileName, exportPeriodTableJson(pt), 'application/json')
}
