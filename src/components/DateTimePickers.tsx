/**
 * DateTimePickers — ui/component/DateTimePickers.kt 的 DatePickerField / DatePickerDialog 同构。
 * DatePickerField: 填充文本框(weight 1) + 起始 4dp 的日历 IconButton(CalendarMonth 24 primary)。
 * DatePickerDialog: M3 DatePickerDialog 形态 (surfaceContainerHigh r28, 底部右对齐色块按钮
 * 确定=primary / 取消=secondaryContainer, 圆角 shapes.medium=12); 未选日期时确定只关闭。
 * 平台差异: M3 月历网格 → 浏览器原生 date 输入 (选择结果同为本地日期 yyyy-MM-dd)。
 */

import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { isIsoDate } from '../domain/holiday/ranges'
import { FilledTextField } from './FilledTextField'
import { IconCalendarMonth } from './icons'

export function DatePickerField({
  value, onValueChange, label, isError = false, style,
}: {
  value: string
  onValueChange: (value: string) => void
  label: string
  isError?: boolean
  style?: CSSProperties
}) {
  const { t } = useTranslation()
  const [showPicker, setShowPicker] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', ...style }}>
      <FilledTextField label={label} value={value} onChange={onValueChange} isError={isError} style={{ flex: 1, minWidth: 0 }} />
      <button
        type="button"
        aria-label={t('select_date')}
        onClick={() => setShowPicker(true)}
        style={{
          marginLeft: 4, width: 48, height: 48, flexShrink: 0, borderRadius: 24, border: 'none', padding: 0,
          background: 'transparent', color: 'var(--md-primary)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <IconCalendarMonth size={24} />
      </button>
      {showPicker && (
        <DatePickerDialog
          onConfirm={(iso) => {
            onValueChange(iso)
            setShowPicker(false)
          }}
          onDismiss={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

/** rememberDatePickerState() 无初值 → 打开时未选中; onConfirm 仅在选中有效日期时触发 */
export function DatePickerDialog({ onConfirm, onDismiss }: { onConfirm: (iso: string) => void; onDismiss: () => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState('')
  return (
    <div
      className="m3-scrim-overlay"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('select_date')}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '100%', boxSizing: 'border-box', borderRadius: 28,
          background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="m3-label-large" style={{ padding: '16px 12px 0 24px', color: 'var(--md-on-surface-variant)' }}>
          {t('select_date')}
        </div>
        <div style={{ padding: '16px 24px' }}>
          <input
            type="date"
            aria-label={t('select_date')}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="m3-body-large"
            style={{
              width: '100%', height: 56, boxSizing: 'border-box', padding: '0 16px', border: 'none', outline: 'none',
              borderRadius: 12, background: 'var(--md-surface-container-highest)', color: 'var(--md-on-surface)',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 6px 8px 0' }}>
          <PickerButton
            label={t('cancel')}
            onClick={onDismiss}
            container="var(--md-secondary-container)"
            content="var(--md-on-secondary-container)"
          />
          <PickerButton
            label={t('ok')}
            onClick={() => {
              if (isIsoDate(selected)) onConfirm(selected)
              else onDismiss()
            }}
            container="var(--md-primary)"
            content="var(--md-on-primary)"
          />
        </div>
      </div>
    </div>
  )
}

/** M3 Button 默认尺寸 (minHeight 40, 内边距 24×8, labelLarge), shape 由调用方给 medium(12) */
function PickerButton({ label, onClick, container, content }: { label: string; onClick: () => void; container: string; content: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="m3-label-large"
      style={{
        minHeight: 40, padding: '8px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: container, color: content, whiteSpace: 'nowrap', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}
