/**
 * EditTableView — Kotlin EditTableScreen.kt 1:1 移植
 * 基础信息(名称/起始周一/总周数) + 可折叠节次时间表 + 保存(节次重映射) + 删除(明示课数)。
 * 保存走 updateTableRemappingCourses (issue#28 P3: timeJson 变了课程节次自适应)。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowBack, IconCheck, IconClose, IconDelete } from '../components/icons'
import { SegmentedSwitcher } from './mine/shared'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { usePendingTable } from '../state/pendingTable'
import {
  updateTableRemappingCourses,
  deleteTable,
  countCourses,
} from '../data/repository'
import {
  parseTimeSlotRows,
  buildTimeJsonFromRows,
  removeAndRenumber,
  appendEmptyRow,
  type TimeSlotRow,
} from '../domain/timeTable'
import {
  breakDisplayLabel,
  decodeSmartConfig,
  deriveRows,
  effectiveAssignments,
  effectiveTransitionMinutes,
  encodeSmartConfig,
  inferSmartConfig,
  type BreakOption,
  type SmartPeriodConfig,
} from '../domain/smartPeriod'
import { normalizeStartDateToMonday } from './importExportUtils'

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
    void updateTableRemappingCourses({
      ...tbl,
      name: trimmedName === '' ? tbl.name : trimmedName,
      startDate: normalizeStartDate(tableStart),
      maxWeek,
      timeJson: buildTimeJsonFromRows(newRows),
      smartConfigJson: smartJson,
    }).then(settle(onSaved))
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

      {/* 节次时间表 (可折叠) */}
      <TimeSlotSection
        expanded={timeSlotsExpanded}
        onToggle={() => setTimeSlotsExpanded((v) => !v)}
        rows={slotRows}
        onRowsChange={setRowsDraft}
        smartConfig={smartConfig}
        onSmartConfigChange={setSmartConfig}
        onSave={handleSave}
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
    </div>
  )
}

// ── 节次时间表折叠节 — TimeSlotEditor.kt 1:1 (手动/自动 Tab + 智慧节次) ─────

function TimeSlotSection({
  expanded, onToggle, rows, onRowsChange, smartConfig, onSmartConfigChange, onSave,
}: {
  expanded: boolean
  onToggle: () => void
  rows: TimeSlotRow[]
  onRowsChange: (rows: TimeSlotRow[]) => void
  smartConfig: SmartPeriodConfig
  onSmartConfigChange: (cfg: SmartPeriodConfig) => void
  onSave: (rows: TimeSlotRow[]) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')

  // Android LaunchedEffect(mode, smartConfig): 自动模式下 config 一变即 derive rows 同步上层
  useEffect(() => {
    if (mode === 'auto') onRowsChange(deriveRows(smartConfig))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, smartConfig])

  return (
    <div className="m3-card" style={{ overflow: 'hidden' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        style={{ display: 'flex', alignItems: 'center', padding: 16, cursor: 'pointer', gap: 8 }}
      >
        <div style={{ flex: 1 }}>
          <div className="m3-title-medium" style={{ fontWeight: 600 }}>{t('edit_table_time_slots')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('n_periods', { v1: rows.length })} · {expanded ? t('collapse') : t('expand')}
          </div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--md-on-surface-variant)', display: 'inline-flex', transition: 'transform 0.18s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          <ChevronDownIcon />
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SegmentedSwitcher
            options={[t('mode_manual'), t('mode_auto')]}
            selected={mode === 'manual' ? 0 : 1}
            onSelect={(i) => setMode(i === 0 ? 'manual' : 'auto')}
          />
          {mode === 'manual' ? (
            <ManualTimeSlotEditor rows={rows} onRowsChange={onRowsChange} onSave={onSave} />
          ) : (
            <SmartPeriodEditor config={smartConfig} onConfigChange={onSmartConfigChange} />
          )}
        </div>
      )}
    </div>
  )
}

// ── 手动模式 — ManualTimeSlotEditor 1:1 (逐节起止时间+增删节) ────────────────

function ManualTimeSlotEditor({
  rows, onRowsChange, onSave,
}: {
  rows: TimeSlotRow[]
  onRowsChange: (rows: TimeSlotRow[]) => void
  onSave: (rows: TimeSlotRow[]) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {rows.map((r, i) => (
        <div key={r.node} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="m3-label-medium" style={{ width: 28, color: 'var(--md-on-surface-variant)' }}>
            {t('course_node_format', { v1: r.node })}
          </span>
          <input
            type="time"
            value={r.start}
            aria-label={`${t('start_label')} ${t('course_node_format', { v1: r.node })}`}
            onChange={(e) => {
              const next = [...rows]
              next[i] = { ...r, start: e.target.value }
              onRowsChange(next)
            }}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <span style={{ color: 'var(--md-on-surface-variant)' }}>–</span>
          <input
            type="time"
            value={r.end}
            aria-label={`${t('end_label')} ${t('course_node_format', { v1: r.node })}`}
            onChange={(e) => {
              const next = [...rows]
              next[i] = { ...r, end: e.target.value }
              onRowsChange(next)
            }}
            style={{ ...fieldStyle, flex: 1 }}
          />
          {rows.length > 1 ? (
            <button
              type="button"
              aria-label={t('delete_period')}
              onClick={() => onRowsChange(removeAndRenumber(rows, r.node))}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                color: 'var(--md-error)', display: 'inline-flex', alignItems: 'center',
              }}
            >
              <IconDelete size={18} />
            </button>
          ) : (
            <span style={{ width: 26 }} />
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onRowsChange(appendEmptyRow(rows))} style={{ ...ghostBtnStyle, flex: 1 }}>
          + {t('add_period')}
        </button>
        <button onClick={() => onSave(rows)} style={{ ...ghostBtnStyle, flex: 1, color: 'var(--md-primary)' }}>
          {t('apply_to_all_slots')}
        </button>
      </div>
    </>
  )
}

// ── 自动模式 — SmartPeriodEditor.kt 1:1 (时长/节数/第一节/小大课间/分配/预览) ──

function SmartPeriodEditor({
  config, onConfigChange,
}: {
  config: SmartPeriodConfig
  onConfigChange: (cfg: SmartPeriodConfig) => void
}) {
  const { t } = useTranslation()
  const assigns = effectiveAssignments(config)
  const set = (patch: Partial<SmartPeriodConfig>) => onConfigChange({ ...config, ...patch })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ===== 输入区 ===== */}
      <div className="m3-title-small" style={{ fontWeight: 500, paddingInline: 4 }}>{t('edit_period_input')}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <NumberField
          label={t('edit_period_duration_label')}
          unit={t('unit_minutes')}
          value={config.periodMinutes}
          onChange={(v) => set({ periodMinutes: Math.max(1, v) })}
          style={{ flex: 1 }}
        />
        <NumberField
          label={t('edit_period_total_label')}
          unit={t('unit_periods')}
          value={config.totalPeriods}
          onChange={(v) => set({ totalPeriods: Math.max(1, v) })}
          style={{ flex: 1 }}
        />
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('edit_period_first_start')}</span>
        <input
          type="time"
          value={config.startTime}
          onChange={(e) => set({ startTime: e.target.value })}
          style={fieldStyle}
        />
      </label>

      {/* 添加 break */}
      <div style={{ display: 'flex', gap: 8 }}>
        <AddBreakChip
          label={t('add_label', { v1: t('short_break') })}
          color="var(--md-on-tertiary-container)"
          bg="var(--md-tertiary-container)"
          onAdd={() => set({ breaks: [...config.breaks, { minutes: 10, isLong: false }] })}
        />
        <AddBreakChip
          label={t('add_label', { v1: t('long_break') })}
          color="var(--md-on-primary-container)"
          bg="var(--md-primary-container)"
          onAdd={() => set({ breaks: [...config.breaks, { minutes: 30, isLong: true }] })}
        />
      </div>

      {/* ===== Break 分组区 ===== */}
      {config.breaks.length > 0 && (
        <>
          <div className="m3-title-small" style={{ fontWeight: 500, paddingInline: 4 }}>{t('break_assign_hint')}</div>
          {config.breaks.map((br, groupIdx) => (
            <BreakGroupSection
              key={groupIdx}
              br={br}
              groupIdx={groupIdx}
              totalPeriods={config.totalPeriods}
              assigns={assigns}
              onMinuteChange={(newMin) =>
                set({ breaks: config.breaks.map((b, i) => (i === groupIdx ? { ...b, minutes: newMin } : b)) })
              }
              onToggle={(posIdx) => {
                const next = [...assigns]
                next[posIdx] = next[posIdx] === groupIdx ? null : groupIdx
                set({ transitionAssignments: next })
              }}
              onDelete={() => {
                // 删组后索引重映射: 被删组清空 + 大于被删索引全部减 1 (SmartPeriodEditor.kt 修复语义)
                const next = assigns.map((v) => (v === groupIdx ? null : v != null && v > groupIdx ? v - 1 : v))
                set({ breaks: config.breaks.filter((_, i) => i !== groupIdx), transitionAssignments: next })
              }}
            />
          ))}
        </>
      )}

      {/* ===== 预览 ===== */}
      <div className="m3-title-small" style={{ fontWeight: 500, paddingInline: 4, marginTop: 8 }}>{t('preview')}</div>
      <PreviewList config={config} />
    </div>
  )
}

function BreakGroupSection({
  br, groupIdx, totalPeriods, assigns, onMinuteChange, onToggle, onDelete,
}: {
  br: BreakOption
  groupIdx: number
  totalPeriods: number
  assigns: (number | null)[]
  onMinuteChange: (min: number) => void
  onToggle: (posIdx: number) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const groupColor = br.isLong ? 'var(--md-primary)' : 'var(--md-on-tertiary-container)'
  const n = Math.max(0, totalPeriods - 1)
  return (
    <div
      style={{
        background: 'var(--md-surface-container)', borderRadius: 12, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: groupColor, flexShrink: 0 }} />
        <span className="m3-label-large" style={{ flex: 1, fontWeight: 500 }}>{breakDisplayLabel(br)}</span>
        <NumberField label="" unit={t('unit_minutes')} value={br.minutes} onChange={onMinuteChange} style={{ width: 110 }} />
        <button
          type="button"
          aria-label={t('delete')}
          onClick={onDelete}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--md-on-surface-variant)', display: 'inline-flex',
          }}
        >
          <IconClose size={18} />
        </button>
      </div>
      {n > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6 }}>
          {Array.from({ length: n }, (_, posIdx) => {
            const selected = assigns[posIdx] === groupIdx
            return (
              <button
                key={posIdx}
                type="button"
                onClick={() => onToggle(posIdx)}
                className="m3-label-medium"
                style={{
                  minHeight: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: selected ? groupColor : 'var(--md-surface-container-high)',
                  color: selected ? 'var(--md-on-primary)' : 'var(--md-on-surface-variant)',
                  fontWeight: selected ? 700 : 400,
                }}
              >
                {posIdx + 1}.5
              </button>
            )
          })}
        </div>
      ) : (
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('break_min_two_periods')}</div>
      )}
    </div>
  )
}

function PreviewList({ config }: { config: SmartPeriodConfig }) {
  const { t } = useTranslation()
  const rows = deriveRows(config)
  const transMins = effectiveTransitionMinutes(config)
  const assigns = effectiveAssignments(config)
  if (rows.length === 0) {
    return <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('empty_placeholder')}</div>
  }
  return (
    <div
      style={{
        background: 'var(--md-surface-container)', borderRadius: 12, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}
    >
      {rows.map((slot, i) => {
        const mins = i < transMins.length ? transMins[i] : null
        const isLong = mins != null && mins > 0 && assigns[i] != null && config.breaks[assigns[i]!]?.isLong
        return (
          <div key={slot.node}>
            <div className="m3-body-small">{t('period_time_range', { v1: slot.node, v2: slot.start, v3: slot.end })}</div>
            {mins != null && (
              <div className="m3-body-small" style={{ fontWeight: mins > 0 ? 500 : 400, color: 'var(--md-on-surface-variant)' }}>
                {mins === 0
                  ? t('break_continuous_0')
                  : t('break_continuous_n', { v1: mins, v2: t(isLong ? 'long_break' : 'short_break') })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AddBreakChip({ label, color, bg, onAdd }: { label: string; color: string; bg: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="m3-label-large"
      style={{
        flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: bg, color, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}
    >
      <span style={{ fontSize: 15 }}>+</span> {label}
    </button>
  )
}

/** NumberField — 仅数字、≤4 位; 外部 value 变化时回写文本 (Android remember(value) 等价) */
function NumberField({
  label, unit, value, onChange, style,
}: {
  label: string
  unit: string
  value: number
  onChange: (v: number) => void
  style?: React.CSSProperties
}) {
  const [text, setText] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setText(String(value))
  }
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label !== '' && <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>}
      <div style={{ position: 'relative' }}>
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const nt = e.target.value
            if (/^\d{0,4}$/.test(nt)) {
              setText(nt)
              const p = parseInt(nt, 10)
              if (!Number.isNaN(p)) onChange(p)
            }
          }}
          style={{ ...fieldStyle, width: '100%', paddingInlineEnd: unit !== '' ? 40 : undefined }}
        />
        {unit !== '' && (
          <span
            className="m3-label-small"
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--md-on-surface-variant)' }}
          >
            {unit}
          </span>
        )}
      </div>
    </label>
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

function ChevronDownIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z" />
    </svg>
  )
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
