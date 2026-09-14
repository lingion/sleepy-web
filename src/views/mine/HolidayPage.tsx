/**
 * HolidayPage — 节假日灰显 + 范围化规则编辑器 (HolidaySettingsScreen.kt 1:1)。
 * 年份切换 (2005–2049) + 数据源卡(刷新/失败/空态) + 三开关 + 灰显样式分段 +
 * 节假日/补班段列表(点击编辑, 自定义/补班 badge) + 已删除区(恢复默认) +
 * 添加自定义段 + 编辑弹窗(起止日期/名称/类型, 校验 end>=start)。
 * 覆盖段持久化 holidayStore (KEY_HOLIDAY_OVERRIDES 同构), 课表灰显即时消费。
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefsStore } from '../../state/prefsStore'
import { useHolidayStore } from '../../state/holidayStore'
import {
  TYPE_PUBLIC_HOLIDAY,
  TYPE_TRANSFER_WORKDAY,
  isIsoDate,
  mergeSegments,
  newId,
  sourceKeyOf,
  type HolidayRange,
} from '../../domain/holiday/ranges'
import { IconChevronLeft, IconChevronRight, IconRefresh } from '../../components/icons'
import { SettingsScaffold, ToggleRow, HDiv, FlatCard, SectionHeader, SegmentedSwitcher } from './shared'

const MIN_YEAR = 2005
const MAX_YEAR = 2049

/** 弹窗编辑目标: isNew=true 添加模式; 网络段派生目标会预填 sourceKey */
interface EditingTarget {
  range: HolidayRange
  isNew: boolean
}

/** 段日期展示: 单日 M/d, 跨日 M/d – M/d (segmentDateLabel) */
function segmentDateLabel(seg: HolidayRange): string {
  const slash = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
  if (seg.startDate === seg.endDate) return slash(seg.startDate)
  return `${slash(seg.startDate)} – ${slash(seg.endDate)}`
}

/** 行点击 → 编辑目标 (resolveEditTarget): 网络段复制一份并补 sourceKey */
function resolveEditTarget(segment: HolidayRange, userRangeIds: Set<string>): EditingTarget {
  if (userRangeIds.has(segment.id)) return { range: segment, isNew: false }
  return { range: { ...segment, sourceKey: sourceKeyOf(segment.type, segment.startDate) }, isNew: false }
}

export function HolidayPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const prefs = usePrefsStore((s) => s.prefs)
  const update = usePrefsStore((s) => s.update)
  const entries = useHolidayStore((s) => s.entries)
  const status = useHolidayStore((s) => s.status)
  const overrides = useHolidayStore((s) => s.overrides)
  const load = useHolidayStore((s) => s.load)
  const saveRange = useHolidayStore((s) => s.saveRange)
  const deleteRange = useHolidayStore((s) => s.deleteRange)
  const restoreRange = useHolidayStore((s) => s.restoreRange)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [editing, setEditing] = useState<EditingTarget | null>(null)

  useEffect(() => {
    void load(year)
  }, [year, load])

  const yearEntries = entries[year] ?? []
  const yearStatus = status[year] ?? 'loading'
  // 覆盖变化时基于原始网络数据即时重合并, 不重新走网络 (Android 同语义)
  const merged = useMemo(() => mergeSegments(yearEntries, overrides), [yearEntries, overrides])
  const userRangeIds = useMemo(() => new Set(overrides.map((o) => o.id)), [overrides])
  const holidaySegments = merged.active.filter((s) => s.type === TYPE_PUBLIC_HOLIDAY)
  const workdaySegments = merged.active.filter((s) => s.type === TYPE_TRANSFER_WORKDAY)

  return (
    <SettingsScaffold title={t('holiday_page_title')} onBack={onBack}>
      {/* 年份切换 (ChevronLeft | year | ChevronRight) */}
      <div className="m3-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
        <IconBtn label={t('holiday_year_prev')} disabled={year <= MIN_YEAR} onClick={() => setYear((y) => y - 1)}>
          <IconChevronLeft size={22} />
        </IconBtn>
        <span className="m3-title-medium" style={{ fontWeight: 600, padding: '0 16px' }}>{year}</span>
        <IconBtn label={t('holiday_year_next')} disabled={year >= MAX_YEAR} onClick={() => setYear((y) => y + 1)}>
          <IconChevronRight size={22} />
        </IconBtn>
      </div>

      {/* 数据源单行卡: 标题+URL 同行, 刷新=图标; Failed/Empty 提示行挂卡底 */}
      <div className="m3-card" style={{ padding: '6px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <span className="m3-title-small" style={{ fontWeight: 600 }}>{t('holiday_data_source')}</span>
          <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t('holiday_source_label')}
          </span>
          {yearStatus === 'loading' ? (
            <span className="holiday-spinner" aria-label={t('holiday_data_refresh')} />
          ) : (
            <IconBtn label={t('holiday_data_refresh')} onClick={() => void load(year, true)}>
              <IconRefresh size={20} />
            </IconBtn>
          )}
        </div>
        {yearStatus === 'failed' && (
          <div className="m3-body-small" style={{ color: 'var(--md-error)', padding: '4px 0 6px' }}>{t('holiday_data_failed')}</div>
        )}
        {yearStatus === 'loaded' && yearEntries.length === 0 && (
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)', padding: '4px 0 6px' }}>{t('holiday_data_empty')}</div>
        )}
      </div>

      {/* 三开关卡 (HolidaySettingsScreen 同构) */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ToggleRow
          label={t('settings_holiday_holiday')}
          subtitle={t('settings_holiday_holiday_sub')}
          checked={prefs.holidayGreyHoliday}
          onChange={(v) => void update({ holidayGreyHoliday: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_holiday_weekend')}
          subtitle={t('settings_holiday_weekend_sub')}
          checked={prefs.holidayGreyWeekend}
          onChange={(v) => void update({ holidayGreyWeekend: v })}
        />
        <HDiv />
        <ToggleRow
          label={t('settings_holiday_workday')}
          subtitle={t('settings_holiday_workday_sub')}
          checked={prefs.holidayIgnoreWorkday}
          onChange={(v) => void update({ holidayIgnoreWorkday: v })}
        />
      </div>

      {/* 灰显样式分段 */}
      <FlatCard
        title={t('settings_holiday_style')}
        options={[t('settings_holiday_style_grey'), t('settings_holiday_style_strikethrough')]}
        selectedKey={prefs.holidayStyle === 'strikethrough' ? 1 : 0}
        onSelect={(i) => void update({ holidayStyle: i === 1 ? 'strikethrough' : 'grey' })}
      />

      {yearStatus === 'loaded' && (
        <>
          {holidaySegments.length > 0 && (
            <>
              <SectionHeader title={t('holiday_list_holidays')} />
              <RangeListCard
                segments={holidaySegments}
                userRangeIds={userRangeIds}
                onEdit={(seg) => setEditing(resolveEditTarget(seg, userRangeIds))}
              />
            </>
          )}
          {workdaySegments.length > 0 && (
            <>
              <SectionHeader title={t('holiday_list_workdays')} />
              <RangeListCard
                segments={workdaySegments}
                userRangeIds={userRangeIds}
                showWorkdayBadge
                onEdit={(seg) => setEditing(resolveEditTarget(seg, userRangeIds))}
              />
            </>
          )}
          {merged.removed.length > 0 && (
            <>
              <SectionHeader title={t('holiday_removed_section')} />
              <RemovedCard segments={merged.removed} onRestore={restoreRange} />
            </>
          )}
          <button
            type="button"
            className="m3-btn-regular"
            onClick={() =>
              setEditing({
                range: {
                  id: newId(),
                  name: '',
                  startDate: `${year}-01-01`,
                  endDate: `${year}-01-01`,
                  type: TYPE_PUBLIC_HOLIDAY,
                  sourceKey: null,
                },
                isNew: true,
              })
            }
            style={{
              width: '100%', border: 'none', cursor: 'pointer',
              background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
              fontSize: 14, fontWeight: 600,
            }}
          >
            {t('holiday_add_entry')}
          </button>
        </>
      )}

      {editing && (
        <EditDialog
          target={editing.range}
          isNew={editing.isNew}
          onDismiss={() => setEditing(null)}
          onSave={(range) => {
            saveRange(range)
            setEditing(null)
          }}
          onDelete={(range) => {
            deleteRange(range)
            setEditing(null)
          }}
        />
      )}
    </SettingsScaffold>
  )
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40, height: 40, borderRadius: 20, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: 'transparent', color: 'var(--md-on-surface-variant)',
        opacity: disabled ? 0.38 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

/** 段列表卡: 名称 + 自定义/补班 badge + 起止日期; 行点击进入编辑 */
function RangeListCard({
  segments,
  userRangeIds,
  showWorkdayBadge = false,
  onEdit,
}: {
  segments: HolidayRange[]
  userRangeIds: Set<string>
  showWorkdayBadge?: boolean
  onEdit: (seg: HolidayRange) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="m3-card" style={{ padding: '8px 16px' }}>
      {segments.map((seg, i) => (
        <div key={seg.id}>
          <div
            onClick={() => onEdit(seg)}
            style={{ display: 'flex', alignItems: 'center', padding: '10px 0', cursor: 'pointer' }}
          >
            <span className="m3-body-large" style={{ flex: 1 }}>
              {seg.name || segmentDateLabel(seg)}
            </span>
            {userRangeIds.has(seg.id) && <Badge text={t('holiday_custom_badge')} tint="var(--md-on-surface-variant)" />}
            {showWorkdayBadge && <Badge text={t('holiday_workday_badge')} tint="var(--md-primary)" />}
            <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{segmentDateLabel(seg)}</span>
          </div>
          {i !== segments.length - 1 && <HDiv />}
        </div>
      ))}
    </div>
  )
}

function Badge({ text, tint }: { text: string; tint: string }) {
  return (
    <span
      className="m3-label-small"
      style={{
        background: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint,
        borderRadius: 8, padding: '2px 8px', marginRight: 12,
      }}
    >
      {text}
    </span>
  )
}

/** 已删除区块: 行尾"恢复默认"移除覆盖使网络段回来 */
function RemovedCard({ segments, onRestore }: { segments: HolidayRange[]; onRestore: (seg: HolidayRange) => void }) {
  const { t } = useTranslation()
  return (
    <div className="m3-card" style={{ padding: '8px 16px' }}>
      {segments.map((seg, i) => (
        <div key={seg.id}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
            <span className="m3-body-large" style={{ flex: 1, color: 'var(--md-on-surface-variant)' }}>
              {seg.name || segmentDateLabel(seg)}
            </span>
            <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{segmentDateLabel(seg)}</span>
            <button
              type="button"
              onClick={() => onRestore(seg)}
              style={{
                marginLeft: 12, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', padding: '0 16px',
                background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {t('holiday_restore')}
            </button>
          </div>
          {i !== segments.length - 1 && <HDiv />}
        </div>
      ))}
    </div>
  )
}

/**
 * 编辑/添加弹窗 (HolidayRangeEditDialog 同构)。
 * 校验: start/end 均有效且 end >= start, 否则禁用保存并提示。
 * 删除: 用户段=移除覆盖; 网络段=写 REMOVED 覆盖 (holidayStore.deleteRange)。
 */
function EditDialog({
  target,
  isNew,
  onDismiss,
  onSave,
  onDelete,
}: {
  target: HolidayRange
  isNew: boolean
  onDismiss: () => void
  onSave: (range: HolidayRange) => void
  onDelete: (range: HolidayRange) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(target.name)
  const [startText, setStartText] = useState(target.startDate)
  const [endText, setEndText] = useState(target.endDate)
  const [type, setType] = useState(target.type)

  const startOk = isIsoDate(startText)
  const endOk = isIsoDate(endText)
  const datesValid = startOk && endOk && endText >= startText
  const showInvalid = !datesValid && (startText !== '' || endText !== '')

  const fieldStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--md-surface-container-highest)', border: 'none', outline: 'none',
    borderRadius: 12, padding: '10px 12px', fontSize: 14, color: 'var(--md-on-surface)',
  }

  return (
    <div
      className="m3-scrim-overlay"
      onClick={onDismiss}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(isNew ? 'holiday_add_title' : 'holiday_edit_title')}
        className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}
      >
        <div className="m3-title-large">{t(isNew ? 'holiday_add_title' : 'holiday_edit_title')}</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('holiday_name_label_date')}</span>
          <input type="date" value={startText} onChange={(e) => setStartText(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('holiday_name_label_end')}</span>
          <input type="date" value={endText} onChange={(e) => setEndText(e.target.value)} style={fieldStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('holiday_name_label')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
        </label>
        <SegmentedSwitcher
          options={[t('holiday_type_holiday'), t('holiday_type_workday')]}
          selected={type === TYPE_TRANSFER_WORKDAY ? 1 : 0}
          onSelect={(i) => setType(i === 1 ? TYPE_TRANSFER_WORKDAY : TYPE_PUBLIC_HOLIDAY)}
        />
        {showInvalid && (
          <div className="m3-body-small" style={{ color: 'var(--md-error)' }}>{t('holiday_date_invalid')}</div>
        )}
        {!isNew && (
          <button
            type="button"
            onClick={() => onDelete(target)}
            style={{
              width: '100%', height: 48, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'var(--md-error-container)', color: 'var(--md-on-error-container)',
              fontSize: 14, fontWeight: 600,
            }}
          >
            {t('holiday_delete_range')}
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <TextBtn onClick={onDismiss}>{t('cancel')}</TextBtn>
          <TextBtn
            disabled={!datesValid}
            onClick={() => {
              if (!datesValid) return
              onSave({ ...target, name: name.trim(), startDate: startText, endDate: endText, type })
            }}
          >
            {t('save')}
          </TextBtn>
        </div>
      </div>
    </div>
  )
}

function TextBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 'none', cursor: disabled ? 'default' : 'pointer', background: 'transparent',
        color: 'var(--md-primary)', opacity: disabled ? 0.38 : 1,
        fontSize: 14, fontWeight: 600, padding: '10px 16px', borderRadius: 12,
      }}
    >
      {children}
    </button>
  )
}
