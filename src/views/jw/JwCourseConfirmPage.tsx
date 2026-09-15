/**
 * JwCourseConfirmPage — ui/screen/imports/JwCourseConfirmPage.kt 的 web 移植。
 *
 * Android 弹窗结构 (标题「导入前确认」+「N 导入课程」+ 日期 + 表名 + 节次编辑器 + 确认/返回)
 * 全部保留; 在此之上补一层「课程勾选」—— 浏览器抓取常混入非课表表格, 让用户先挑要导入的组,
 * 再进 Android 原有的确认表单。校验规则与 Android 完全一致 (importFlow.validateConfirm)。
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { JwCourse } from '../../domain/jw/jwCourse'
import { DEFAULT_SMART_CONFIG, encodeSmartConfig, inferSmartConfig } from '../../domain/smartPeriod'
import { buildTimeJsonFromRows, type TimeSlotRow } from '../../domain/timeTable'
import { localizedDay } from '../../components/schedule/CardsGridView'
import { IconCheckCircle } from '../../components/icons'
import { HDiv } from '../mine/shared'
import type { Table } from '../../data/types'
import { TimeSlotEditor } from './TimeSlotEditor'
import { groupCourses, validateConfirm, type ConfirmError } from './importFlow'

export interface ConfirmResult {
  /** 目标课表 id;null = 新建课表 */
  tableId: number | null
  tableName: string
  startDate: string
  /** 空串 = 由上层落 DEFAULT_TIME_JSON (Android 同语义) */
  timeJson: string
  smartConfigJson: string
  /** 勾选后实际导入的课程 */
  courses: JwCourse[]
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--md-outline)',
  background: 'var(--md-surface)',
  color: 'var(--md-on-surface)',
  font: 'inherit',
}

export function JwCourseConfirmPage({
  courses,
  schoolName,
  tables,
  defaultStartDate,
  defaultRows,
  onConfirm,
  onBack,
}: {
  courses: JwCourse[]
  schoolName: string
  /** 现有课表, 供选择导入目标 */
  tables: readonly Table[]
  defaultStartDate: string
  /** 按抓到课程的最大节次预置的节次行 */
  defaultRows: TimeSlotRow[]
  onConfirm: (result: ConfirmResult) => void
  onBack: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language ?? 'zh-CN'

  const groups = useMemo(() => groupCourses(courses), [courses])
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [rows, setRows] = useState<TimeSlotRow[]>(defaultRows)
  const [smart, setSmart] = useState(() => inferSmartConfig(defaultRows) ?? DEFAULT_SMART_CONFIG)
  const [tableName, setTableName] = useState(() => t('jw_import_title', { v1: schoolName }))
  const [targetId, setTargetId] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)

  const selected = useMemo(
    () => courses.filter((c) => !excluded.has(`${c.name}|${c.day}`)),
    [courses, excluded]
  )
  const error: ConfirmError | null = validateConfirm({ startDate, rows })
  const selectionError = touched && selected.length === 0 ? t('jw_no_course_selected') : null
  const inlineError = selectionError ?? (touched && error ? t(error.key, { v1: 'node' in error ? error.node : 1 }) : null)

  function toggle(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function submit() {
    setTouched(true)
    if (selected.length === 0) return
    const err = validateConfirm({ startDate, rows })
    if (err) return
    onConfirm({
      tableId: targetId,
      tableName: tableName.trim(),
      startDate: startDate.trim(),
      timeJson: rows.length > 0 ? buildTimeJsonFromRows(rows) : '',
      smartConfigJson: encodeSmartConfig(smart),
      courses: selected,
    })
  }

  if (courses.length === 0) {
    return (
      <div className="m3-body-medium" style={{ padding: '24px 0', textAlign: 'center', color: 'var(--md-on-surface-variant)' }}>
        {t('jw_empty_course_list')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 课程预览 + 勾选 ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span className="m3-title-small" style={{ flex: 1, fontWeight: 600 }}>
          {t('jw_preview_title')}
          <span className="m3-body-small" style={{ fontWeight: 400, color: 'var(--md-on-surface-variant)', marginLeft: 6 }}>
            {t('jw_course_count', { v1: courses.length })}
          </span>
        </span>
        <button type="button" className="m3-btn-regular" onClick={() => setExcluded(new Set())} style={{ marginRight: 6 }}>
          {t('jw_select_all')}
        </button>
        <button type="button" className="m3-btn-regular" onClick={() => setExcluded(new Set(groups.map((g) => g.key)))}>
          {t('jw_select_none')}
        </button>
      </div>
      <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
        {t('jw_selected_courses', { v1: selected.length, v2: courses.length })}
      </div>

      <div className="m3-card" style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 12px' }}>
        {groups.map((g, gi) => {
          const checked = !excluded.has(g.key)
          return (
            <div key={g.key}>
              {gi > 0 && <HDiv />}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(g.key)} style={{ marginTop: 3 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="m3-body-medium" style={{ fontWeight: 500 }}>{g.name}</div>
                  {g.courses.map((c, ci) => (
                    <div key={ci} className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
                      {localizedDay(c.day, lang)} {t('course_node_format', { v1: `${c.startNode}-${c.endNode}` })}
                      {c.room ? ` · ${c.room}` : ''}
                      {c.teacher ? ` · ${c.teacher}` : ''}
                      {c.startWeek > 0 ? ` · ${c.startWeek}-${c.endWeek}${t('jw_week_unit')}` : ''}
                    </div>
                  ))}
                </div>
              </label>
            </div>
          )
        })}
      </div>

      <HDiv />

      {/* ── 导入目标 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="m3-label-medium">{t('jw_dest_table_label')}</div>
        <select
          value={targetId === null ? '' : String(targetId)}
          onChange={(e) => setTargetId(e.target.value === '' ? null : Number(e.target.value))}
          aria-label={t('import_target_table')}
          style={fieldStyle}
        >
          <option value="">{t('jw_dest_new_table')}</option>
          {tables.map((tb) => (
            <option key={tb.id} value={String(tb.id)}>
              {tb.name}
            </option>
          ))}
        </select>
        {targetId === null && (
          <>
            <span className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
              {t('import_new_table_hint')}
            </span>
            <input
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder={t('jw_table_name_label')}
              aria-label={t('jw_table_name_label')}
              style={fieldStyle}
            />
          </>
        )}
      </div>

      {/* ── 起始日期 ── */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="m3-label-medium">{t('import_week_start')}</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label={t('import_week_start')}
          style={fieldStyle}
        />
      </label>

      {/* ── 节次 ── */}
      <TimeSlotEditor
        rows={rows}
        onRowsChange={setRows}
        smartConfig={smart}
        onSmartConfigChange={setSmart}
      />

      {inlineError && (
        <div className="m3-body-small" style={{ color: 'var(--md-error)' }}>{inlineError}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="m3-btn-regular" style={{ flex: 1 }} onClick={onBack}>
          {t('back')}
        </button>
        <button type="button" className="m3-btn-cta" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={submit}>
          <IconCheckCircle size={16} />
          {t('jw_config_confirm')}
        </button>
      </div>
    </div>
  )
}
