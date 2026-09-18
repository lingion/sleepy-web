/**
 * PeriodTableEditView — PeriodTableEditScreen.kt 1:1 移植 (issue#40)。
 * 名称 + 时间节次表 (与 EditTableView 共用 TimeSlotSection) + 保存前预览 (受影响的绑定课表
 * 时间变化) + 复制/分享/删除。
 * 新建未保存 = 返回时丢弃 (与课表侧 pendingNewTableId 同款 §4.2 语义)。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/db'
import {
  getPeriodTable,
  updatePeriodTableContent,
  deletePeriodTable,
  getCourses,
  copyPeriodTableAs,
} from '../../data/repository'
import {
  parseTimeSlotRows,
  buildTimeJsonFromRows,
  type TimeSlotRow,
} from '../../domain/timeTable'
import {
  decodeSmartConfig,
  encodeSmartConfig,
  inferSmartConfig,
  type SmartPeriodConfig,
} from '../../domain/smartPeriod'
import { previewPeriodTableChange } from '../../domain/periodTablePreview'
import { isTableNameTaken } from './periodTableNames'
import { TimeSlotSection } from './TimeSlotSection'
import { SettingsScaffold } from './shared'
import {
  IconCheck, IconContentCopy, IconDelete, IconShare,
} from '../../components/icons'
import {
  exportPeriodTableShareText, exportPeriodTableJson,
} from '../../domain/import/sleepyNativeExporter'
import { downloadFile, copyText } from './periodTableIo'
import type { PeriodTable, Course } from '../../data/types'

export function PeriodTableEditView({
  id,
  unsavedNew = false,
  onBack,
  onSaved,
}: {
  id: number
  unsavedNew?: boolean
  onBack: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const periodTable = useLiveQuery(() => getPeriodTable(id), [id])
  const allTables = useLiveQuery(() => db.timetables.toArray(), []) ?? []
  // v1.0.56 T6: 第三 Tab「作息表」数据源 — 取入候选(排除自己)
  const allPeriodTables = useLiveQuery(async () => {
    const all = await db.periodTables.toArray()
    return all.filter((pt) => pt.id !== id)
  }, [id]) ?? []

  const [name, setName] = useState<string | null>(null)
  const [rowsDraft, setRowsDraft] = useState<TimeSlotRow[] | null>(null)
  const [smartConfig, setSmartConfig] = useState<SmartPeriodConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeSlotsExpanded, setTimeSlotsExpanded] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteBlockedMsg, setDeleteBlockedMsg] = useState<string | null>(null)
  const [showCopyDialog, setShowCopyDialog] = useState(false)
  const [copyName, setCopyName] = useState('')
  const [showShareSheet, setShowShareSheet] = useState(false)
  // v1.0.56 T6: 第三 Tab「作息表」— 取入: 选中另一张作息表把节次内容拷进编辑区
  // (成为本表内容起点), 非活绑 — 绑定只存在于课表上。排除自己禁自引用。
  const [selectedImportTableId, setSelectedImportTableId] = useState<number | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{
    updated: PeriodTable
    changedCourses: Array<{ courseName: string; startNode: number; step: number; oldTime: string | null; newTime: string | null; changedNodes: number[] }>
    unchangedCount: number
  } | null>(null)

  // 表异步到达后再初始化受控值
  if (periodTable && name === null) setName(periodTable.name)
  if (periodTable && rowsDraft === null) setRowsDraft(parseTimeSlotRows(periodTable.timeJson))
  if (periodTable && smartConfig === null) {
    setSmartConfig(
      decodeSmartConfig(periodTable.smartConfigJson) ?? inferSmartConfig(parseTimeSlotRows(periodTable.timeJson))
    )
  }

  if (!periodTable || name === null || rowsDraft === null || smartConfig === null) {
    return <div style={{ padding: 24 }} />
  }

  const pt = periodTable
  const tableName = name

  const handleBack = async () => {
    // 未保存的新表 → 丢弃残留行 (Android discardNewPeriodTable)
    if (unsavedNew) await deletePeriodTable(pt.id)
    onBack()
  }

  const handleSave = async (newRows: TimeSlotRow[]) => {
    const valid = newRows.length > 0 && newRows.every((r) => /^\d{2}:\d{2}$/.test(r.start) && /^\d{2}:\d{2}$/.test(r.end)) && newRows.every((r) => r.start < r.end)
    if (!valid) {
      setError(t('edit_table_validation_error'))
      return
    }
    setError(null)
    const newTimeJson = buildTimeJsonFromRows(newRows)
    const smartJson = encodeSmartConfig(smartConfig)
    const updated: PeriodTable = {
      ...pt,
      name: tableName.trim() === '' ? pt.name : tableName,
      nodesPerDay: newRows.length,
      timeJson: newTimeJson,
      smartConfigJson: smartJson,
    }
    if (updated.timeJson === pt.timeJson && updated.smartConfigJson === pt.smartConfigJson && updated.name === pt.name && updated.nodesPerDay === pt.nodesPerDay) {
      // 无变化 — 直接关闭
      onSaved()
      return
    }
    // 预览: 全部绑定课表的时间变化
    const boundIds = allTables.filter((tb) => tb.periodTableId === pt.id).map((tb) => tb.id)
    const allCourses: Course[] = []
    for (const id of boundIds) {
      const cs = await getCourses(id)
      allCourses.push(...cs)
    }
    const pv = previewPeriodTableChange(pt.timeJson, newTimeJson, allCourses)
    setPendingPreview({
      updated,
      changedCourses: pv.changed,
      unchangedCount: pv.unchangedCount,
    })
  }

  const handleShare = async (kind: 'native' | 'json') => {
    setShowShareSheet(false)
    if (kind === 'native') {
      const text = exportPeriodTableShareText(pt)
      try {
        await copyText(text)
      } catch {
        await downloadFile(`sleepy_pt_${pt.name}.sleepy`, text, 'text/plain')
      }
    } else {
      const text = exportPeriodTableJson(pt)
      await downloadFile(`sleepy_pt_${pt.name}.json`, text, 'application/json')
    }
  }

  const handleCopy = async () => {
    const courseNames = allTables.map((tb) => tb.name)
    const periodNames = (await db.periodTables.toArray()).map((p) => p.name)
    setCopyName(isTableNameTaken('', courseNames, periodNames) ? '' : pt.name + '2')
    setShowCopyDialog(true)
  }

  const handleDelete = async () => {
    setShowDeleteConfirm(false)
    const ok = await deletePeriodTable(pt.id)
    if (ok) {
      onSaved()
    } else {
      const bound = allTables.filter((tb) => tb.periodTableId === pt.id).length
      setDeleteBlockedMsg(t('period_table_delete_blocked', { v1: bound }))
    }
  }

  return (
    <SettingsScaffold title={t('period_tables_title')} onBack={handleBack}>
      <TopBar
        onShare={() => setShowShareSheet(true)}
        onCopy={handleCopy}
      />
      {/* 名称 */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('period_table_name_label')}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
            border: '1px solid var(--md-outline)', borderRadius: 8, padding: '8px 10px', fontSize: 14,
          }}
        />
      </div>
      {/* 节次时间表 — v1.0.56 T6 第三 Tab「作息表」取入 */}
      <TimeSlotSection
        expanded={timeSlotsExpanded}
        onToggle={() => setTimeSlotsExpanded((v) => !v)}
        rows={rowsDraft}
        onRowsChange={setRowsDraft}
        smartConfig={smartConfig}
        onSmartConfigChange={setSmartConfig}
        onSave={handleSave}
        periodTableOptions={allPeriodTables.map((pt) => ({
          id: pt.id, name: pt.name, nodesPerDay: pt.nodesPerDay,
        }))}
        selectedPeriodTableId={selectedImportTableId}
        excludePeriodTableId={id}
        onSelectPeriodTable={(pickedId) => {
          setSelectedImportTableId(pickedId)
          const picked = allPeriodTables.find((pt) => pt.id === pickedId)
          if (!picked) return
          // 取入 = 把该表节次内容拷进当前编辑区 (PeriodTableEditScreen.kt:284-300 1:1)
          const imported = parseTimeSlotRows(picked.timeJson)
          setRowsDraft(imported)
          setSmartConfig(
            decodeSmartConfig(picked.smartConfigJson) ?? inferSmartConfig(imported),
          )
        }}
      />
      {error && (
        <div role="alert" className="m3-body-medium" style={{ color: 'var(--md-error)' }}>{error}</div>
      )}
      <button
        onClick={() => handleSave(rowsDraft)}
        style={{
          padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <IconCheck size={18} /> {t('edit_table_save')}
      </button>
      {/* 删除 (新建未保存的表不显示 — 退出即丢弃) */}
      {!unsavedNew && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <IconDelete size={18} /> {t('period_table_delete_confirm')}
        </button>
      )}

      {/* 保存前预览确认弹窗 */}
      {pendingPreview && (
        <PreviewConfirmDialog
          boundCount={allTables.filter((tb) => tb.periodTableId === pt.id).length}
          changedCourses={pendingPreview.changedCourses}
          unchangedCount={pendingPreview.unchangedCount}
          onDismiss={() => setPendingPreview(null)}
          onConfirm={async () => {
            const toSave = pendingPreview.updated
            setPendingPreview(null)
            await updatePeriodTableContent(toSave)
            onSaved()
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={t('period_table_delete_confirm')}
          body={<p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>{t('period_table_delete_msg_body', { v1: pt.name })}</p>}
          confirmText={t('delete')}
          destructive
          onConfirm={handleDelete}
          onDismiss={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* 删除被绑定拦截 */}
      {deleteBlockedMsg && (
        <ConfirmDialog
          title={t('period_table_delete_confirm')}
          body={<p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>{deleteBlockedMsg}</p>}
          confirmText={t('ok')}
          onConfirm={() => setDeleteBlockedMsg(null)}
          onDismiss={() => setDeleteBlockedMsg(null)}
        />
      )}

      {/* 复制命名框 */}
      {showCopyDialog && (
        <ConfirmDialog
          title={t('period_table_copy_dialog_title')}
          body={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                autoFocus
                style={{
                  background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
                  border: '1px solid var(--md-outline)', borderRadius: 8, padding: '8px 10px', fontSize: 14,
                }}
              />
            </div>
          }
          confirmText={t('ok')}
          confirmDisabled={copyName.trim() === ''}
          onConfirm={async () => {
            setShowCopyDialog(false)
            await copyPeriodTableAs(pt.id, copyName)
          }}
          onDismiss={() => setShowCopyDialog(false)}
        />
      )}

      {/* 分享底部弹窗 */}
      {showShareSheet && (
        <ShareSheet onSelect={handleShare} onDismiss={() => setShowShareSheet(false)} />
      )}
    </SettingsScaffold>
  )
}

function TopBar({ onShare, onCopy }: { onShare: () => void; onCopy: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
      <button
        aria-label={t('period_table_share_sheet_title')}
        onClick={onShare}
        style={{
          width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent',
          color: 'var(--md-on-background)', cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      ><IconShare size={20} /></button>
      <button
        aria-label={t('period_table_copy')}
        onClick={onCopy}
        style={{
          width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent',
          color: 'var(--md-on-background)', cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      ><IconContentCopy size={20} /></button>
    </div>
  )
}

function PreviewConfirmDialog({
  boundCount, changedCourses, unchangedCount, onConfirm, onDismiss,
}: {
  boundCount: number
  changedCourses: Array<{ courseName: string; startNode: number; step: number; oldTime: string | null; newTime: string | null; changedNodes: number[] }>
  unchangedCount: number
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog" aria-modal="true" className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 10, padding: 20, maxHeight: '80vh', overflow: 'auto' }}
      >
        <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('period_table_save_preview_title')}</h2>
        <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', margin: 0 }}>
          {t('period_table_preview_summary', { v1: boundCount, v2: changedCourses.length, v3: unchangedCount })}
        </p>
        {changedCourses.slice(0, 8).map((ch, i) => {
          const tag = ch.changedNodes.length === 1
            ? t('course_node_format', { v1: String(ch.changedNodes[0]) })
            : `${ch.changedNodes[0]}-${ch.changedNodes[ch.changedNodes.length - 1]}`
          return (
            <div key={i} className="m3-body-small" style={{ color: 'var(--md-on-surface)' }}>
              {ch.courseName}({tag}): {ch.oldTime ?? '?'} → {ch.newTime ?? '?'}
            </div>
          )
        })}
        {changedCourses.length > 8 && (
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('period_table_preview_more', { v1: changedCourses.length - 8 })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onDismiss} style={{
            padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', fontSize: 13,
          }}>{t('cancel')}</button>
          <button onClick={onConfirm} style={{
            padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontSize: 13, fontWeight: 600,
          }}>{t('period_table_preview_confirm')}</button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({
  title, body, confirmText, dismissText, confirmDisabled, destructive, onConfirm, onDismiss,
}: {
  title: string
  body: React.ReactNode
  confirmText: string
  dismissText?: string
  confirmDisabled?: boolean
  destructive?: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const dis = dismissText ?? t('cancel')
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog" aria-modal="true" className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}
      >
        <h2 className="m3-title-medium" style={{ margin: 0 }}>{title}</h2>
        {body}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onDismiss} style={{
            padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', fontSize: 13,
          }}>{dis}</button>
          <button
            disabled={confirmDisabled === true}
            onClick={onConfirm}
            style={{
              padding: '8px 16px', borderRadius: 12, border: 'none',
              cursor: confirmDisabled === true ? 'not-allowed' : 'pointer',
              background: confirmDisabled === true ? 'var(--md-surface-container-high)' : destructive ? 'var(--md-error)' : 'var(--md-primary)',
              color: confirmDisabled === true ? 'var(--md-on-surface-variant)' : destructive ? 'var(--md-on-error)' : 'var(--md-on-primary)',
              fontSize: 13, fontWeight: 600,
            }}
          >{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

function ShareSheet({ onSelect, onDismiss }: { onSelect: (kind: 'native' | 'json') => void; onDismiss: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog" aria-modal="true" className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, marginBottom: 16 }}
      >
        <h3 className="m3-title-medium" style={{ margin: '4px 8px' }}>{t('period_table_share_sheet_title')}</h3>
        <button
          onClick={() => onSelect('native')}
          style={{
            padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
            background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', fontSize: 14, fontWeight: 500,
          }}
        >
          <div>{t('period_table_share_native_title')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('period_table_share_native_sub')}</div>
        </button>
        <button
          onClick={() => onSelect('json')}
          style={{
            padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
            background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', fontSize: 14, fontWeight: 500,
          }}
        >
          <div>{t('period_table_share_json_title')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('period_table_share_json_sub')}</div>
        </button>
        <button onClick={onDismiss} style={{
          padding: 10, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--md-on-surface-variant)', fontSize: 13,
        }}>{t('cancel')}</button>
      </div>
    </div>
  )
}
