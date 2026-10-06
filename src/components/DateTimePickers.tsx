/**
 * DateTimePickers — ui/component/DateTimePickers.kt 的 DatePickerField / DatePickerDialog 同构。
 * DatePickerField: 填充文本框(weight 1) + 起始 4dp 的日历 IconButton(CalendarMonth 24 primary)。
 * DatePickerDialog: M3 DatePickerDialog 形态 (surfaceContainerHigh r28, 底部右对齐色块按钮
 * 确定=primary / 取消=secondaryContainer, 圆角 shapes.medium=12); 未选日期时确定只关闭。
 * 平台差异: M3 月历网格 → 浏览器原生 date 输入 (选择结果同为本地日期 yyyy-MM-dd)。
 * TimePickerField: clip(fieldShape) 的 noRippleClickable 外框包 enabled=false 的 TextField, 无 clock 图标;
 * 点击弹 AlertDialog(select_time) 内含 TimePicker + 12 间距 + DialogActionButtons(ok/cancel)。
 * 平台差异: M3 表盘 TimePicker → 浏览器原生 time 输入 (24h, 结果 HH:MM)。
 */

import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { isIsoDate } from '../domain/holiday/ranges'
import { AlertDialog } from './AlertDialog'
import { DialogActionButtons } from './DialogActionButtons'
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

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** rememberTimePickerState(initialHour = 解析失败 8, initialMinute = 解析失败 0) */
function initialTime(value: string): string {
  const h = Number.parseInt(value.split(':')[0] ?? '', 10)
  const m = Number.parseInt(value.split(':')[1] ?? '', 10)
  const hh = Number.isInteger(h) && h >= 0 && h < 24 ? h : 8
  const mm = Number.isInteger(m) && m >= 0 && m < 60 ? m : 0
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function TimePickerField({
  value, onValueChange, label, style,
}: {
  value: string
  onValueChange: (value: string) => void
  label: string
  style?: CSSProperties
}) {
  const { t } = useTranslation()
  const [showPicker, setShowPicker] = useState(false)
  // timePickerState 只在首次组合时取初值, 之后跨开关保留 (取消后再开仍是上次拨到的时间)
  const [time, setTime] = useState(() => initialTime(value))
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={label || t('select_time')}
        onClick={() => setShowPicker(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setShowPicker(true)
          }
        }}
        style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer', ...style }}
      >
        <FilledTextField label={label} value={value} onChange={() => {}} readOnly />
      </div>
      {showPicker && (
        <TimePickerDialog
          time={time}
          onTimeChange={setTime}
          onConfirm={() => {
            onValueChange(time)
            setShowPicker(false)
          }}
          onDismiss={() => setShowPicker(false)}
        />
      )}
    </>
  )
}

export function TimePickerDialog({
  time, onTimeChange, onConfirm, onDismiss,
}: {
  time: string
  onTimeChange: (time: string) => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog title={t('select_time')} onDismiss={onDismiss}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="time"
          aria-label={t('select_time')}
          value={time}
          onChange={(e) => {
            if (HH_MM.test(e.target.value)) onTimeChange(e.target.value)
          }}
          className="m3-body-large"
          style={{
            width: '100%', height: 56, boxSizing: 'border-box', padding: '0 16px', border: 'none', outline: 'none',
            borderRadius: 12, background: 'var(--md-surface-container-highest)', color: 'var(--md-on-surface)',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ height: 12 }} />
        <DialogActionButtons confirmText={t('ok')} onConfirm={onConfirm} dismissText={t('cancel')} onDismiss={onDismiss} />
      </div>
    </AlertDialog>
  )
}
