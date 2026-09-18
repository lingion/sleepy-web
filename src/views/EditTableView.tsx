/**
 * EditTableView — Kotlin EditTableScreen.kt 1:1 移植
 * 基础信息(名称/起始周一/总周数) + 可折叠节次时间表 + 保存(节次重映射) + 删除(明示课数)。
 * 保存走 updateTableRemappingCourses (issue#28 P3: timeJson 变了课程节次自适应)。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowBack, IconCheck, IconClose } from '../components/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePendingTable } from '../state/pendingTable'
import {
  updateTableRemappingCourses,
  deleteTable,
  countCourses,
  loadPeriodTables,
  bindPeriodTable,
  updatePeriodTableContent,
} from '../data/repository'
import {
  parseTimeSlotRows,
  buildTimeJsonFromRows,
  type TimeSlotRow,
} from '../domain/timeTable'
import {
  decodeSmartConfig,
  encodeSmartConfig,
  inferSmartConfig,
  type SmartPeriodConfig,
} from '../domain/smartPeriod'
import { normalizeStartDateToMonday } from './importExportUtils'
import { TimeSlotSection } from './mine/TimeSlotSection'

/** normalizeStartDate — DateUtils.kt: 任意日期归一到该周周一 */
function normalizeStartDate(raw: string): string {
  return normalizeStartDateToMonday(raw)
}

export function EditTableView({
  tableId,
  pendingNewTableId = null,
  onBack,
  onDiscardPending,
  onSaved,
  onDeleted,
}: {
  tableId?: number
  /** 非空 = 这张表刚建出来还没保存 (MainActivity.pendingNewTableId 同构) */
  pendingNewTableId?: number | null
  onBack: () => void
  /** 待保存期间退出 = 丢弃新表 (EditTableScreen.kt:142 onDiscardPending) */
  onDiscardPending?: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const table = useLiveQuery(async () => {
    if (tableId !== undefined) return await db.timetables.get(tableId)
    return (await db.timetables.toArray()).find((x) => x.isDefault === 1)
  }, [tableId])
  const courseCount = useLiveQuery(async () => {
    if (!table) return 0
    return await countCourses(table.id)
  }, [table?.id]) ?? 0
  // issue#40: 全部作息表(换绑选择器数据源 §4.3) + 本表当前绑定
  const allPeriodTables = useLiveQuery(() => loadPeriodTables(), []) ?? []

  const [name, setName] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<string | null>(null)
  const [maxWeekText, setMaxWeekText] = useState<string | null>(null)
  const [timeSlotsExpanded, setTimeSlotsExpanded] = useState(false)
  // 节次草稿 + 智慧节次配置提升到父层 — Android slotRows mutableStateListOf 同构:
  // 编辑器直接改草稿, 主保存按钮持久化草稿 (旧版主保存用原始 rows, 编辑会被静默丢弃)
  const [rowsDraft, setRowsDraft] = useState<TimeSlotRow[] | null>(null)
  const [smartConfig, setSmartConfig] = useState<SmartPeriodConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // issue#40: 换绑选择(§5.3) — null 起始 = 未动过; 确认时才写 periodTableId。
  // pendingBind != table.periodTableId 时保存流程走换绑分支。
  const [pendingBind, setPendingBind] = useState<number | null>(null)
  const [pendingBindInit, setPendingBindInit] = useState(false)
  // issue#40 §5.3: 换绑确认弹窗 — 非 null 时弹「确认换绑」, 确认才真正写 periodTableId
  const [pendingRebind, setPendingRebind] = useState<number | null>(null)

  // 返回分层 (EditTableScreen.kt:142): 待保存的新表 → 退出即丢弃, 普通编辑 → 直接返回
  const handleBack = () => {
    if (pendingNewTableId != null && onDiscardPending) onDiscardPending()
    else onBack()
  }
  // 保存/删除后新表已落定, 待保存标记作废 (MainActivity:323/327 popOverlay 同时清 pending)
  const settle = (done: () => void) => () => {
    if (pendingNewTableId != null) usePendingTable.getState().clear()
    done()
  }

  // 表异步到达后再初始化受控值 (remember(table.id) 等价)
  if (table && name === null) setName(table.name)
  if (table && startDate === null) setStartDate(table.startDate)
  if (table && maxWeekText === null) setMaxWeekText(String(table.maxWeek))
  if (table && rowsDraft === null) setRowsDraft(parseTimeSlotRows(table.timeJson))
  if (table && smartConfig === null) {
    setSmartConfig(decodeSmartConfig(table.smartConfigJson) ?? inferSmartConfig(parseTimeSlotRows(table.timeJson)))
  }
  // pendingBind 初始化一次性 — table.periodTableId (remember(table.id, table.periodTableId) 等价)
  if (table && !pendingBindInit) {
    setPendingBind(table.periodTableId ?? null)
    setPendingBindInit(true)
  }

  if (!table || name === null || startDate === null || maxWeekText === null || rowsDraft === null || smartConfig === null) {
    if (tables.length > 0 && !table) {
      return (
        <div style={{ padding: 24 }}>
          <p className="m3-body-medium">{t('edit_table_not_found')}</p>
        </div>
      )
    }
    return <div style={{ padding: 24 }} />
  }

  const slotRows: TimeSlotRow[] = rowsDraft
  // null/undefined 守卫后取本地常量 — TS 闭包不收窄 React state / useLiveQuery 值
  const tbl = table
  const tableName = name
  const tableStart = startDate
  const tableMaxWeek = maxWeekText
  const smartJson = encodeSmartConfig(smartConfig)
  // issue#40: 编辑的就是"有效时间表" — 绑定了独立作息表时节次编辑区展示/修改该作息表
  // (多张绑定课表同享); 换绑修复: 有效表跟随 pendingBind(下拉改选立即切换编辑区来源),
  // 否则已绑定表的 effectivePeriodTable 恒非空, 保存永远走"写回旧表"分支, 换绑成死代码。
  // 换绑下拉改选 → 编辑区切到 pendingBind 所指表的节次内容 (Android effectivePeriodTable
  // 跟随 pendingBind 同构); 未绑定时回退本表兼容列
  const effectivePeriodTable =
    pendingBind != null ? allPeriodTables.find((pt) => pt.id === pendingBind) ?? null : null
  const effectiveTimeJson = effectivePeriodTable?.timeJson ?? tbl.timeJson
  const effectiveSmartJson = effectivePeriodTable?.smartConfigJson ?? tbl.smartConfigJson

  function handleSave(newRows: TimeSlotRow[]) {
    const maxWeek = /^\d+$/.test(tableMaxWeek) ? parseInt(tableMaxWeek, 10) : 20
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(tableStart) &&
      newRows.every((r) => /^\d{2}:\d{2}$/.test(r.start) && /^\d{2}:\d{2}$/.test(r.end)) &&
      newRows.every((r) => r.start < r.end)
    if (!valid) {
      setError(t('edit_table_validation_error'))
      return
    }
    setError(null)
    const trimmedName = tableName.trim()
    const newTimeJson = buildTimeJsonFromRows(newRows)
    const bindChanged = pendingBind !== (tbl.periodTableId ?? null)
    if (bindChanged && pendingBind != null) {
      // issue#40 §5.3: 换绑须先预览确认 — 弹换绑确认框, 确认才写
      setPendingRebind(pendingBind)
      return
    }
    void (async () => {
      if (bindChanged) {
        // issue#40 §5.3: 解绑 — 只写 periodTableId=null, 课程行零改动
        await bindPeriodTable(tbl.id, null)
      } else if (effectivePeriodTable != null) {
        // issue#40: 节次编辑区改的是共享作息表 — 写回 period_tables +
        // 同步全部绑定课表兼容列(§5.2); 课程行零改动(§9.1)
        await updatePeriodTableContent({
          ...effectivePeriodTable,
          timeJson: newTimeJson,
          smartConfigJson: smartJson,
          nodesPerDay: Math.max(1, newRows.length),
        })
      } else {
        await updateTableRemappingCourses({
          ...tbl,
          name: trimmedName === '' ? tbl.name : trimmedName,
          startDate: normalizeStartDate(tableStart),
          maxWeek,
          timeJson: newTimeJson,
          smartConfigJson: smartJson,
        })
      }
      settle(onSaved)()
    })()
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Header onBack={handleBack} title={t('edit_table_title')} />

      {/* 基础信息 */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="m3-title-medium" style={{ fontWeight: 600 }}>{t('edit_table_basic_info')}</div>
        <Field label={t('edit_table_name')} value={name} onChange={setName} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('edit_table_start_date')}
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={fieldStyle}
          />
        </label>
        <Field
          label={t('edit_table_max_week')}
          value={maxWeekText}
          onChange={(v) => setMaxWeekText(v.replace(/\D/g, ''))}
          inputMode="numeric"
        />
      </div>

      {/* 节次时间表 (可折叠) — v1.0.56 T6 第三 Tab「作息表」= 换绑入口 */}
      <TimeSlotSection
        expanded={timeSlotsExpanded}
        onToggle={() => setTimeSlotsExpanded((v) => !v)}
        rows={slotRows}
        onRowsChange={setRowsDraft}
        smartConfig={decodeSmartConfig(effectiveSmartJson) ?? inferSmartConfig(parseTimeSlotRows(effectiveTimeJson))}
        onSmartConfigChange={setSmartConfig}
        onSave={handleSave}
        periodTableOptions={allPeriodTables.map((pt) => ({
          id: pt.id, name: pt.name, nodesPerDay: pt.nodesPerDay,
        }))}
        selectedPeriodTableId={pendingBind}
        onSelectPeriodTable={setPendingBind}
      />

      {error && (
        <div role="alert" className="m3-body-medium" style={{ color: 'var(--md-error)' }}>{error}</div>
      )}

      {/* 保存 */}
      <button
        onClick={() => handleSave(slotRows)}
        style={{
          padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <IconCheck size={18} /> {t('edit_table_save')}
      </button>

      {/* 删除 — 最后一张表也可删 (用户 2026-09-03), 空态由 Schedule 兜底;
          待保存的新表隐藏删除键 (EditTableScreen.kt:312: pendingNewTableId == null 才渲染) */}
      {pendingNewTableId == null && (
      <button
        onClick={() => setShowDeleteConfirm(true)}
        style={{
          padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'var(--md-error-container)', color: 'var(--md-on-error-container)',
          fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <IconClose size={18} /> {t('edit_table_delete')}
      </button>
      )}

      {showDeleteConfirm && (
        <Overlay onDismiss={() => setShowDeleteConfirm(false)}>
          <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('edit_table_delete_confirm')}</h2>
          <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {courseCount > 0
              ? t('edit_table_delete_msg_count', { v1: table.name, v2: courseCount })
              : t('edit_table_delete_msg', { v1: table.name })}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{ ...ghostBtnStyle }}
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                void deleteTable(table.id).then(settle(onDeleted))
              }}
              style={{ padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', color: 'var(--md-error)', background: 'transparent', fontWeight: 600 }}
            >
              {t('delete')}
            </button>
          </div>
        </Overlay>
      )}

      {/* issue#40 §5.3: 换绑确认 — 换绑后本课表按新作息表解释节次, 自定义时间课程不受影响 */}
      {pendingRebind != null && (
        <Overlay onDismiss={() => setPendingRebind(null)}>
          <h2 className="m3-title-medium" style={{ margin: 0 }}>
            {t('period_table_bind_preview_title')}
          </h2>
          <p className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('period_table_bind_preview_body')}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPendingRebind(null)} style={{ ...ghostBtnStyle }}>
              {t('cancel')}
            </button>
            <button
              onClick={() => {
                const targetId = pendingRebind
                setPendingRebind(null)
                void bindPeriodTable(table.id, targetId).then(settle(onSaved))
              }}
              style={{
                padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600,
              }}
            >
              {t('period_table_preview_confirm')}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

// ── 基础组件 ─────────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  background: 'var(--md-surface-container-high)',
  color: 'var(--md-on-surface)',
  border: '1px solid var(--md-outline)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 14,
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


function Field({
  label, value, onChange, inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: 'numeric' | 'text'
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        style={fieldStyle}
      />
    </label>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="back"
        style={{
          padding: '8px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--md-on-surface)', fontSize: 18,
        }}
      >
        <IconArrowBack size={20} />
      </button>
      <h1 className="m3-headline-medium" style={{ margin: 0 }}>{title}</h1>
    </div>
  )
}

function Overlay({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
