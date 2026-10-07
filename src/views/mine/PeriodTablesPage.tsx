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
import { SettingsScaffold } from './shared'
import { AlertDialog } from '../../components/AlertDialog'
import { DialogActionButtons } from '../../components/DialogActionButtons'
import { FilledTextField } from '../../components/FilledTextField'
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
  const push = useBackStack((s) => s.push)
  const back = useBackStack((s) => s.pop)
  const [state, setState] = useState<EditState>({ kind: 'list' })
  const periodTables = useLiveQuery(() => loadPeriodTables(), []) ?? []
  const tables = useLiveQuery(() => db.timetables.toArray(), []) ?? []

  const openEdit = (id: number, unsaved: boolean) => {
    push('periodTableEdit' as BackKey)
    setState({ kind: 'edit', id, unsaved })
  }
  const startCopy = (pt: PeriodTable, suggested: string) => {
    setState({ kind: 'copying', source: pt, name: suggested })
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
      <>
        <PeriodTablesList periodTables={periodTables} tables={tables} onOpenEdit={openEdit} onCopy={startCopy} onBack={handleBack} />
        <CopyDialog
          source={state.source}
          name={state.name}
          tables={tables}
          periodTables={periodTables}
          onChange={setState}
          onBack={backToList}
        />
      </>
    )
  }

  return (
    <PeriodTablesList periodTables={periodTables} tables={tables} onOpenEdit={openEdit} onCopy={startCopy} onBack={handleBack} />
  )
}

function PeriodTablesList({
  periodTables, tables, onOpenEdit, onCopy, onBack,
}: {
  periodTables: PeriodTable[]
  tables: Table[]
  onOpenEdit: (id: number, unsaved: boolean) => void
  onCopy: (pt: PeriodTable, suggested: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  return (
    <SettingsScaffold title={t('period_tables_title')} onBack={onBack} gap={10}>
      {/* 每行独立 surfaceContainer extraLarge(28) 卡, spacedBy(10) — Android LazyColumn 同款 */}
      {periodTables.map((pt) => {
        const bound = tables.filter((tb) => tb.periodTableId === pt.id).length
        return (
          <div
            key={pt.id}
            style={{
              display: 'flex', alignItems: 'center', padding: 16,
              background: 'var(--md-surface-container)', borderRadius: 28,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-title-medium" style={{ fontWeight: 600 }}>{pt.name}</div>
              <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                {t('period_table_bound_count', { v1: bound })}
              </div>
            </div>
            <IconButton aria-label={t('edit_table_title')} onClick={() => onOpenEdit(pt.id, false)}>
              <IconEdit size={20} />
            </IconButton>
            <IconButton
              aria-label={t('period_table_copy')}
              onClick={() => {
                const courseNames = tables.map((tb) => tb.name)
                const periodNames = periodTables.map((p) => p.name)
                const suggested = suggestUniqueName(pt.name, courseNames, periodNames)
                onCopy(pt, suggested)
              }}
            >
              <IconContentCopy size={20} />
            </IconButton>
          </div>
        )
      })}
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
          onOpenEdit(id, true)
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          height: 56, borderRadius: 16, cursor: 'pointer', border: 'none',
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
    <AlertDialog title={t('period_table_copy_dialog_title')} onDismiss={onBack}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <FilledTextField label={t('period_table_name_label')} value={localName} onChange={setLocalName} isError={nameTaken} />
          {nameTaken && <div className="m3-body-small" style={{ color: 'var(--md-error)', padding: '4px 16px 0' }}>{t('period_table_name_taken')}</div>}
        </div>
        <div style={{ height: 12 }} />
        <DialogActionButtons
          confirmText={t('ok')}
          onConfirm={async () => {
            const newId = await copyPeriodTableAs(source.id, candidate)
            if (newId > 0) onChange({ kind: 'list' })
          }}
          dismissText={t('cancel')}
          onDismiss={onBack}
          confirmEnabled={candidate !== '' && !nameTaken}
        />
      </div>
    </AlertDialog>
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
