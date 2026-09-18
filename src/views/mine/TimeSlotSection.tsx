/**
 * 时间节次编辑共用件 — EditTableView / PeriodTableEditPage 共用 (issue#40 T6 同构)。
 * 从 EditTableView.tsx 原样抽出: TimeSlotSection (折叠壳+手动/自动 Tab) 及
 * ManualTimeSlotEditor / SmartPeriodEditor / BreakGroupSection / PreviewList /
 * AddBreakChip / NumberField 子组件与 fieldStyle 等本地样式。
 * 语义不变 — Android 两侧共用 TimeSlotEditor 同款交互。
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClose, IconDelete } from '../../components/icons'
import { SegmentedSwitcher } from './shared'
import {
  breakDisplayLabel,
  deriveRows,
  effectiveAssignments,
  effectiveTransitionMinutes,
  type BreakOption,
  type SmartPeriodConfig,
} from '../../domain/smartPeriod'
import { appendEmptyRow, removeAndRenumber, type TimeSlotRow } from '../../domain/timeTable'

// ── 节次时间表折叠节 — TimeSlotEditor.kt 1:1 (手动/自动 Tab + 智慧节次) ─────

export function TimeSlotSection({
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
