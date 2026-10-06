/**
 * HolidayPage — HolidaySettingsScreen.kt 1:1。
 * 卡序: 年份 → 数据源(刷新/失败) → 三开关 → 调休说明(卡内课表切换) → 灰显样式 →
 * [Loaded] 每个放假日段一张调休卡 → 失效映射卡 → 已删除区 → 添加假期段。
 * 调休映射按表存 (holidayStore.updateTransfer, AppPrefs.holiday_transfer_<id> 同构);
 * 卡内切表只换"正在编辑哪张表", 不动默认课表。覆盖段走 holidayStore (KEY_HOLIDAY_OVERRIDES)。
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { usePrefsStore } from '../../state/prefsStore'
import { getHolidayTransfers, useHolidayStore } from '../../state/holidayStore'
import { db } from '../../data/db'
import {
  TYPE_PUBLIC_HOLIDAY,
  TYPE_TRANSFER_WORKDAY,
  isIsoDate,
  mergeSegments,
  newId,
  sourceKeyOf,
  type HolidayRange,
} from '../../domain/holiday/ranges'
import type { HolidayTransferEntry } from '../../domain/holiday/transfers'
import {
  IconArrowDropDown,
  IconArrowForward,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconRefresh,
} from '../../components/icons'
import { AlertDialog } from '../../components/AlertDialog'
import { DatePickerDialog, DatePickerField } from '../../components/DateTimePickers'
import { DialogActionButtons } from '../../components/DialogActionButtons'
import { FilledTextField } from '../../components/FilledTextField'
import { SettingsScaffold, ToggleRow, HDiv, FlatCard, SectionHeader, SegmentedSwitcher } from './shared'

const MIN_YEAR = 2005
const MAX_YEAR = 2049

/** SleepyTheme.shapes.large + surfaceContainer — 本页所有卡片底 */
const cardStyle = { borderRadius: 16, background: 'var(--md-surface-container)', color: 'var(--md-on-surface)' } as const

/** 弹窗编辑目标: isNew=true 添加模式; 网络段派生目标会预填 sourceKey */
interface EditingTarget {
  range: HolidayRange
  isNew: boolean
}

/** DateUtils.shortDateSlash: "M/d" 不补零 */
function shortDateSlash(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
}

/** 段日期展示: 单日 M/d, 跨日 M/d – M/d */
function segmentDateLabel(seg: HolidayRange): string {
  if (seg.startDate === seg.endDate) return shortDateSlash(seg.startDate)
  return `${shortDateSlash(seg.startDate)} – ${shortDateSlash(seg.endDate)}`
}

/** "M/d (星期)" — dayNames[dayOfWeek.value - 1] */
function dayLabel(iso: string, dayNames: string[]): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${shortDateSlash(iso)} (${dayNames[(dow + 6) % 7]})`
}

function datesInRange(start: string, end: string): string[] {
  const out: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/** resolveEditTarget: 用户段原样编辑; 网络段复制一份并补 sourceKey 挂接 */
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
  const updateTransfer = useHolidayStore((s) => s.updateTransfer)
  const transferRevision = useHolidayStore((s) => s.transferRevision)
  const dayNames = t('@day_names', { returnObjects: true }) as string[]

  // tableDao.observeAll: ORDER BY createdAt DESC; tableId = 当前(默认)课表
  const allTables = useLiveQuery(() => db.timetables.toArray(), [])
  const tables = useMemo(
    () => [...(allTables ?? [])].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id),
    [allTables],
  )
  const tableId = tables.find((tb) => tb.isDefault === 1)?.id ?? null
  // remember(tableId) { activeTableId = tableId }: 默认课表一变, 卡内选择随之复位
  const [picked, setPicked] = useState<{ base: number | null; id: number } | null>(null)
  const activeTableId = picked !== null && picked.base === tableId ? picked.id : tableId
  // transferRevision 仅作重读信号: updateTransfer 写 localStorage 后递增
  const transfers = useMemo(() => getHolidayTransfers(activeTableId), [activeTableId, transferRevision])

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [editing, setEditing] = useState<EditingTarget | null>(null)

  useEffect(() => {
    void load(year)
  }, [year, load])

  const yearStatus = status[year] ?? 'loading'
  const yearEntries = entries[year]
  const merged = useMemo(() => mergeSegments(yearEntries ?? [], overrides), [yearEntries, overrides])
  const userRangeIds = useMemo(() => new Set(overrides.map((o) => o.id)), [overrides])
  const holidaySegments = merged.active.filter((s) => s.type === TYPE_PUBLIC_HOLIDAY)
  const workdaySegments = merged.active.filter((s) => s.type === TYPE_TRANSFER_WORKDAY)
  const workdayDates = [...new Set(workdaySegments.flatMap((s) => datesInRange(s.startDate, s.endDate)))].sort()
  const yearDates = new Set(holidaySegments.flatMap((s) => datesInRange(s.startDate, s.endDate)))
  const orphanEntries = transfers
    .filter((e) => !yearDates.has(e.sourceDate))
    .sort((a, b) => a.sourceDate.localeCompare(b.sourceDate))

  /** 设/清某放假日的"调到哪天上课"; 表 id 为空不落盘 */
  const saveTransfer = (sourceDate: string, targetDate: string | null, segmentId: string) => {
    if (activeTableId === null) return
    updateTransfer(activeTableId, sourceDate, targetDate, segmentId)
  }

  return (
    <SettingsScaffold title={t('holiday_page_title')} onBack={onBack}>
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px' }}>
        <IconBtn label={t('holiday_year_prev')} disabled={year <= MIN_YEAR} onClick={() => setYear((y) => y - 1)}>
          <IconChevronLeft />
        </IconBtn>
        <span className="m3-title-medium" style={{ fontWeight: 600, padding: '0 16px', color: 'var(--md-on-surface)' }}>{year}</span>
        <IconBtn label={t('holiday_year_next')} disabled={year >= MAX_YEAR} onClick={() => setYear((y) => y + 1)}>
          <IconChevronRight />
        </IconBtn>
      </div>

      <div style={{ ...cardStyle, padding: '6px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="m3-title-small" style={{ fontWeight: 600 }}>{t('holiday_data_source')}</span>
          <span
            className="m3-body-small"
            style={{ marginLeft: 10, flex: 1, minWidth: 0, color: 'var(--md-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {t('holiday_source_label')}
          </span>
          {yearStatus === 'loading' ? (
            <span role="progressbar" style={{ width: 18, height: 18, padding: 2, boxSizing: 'border-box', flexShrink: 0 }}>
              <span
                style={{
                  display: 'block', width: 14, height: 14, boxSizing: 'border-box', borderRadius: '50%',
                  border: '2px solid transparent', borderTopColor: 'var(--md-primary)',
                  animation: 'holiday-spin 0.9s linear infinite',
                }}
              />
            </span>
          ) : (
            <IconBtn label={t('holiday_data_refresh')} size={36} color="var(--md-on-surface-variant)" onClick={() => void load(year, true)}>
              <IconRefresh size={20} />
            </IconBtn>
          )}
        </div>
        {yearStatus === 'failed' && (
          <div className="m3-body-small" style={{ color: 'var(--md-error)', padding: '4px 0 6px' }}>{t('holiday_data_failed')}</div>
        )}
      </div>

      <div style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
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

      <div style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="m3-title-small" style={{ fontWeight: 600 }}>{t('holiday_makeup_title')}</span>
        <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t(tableId === null ? 'holiday_makeup_no_table' : 'holiday_makeup_subtitle')}
        </span>
        {tableId !== null && tables.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <SegmentedSwitcher
              options={tables.map((tb) => tb.name)}
              selected={tables.findIndex((tb) => tb.id === activeTableId)}
              onSelect={(i) => setPicked({ base: tableId, id: tables[i].id })}
              full
            />
          </div>
        )}
      </div>

      <FlatCard
        title={t('settings_holiday_style')}
        options={[t('settings_holiday_style_grey'), t('settings_holiday_style_strikethrough')]}
        selectedKey={prefs.holidayStyle === 'strikethrough' ? 1 : 0}
        onSelect={(i) => {
          const next = i === 1 ? 'strikethrough' : 'grey'
          if (prefs.holidayStyle !== next) void update({ holidayStyle: next })
        }}
      />

      {yearStatus === 'loaded' && (
        <>
          {holidaySegments.length > 0 && (
            <>
              {holidaySegments.map((seg) => (
                <HolidayTransferCard
                  key={seg.id}
                  segment={seg}
                  transfers={transfers}
                  workdayDates={workdayDates}
                  dayNames={dayNames}
                  onPick={(source, target) => saveTransfer(source, target, seg.id)}
                  onEditSegment={() => setEditing(resolveEditTarget(seg, userRangeIds))}
                />
              ))}
              {orphanEntries.length > 0 && (
                <HolidayOrphanCard
                  entries={orphanEntries}
                  dayNames={dayNames}
                  onClear={(source) => saveTransfer(source, null, 'orphan')}
                />
              )}
            </>
          )}
          {merged.removed.length > 0 && (
            <>
              <SectionHeader title={t('holiday_removed_section')} />
              <HolidayRemovedCard segments={merged.removed} onRestore={restoreRange} />
            </>
          )}
          <TonalButton
            fullWidth
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
          >
            {t('holiday_add_entry')}
          </TonalButton>
        </>
      )}

      {editing && (
        <HolidayRangeEditDialog
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

/** M3 IconButton: 默认 48dp 触控 / 24 图标, 色 = LocalContentColor(onBackground); 禁用 alpha .38 */
function IconBtn({
  label, disabled = false, size = 48, color = 'var(--md-on-background)', onClick, children,
}: {
  label: string
  disabled?: boolean
  size?: number
  color?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: size / 2, border: 'none', padding: 0,
        background: 'transparent', color, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.38 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

/** Button/FilledTonalButton + SleepyTheme.Buttons (regularHeight 48, shape large 16), secondaryContainer 色块 */
function TonalButton({
  onClick, fullWidth = false, container = 'var(--md-secondary-container)', content = 'var(--md-on-secondary-container)', children,
}: {
  onClick: () => void
  fullWidth?: boolean
  container?: string
  content?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="m3-label-large"
      style={{
        height: 48, minWidth: 58, padding: '0 24px', borderRadius: 16, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: container, color: content, whiteSpace: 'nowrap', fontFamily: 'inherit',
        ...(fullWidth ? { width: '100%' } : null),
      }}
    >
      {children}
    </button>
  )
}

/** 一个放假日段一张卡: 标题行(名称/日期 + 编辑段) + 每个放假日一行调休选择 */
function HolidayTransferCard({
  segment, transfers, workdayDates, dayNames, onPick, onEditSegment,
}: {
  segment: HolidayRange
  transfers: HolidayTransferEntry[]
  workdayDates: string[]
  dayNames: string[]
  onPick: (source: string, target: string | null) => void
  onEditSegment: () => void
}) {
  const { t } = useTranslation()
  const dates = datesInRange(segment.startDate, segment.endDate)
  return (
    <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="m3-title-small" style={{ fontWeight: 600 }}>{segment.name || shortDateSlash(segment.startDate)}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{segmentDateLabel(segment)}</div>
        </div>
        <IconBtn label={t('holiday_transfer_edit_segment')} color="var(--md-on-surface-variant)" onClick={onEditSegment}>
          <IconEdit />
        </IconBtn>
      </div>
      {dates.map((date) => (
        <HolidayTransferRow
          key={date}
          date={date}
          targetDate={[...transfers].reverse().find((e) => e.sourceDate === date)?.targetDate ?? null}
          workdayDates={workdayDates}
          dayNames={dayNames}
          onPick={(picked) => onPick(date, picked)}
        />
      ))}
    </div>
  )
}

/** 失效映射卡: sourceDate 已不在今年任何放假日段里; 不自动删, 行尾"清除"手动处理 */
function HolidayOrphanCard({
  entries, dayNames, onClear,
}: {
  entries: HolidayTransferEntry[]
  dayNames: string[]
  onClear: (source: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-surface-variant)' }}>{t('holiday_transfer_orphan_title')}</span>
      <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('holiday_transfer_orphan_hint')}</span>
      {entries.map((entry) => (
        <div key={entry.sourceDate} style={{ display: 'flex', alignItems: 'center', padding: '4px 0' }}>
          <span className="m3-body-medium" style={{ flex: 1, minWidth: 0, color: 'var(--md-on-surface-variant)' }}>
            {`${shortDateSlash(entry.sourceDate)} → ${dayLabel(entry.targetDate, dayNames)}`}
          </span>
          <TonalButton onClick={() => onClear(entry.sourceDate)}>{t('holiday_transfer_clear')}</TonalButton>
        </div>
      ))}
    </div>
  )
}

/**
 * 放假日一行: 左"M/d (星期)" → 右格 = ExposedDropdownMenuBox 锚字段 (未映射 surfaceContainerHighest /
 * 已映射 primaryContainer)。菜单贴锚正下方、同宽同色同圆角: 当年全部补班日(不过滤不禁用) → 分隔 → 无 → 其他日期…
 */
function HolidayTransferRow({
  date, targetDate, workdayDates, dayNames, onPick,
}: {
  date: string
  targetDate: string | null
  workdayDates: string[]
  dayNames: string[]
  onPick: (target: string | null) => void
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const mapped = targetDate !== null
  const targetColor = mapped ? 'var(--md-primary-container)' : 'var(--md-surface-container-highest)'
  const targetContentColor = mapped ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)'
  const choose = (target: string | null) => {
    onPick(target)
    setMenuOpen(false)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
      <span className="m3-body-large" style={{ flex: 1, minWidth: 0 }}>{dayLabel(date, dayNames)}</span>
      <IconArrowForward size={18} color="var(--md-on-surface-variant)" />
      <div style={{ flex: 1, minWidth: 0, marginLeft: 10, position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', padding: '8px 14px', borderRadius: 12, border: 'none',
            background: targetColor, color: targetContentColor, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          }}
        >
          <span className="m3-body-medium" style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>
            {targetDate === null ? '—' : dayLabel(targetDate, dayNames)}
          </span>
          <IconArrowDropDown style={{ transform: menuOpen ? 'rotate(180deg)' : undefined }} />
        </button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
            <div
              role="menu"
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 901, padding: '8px 0', borderRadius: 12,
                background: targetColor, maxHeight: '50vh', overflowY: 'auto',
                boxShadow: '0 1px 2px rgba(0,0,0,0.3), 0 2px 6px 2px rgba(0,0,0,0.15)',
              }}
            >
              {workdayDates.map((wd) => (
                <MenuItem key={wd} onClick={() => choose(wd)}>{dayLabel(wd, dayNames)}</MenuItem>
              ))}
              <HDiv />
              <MenuItem onClick={() => choose(null)}>{t('holiday_makeup_unset')}</MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false)
                  setShowDatePicker(true)
                }}
              >
                {t('holiday_transfer_pick_other')}
              </MenuItem>
            </div>
          </>
        )}
      </div>
      {showDatePicker && (
        <DatePickerDialog
          onConfirm={(iso) => {
            onPick(iso)
            setShowDatePicker(false)
          }}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}
    </div>
  )
}

/** DropdownMenuItem: 最小高 48, 水平内边距 12, labelLarge, onSurface */
function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="m3-label-large"
      style={{
        width: '100%', minHeight: 48, padding: '0 12px', display: 'flex', alignItems: 'center', border: 'none',
        background: 'transparent', color: 'var(--md-on-surface)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

/** 已删除区块: 被用户删除的网络段, 行尾"恢复默认"移除覆盖使网络段回来 */
function HolidayRemovedCard({ segments, onRestore }: { segments: HolidayRange[]; onRestore: (seg: HolidayRange) => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ ...cardStyle, padding: '8px 16px' }}>
      {segments.map((seg, i) => (
        <div key={seg.id}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0' }}>
            <span className="m3-body-large" style={{ flex: 1, minWidth: 0, color: 'var(--md-on-surface-variant)' }}>
              {seg.name || shortDateSlash(seg.startDate)}
            </span>
            <span className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)', marginRight: 12 }}>{segmentDateLabel(seg)}</span>
            <TonalButton onClick={() => onRestore(seg)}>{t('holiday_restore')}</TonalButton>
          </div>
          {i !== segments.length - 1 && <HDiv />}
        </div>
      ))}
    </div>
  )
}

/**
 * 编辑/添加弹窗(起止日期范围段)。校验: start/end 均有效且 end >= start, 否则禁用保存并提示。
 * sourceKey 由 resolveEditTarget 填好: 网络段派生=挂接键, 纯用户段=保持 null。
 */
function HolidayRangeEditDialog({
  target, isNew, onDismiss, onSave, onDelete,
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
  const startDate = isIsoDate(startText) ? startText : null
  const endDate = isIsoDate(endText) ? endText : null
  const datesValid = startDate !== null && endDate !== null && endDate >= startDate

  return (
    <AlertDialog title={t(isNew ? 'holiday_add_title' : 'holiday_edit_title')} onDismiss={onDismiss}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DatePickerField
          value={startText}
          onValueChange={setStartText}
          label={t('holiday_name_label_date')}
          isError={startText.trim() !== '' && startDate === null}
        />
        <DatePickerField
          value={endText}
          onValueChange={setEndText}
          label={t('holiday_name_label_end')}
          isError={endText.trim() !== '' && (endDate === null || (startDate !== null && endDate < startDate))}
        />
        <FilledTextField label={t('holiday_name_label')} value={name} onChange={setName} />
        <SegmentedSwitcher
          options={[t('holiday_type_holiday'), t('holiday_type_workday')]}
          selected={type === TYPE_TRANSFER_WORKDAY ? 1 : 0}
          onSelect={(i) => setType(i === 1 ? TYPE_TRANSFER_WORKDAY : TYPE_PUBLIC_HOLIDAY)}
          full
        />
        {!datesValid && (startText.trim() !== '' || endText.trim() !== '') && (
          <div className="m3-body-small" style={{ color: 'var(--md-error)' }}>{t('holiday_date_invalid')}</div>
        )}
        {!isNew && (
          <TonalButton
            fullWidth
            container="var(--md-error-container)"
            content="var(--md-on-error-container)"
            onClick={() => onDelete(target)}
          >
            {t('holiday_delete_range')}
          </TonalButton>
        )}
        <DialogActionButtons
          confirmText={t('save')}
          onConfirm={() => {
            if (startDate === null || endDate === null) return
            onSave({ id: target.id, name: name.trim(), startDate, endDate, type, sourceKey: target.sourceKey })
          }}
          dismissText={t('cancel')}
          onDismiss={onDismiss}
          confirmEnabled={datesValid}
        />
      </div>
    </AlertDialog>
  )
}
