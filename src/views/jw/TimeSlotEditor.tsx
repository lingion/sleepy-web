/**
 * TimeSlotEditor — Android JwCourseConfirmPage.TimeSlotEditor 的 web 移植。
 *
 * 手动模式: 逐节 开始/结束 + 添加一节 + 删除此节 (仅剩 1 节时禁用, 删除后重编号)。
 * 自动模式: 每节时长 / 总节数 / 第一节开始 + 课间分配 → deriveRows() 生成整表。
 *
 * 自动模式的 SmartPeriodEditor 在 EditTableView.tsx 里是私有组件 (本任务禁改该文件),
 * 故按同一 domain/smartPeriod API 在 jw/ 下重做一份精简等价实现。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  breakDisplayLabel,
  deriveRows,
  effectiveAssignments,
  type SmartPeriodConfig,
} from '../../domain/smartPeriod'
import { appendEmptyRow, removeAndRenumber, type TimeSlotRow } from '../../domain/timeTable'
import { IconAdd, IconDelete } from '../../components/icons'
import { SegmentedSwitcher } from '../mine/shared'

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--md-outline)',
  background: 'var(--md-surface)',
  color: 'var(--md-on-surface)',
  font: 'inherit',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--md-on-surface-variant)',
}

export function TimeSlotEditor({
  rows,
  onRowsChange,
  smartConfig,
  onSmartConfigChange,
}: {
  rows: TimeSlotRow[]
  onRowsChange: (rows: TimeSlotRow[]) => void
  smartConfig: SmartPeriodConfig
  onSmartConfigChange: (cfg: SmartPeriodConfig) => void
}) {
  const { t } = useTranslation()
  const [auto, setAuto] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SegmentedSwitcher
        options={[t('mode_manual'), t('mode_auto')]}
        selected={auto ? 1 : 0}
        onSelect={(i) => setAuto(i === 1)}
        compact
      />
      {auto ? (
        <SmartPeriodEditor
          config={smartConfig}
          onChange={(cfg) => {
            onSmartConfigChange(cfg)
            onRowsChange(deriveRows(cfg))
          }}
        />
      ) : (
        <ManualPeriodEditor rows={rows} onRowsChange={onRowsChange} />
      )}
    </div>
  )
}

// ── 手动模式 ────────────────────────────────────────────────────────────

function ManualPeriodEditor({
  rows,
  onRowsChange,
}: {
  rows: TimeSlotRow[]
  onRowsChange: (rows: TimeSlotRow[]) => void
}) {
  const { t } = useTranslation()
  const setTime = (node: number, key: 'start' | 'end', value: string) =>
    onRowsChange(rows.map((r) => (r.node === node ? { ...r, [key]: value } : r)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="m3-title-small" style={{ flex: 1, fontWeight: 600 }}>
          {t('n_periods', { v1: rows.length })}
        </span>
        <button
          type="button"
          className="m3-btn-regular"
          onClick={() => onRowsChange(appendEmptyRow(rows))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <IconAdd size={16} />
          {t('add_period')}
        </button>
      </div>

      {rows.map((row) => (
        <div key={row.node} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="m3-body-medium" style={{ width: 62, flexShrink: 0 }}>
            {t('course_node_format', { v1: String(row.node) })}
          </span>
          <input
            type="time"
            aria-label={`${t('course_node_format', { v1: String(row.node) })} ${t('start_label')}`}
            value={row.start}
            onChange={(e) => setTime(row.node, 'start', e.target.value)}
            style={inputStyle}
          />
          <input
            type="time"
            aria-label={`${t('course_node_format', { v1: String(row.node) })} ${t('end_label')}`}
            value={row.end}
            onChange={(e) => setTime(row.node, 'end', e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            aria-label={t('delete_period')}
            disabled={rows.length <= 1}
            onClick={() => onRowsChange(removeAndRenumber(rows, row.node))}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
              border: 'none', background: 'transparent', cursor: rows.length <= 1 ? 'default' : 'pointer',
              color: rows.length <= 1 ? 'var(--md-outline)' : 'var(--md-error)', font: 'inherit',
            }}
          >
            <IconDelete size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── 自动模式 (SmartPeriodEditor.kt 精简等价) ───────────────────────────

function SmartPeriodEditor({
  config,
  onChange,
}: {
  config: SmartPeriodConfig
  onChange: (cfg: SmartPeriodConfig) => void
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<SmartPeriodConfig>) => onChange({ ...config, ...patch })
  const assigns = effectiveAssignments(config)
  const preview = deriveRows(config)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>{t('edit_period_duration_label')}</span>
          <input
            type="number"
            min={1}
            value={config.periodMinutes}
            onChange={(e) => set({ periodMinutes: Math.max(1, Number(e.target.value) || 1) })}
            style={inputStyle}
          />
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>{t('edit_period_total_label')}</span>
          <input
            type="number"
            min={1}
            value={config.totalPeriods}
            onChange={(e) => set({ totalPeriods: Math.max(1, Number(e.target.value) || 1) })}
            style={inputStyle}
          />
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={labelStyle}>{t('edit_period_first_start')}</span>
          <input
            type="time"
            value={config.startTime}
            onChange={(e) => set({ startTime: e.target.value })}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="m3-btn-regular"
          onClick={() => set({ breaks: [...config.breaks, { minutes: 10, isLong: false }] })}
        >
          {t('add_label', { v1: t('short_break') })}
        </button>
        <button
          type="button"
          className="m3-btn-regular"
          onClick={() => set({ breaks: [...config.breaks, { minutes: 30, isLong: true }] })}
        >
          {t('add_label', { v1: t('long_break') })}
        </button>
      </div>

      {config.breaks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('break_assign_hint')}
          </span>
          {config.breaks.map((br, bi) => (
            <div key={bi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min={1}
                aria-label={breakDisplayLabel(br)}
                value={br.minutes}
                onChange={(e) =>
                  set({
                    breaks: config.breaks.map((b, i) =>
                      i === bi ? { ...b, minutes: Math.max(1, Number(e.target.value) || 1) } : b
                    ),
                  })
                }
                style={{ ...inputStyle, maxWidth: 88 }}
              />
              <span className="m3-body-small">{t('unit_minutes')}</span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                aria-label={t('delete')}
                onClick={() =>
                  set({
                    breaks: config.breaks.filter((_, i) => i !== bi),
                    transitionAssignments: config.transitionAssignments.map((v) =>
                      v === null ? null : v > bi ? v - 1 : null
                    ),
                  })
                }
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--md-error)' }}
              >
                <IconDelete size={16} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {assigns.map((assigned, ti) => (
              <label key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                  {t('course_node_format', { v1: String(ti + 1) })}
                </span>
                <select
                  value={assigned === null ? '' : String(assigned)}
                  onChange={(e) => {
                    const next = [...assigns]
                    next[ti] = e.target.value === '' ? null : Number(e.target.value)
                    set({ transitionAssignments: next })
                  }}
                  style={{ ...inputStyle, flex: 'none', width: 96 }}
                >
                  <option value="">—</option>
                  {config.breaks.map((br, bi) => (
                    <option key={bi} value={String(bi)}>
                      {br.minutes}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="m3-card" style={{ padding: 10 }}>
        <div className="m3-label-medium" style={{ marginBottom: 6 }}>{t('preview')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {preview.map((r) => (
            <span key={r.node} className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
              {t('course_node_format', { v1: String(r.node) })} {r.start}-{r.end}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
