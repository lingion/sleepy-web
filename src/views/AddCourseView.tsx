/**
 * AddCourseView — Kotlin AddCourseScreen.kt 1:1 移植 (新建/编辑课程)
 * 基础信息(名称/别名) + 周次范围(可应用全部时段) + 每时段卡(MultiDayPicker/节次/
 * 周次/单双周/教师/教室/备注/颜色三态) + 校验卡 + 冲突明细弹窗(仍然保存放行)。
 * 保存: 新建=组共享新 groupId; 编辑=applyDiff 行级 diff 不波及他组 (issue#22)。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowBack } from '../components/icons'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import {
  getTable,
  getCourses,
  getGroupCourses,
  insertCourses,
  applyDiff,
  deleteCourseGroup,
  updateTable,
} from '../data/repository'
import type { Course, WeekType, ColorMode } from '../data/types'
import { localizedDay } from '../components/schedule/CardsGridView'
import {
  groupSlotsForEdit,
  initialMeetingBlock,
  buildCourseEntity,
  validateCourseDraft,
  draftConflictDetails,
  formatDetail,
  parseHm,
  type MeetingBlockDraft,
  type ValidationIssue,
} from '../domain/courseDraft'
import { parseTimeSlotRows, insertEdgeNode, updateEdgeNodeTimes } from '../domain/timeTable'

type RowDiff = Parameters<typeof applyDiff>[1]

export function AddCourseView({
  editingCourse,
  onBack,
  onSaved,
}: {
  editingCourse?: Course | null
  onBack: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const defaultTable = tables.find((x) => x.isDefault === 1) ?? tables[0]

  const isEditing = editingCourse != null

  // issue#23 逐卡: 待落库新建槽位/已有槽位时间编辑 — 落库前不污染 timeJson
  const [pendingEdgeInserts, setPendingEdgeInserts] = useState<Array<{ edgeClass: 'before' | 'after'; start: string; end: string; ownerBlockId: number }>>([])
  const [pendingEdgeEdits] = useState<Array<{ node: number; start: string; end: string }>>([])

  const baseTimeJson = defaultTable?.timeJson ?? '[]'
  // issue#9/23: 生效时间表 = 课表 timeJson + 暂存槽位 — 候选/校验/落库唯一依据
  const effectiveTimeJson = (() => {
    let json = baseTimeJson
    for (const ins of pendingEdgeInserts) json = insertEdgeNode(json, ins.edgeClass, ins.start, ins.end)
    for (const ed of pendingEdgeEdits) json = updateEdgeNodeTimes(json, ed.node, ed.start, ed.end)
    return json
  })()

  const [courseName, setCourseName] = useState(editingCourse?.courseName ?? '')
  const [courseAlias, setCourseAlias] = useState(editingCourse?.alias ?? '')
  const [startWeek, setStartWeek] = useState(editingCourse?.startWeek ?? 1)
  const [endWeek, setEndWeek] = useState(editingCourse?.endWeek ?? 16)
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [pendingConflictDetails, setPendingConflictDetails] = useState<string[]>([])
  const [meetingBlocks, setMeetingBlocks] = useState<MeetingBlockDraft[]>(() => {
    if (!editingCourse) return [initialMeetingBlock(1)]
    return [initialMeetingBlock(1)] // 编辑模式在 syncBlocks 中回填
  })
  const [blocksSynced, setBlocksSynced] = useState(!editingCourse)

  // 编辑模式: 同 groupId 全部课按时段特征分组回填多卡 (issue#22)
  if (editingCourse && !blocksSynced && defaultTable) {
    void (async () => {
      const group = await getGroupCourses(defaultTable.id, editingCourse.groupId)
      if (group.length > 0) {
        const slots = groupSlotsForEdit(group)
        const edgeNodes = new Set(
          parseTimeSlotRows(effectiveTimeJson).filter((r) => r.edgeClass !== null).map((r) => r.node),
        )
        let bid = 1
        const blocks = slots.map((slotCourses) => {
          const first = slotCourses[0]
          const isEdge = edgeNodes.has(first.startNode)
          const b: MeetingBlockDraft = {
            id: bid++,
            days: [...new Set(slotCourses.map((c) => c.day))].sort((a, b) => a - b),
            startNode: first.startNode,
            step: first.step,
            isIrregularTime: first.ownTime,
            startTime: first.startTime || '08:00',
            endTime: first.endTime || '09:40',
            isIrregularNode: isEdge,
            selectedEdgeNode: isEdge ? first.startNode : 0,
            startWeek: first.startWeek,
            endWeek: first.endWeek,
            weekType: first.type as WeekType,
            room: first.room,
            teacher: first.teacher,
            note: first.note,
            color: first.color,
            colorMode: first.colorMode as ColorMode,
            clamped: false,
          }
          return b
        })
        setMeetingBlocks(blocks)
      }
      setBlocksSynced(true)
    })()
  }

  const canSave = courseName.trim() !== '' && meetingBlocks.length > 0

  function updateBlock(id: number, patch: Partial<MeetingBlockDraft>) {
    setMeetingBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function validationStrs() {
    return {
      course_name_empty: t('course_name_empty'),
      week_must_be_positive: t('week_must_be_positive'),
      slot_at_least_one_day: (n: number) => t('slot_at_least_one_day', { v1: n }),
      slot_week_order: (n: number) => t('slot_week_order', { v1: n }),
      irregular_node_required: (n: number) => t('irregular_node_required', { v1: n }),
      slot_start_node_positive: (n: number) => t('slot_start_node_positive', { v1: n }),
      slot_step_positive: (n: number) => t('slot_step_positive', { v1: n }),
      slot_step_exceeds_max: (n: number, s: number, e: number, max: number) =>
        t('slot_step_exceeds_max', { v1: n, v2: s, v3: e, v4: max }),
      irregular_time_format: t('irregular_time_format'),
      irregular_time_order: t('irregular_time_order'),
      slot_time_overlap: (i: number, j: number, days: string) =>
        t('slot_time_overlap', { v1: i, v2: j, v3: days }),
      localizedDay: (d: number) => localizedDay(d, i18n.language),
    }
  }

  /** performSave — 校验 → 草稿 → 冲突明细 → 落库 */
  async function performSave(forceAfterConflict: boolean) {
    const issues = validateCourseDraft(
      courseName, meetingBlocks, startWeek, endWeek, effectiveTimeJson, validationStrs(),
    )
    setValidationIssues(issues)
    if (issues.length > 0) return

    let tableId = defaultTable?.id
    if (!tableId) {
      // 没表就自动建一张
      const { insertTable } = await import('../data/repository')
      const { DEFAULT_TIME_JSON } = await import('../domain/timeTable')
      tableId = await insertTable({
        name: t('default_table_name'),
        timeJson: DEFAULT_TIME_JSON,
        smartConfigJson: '',
        isDefault: 0,
        startDate: '',
        nodeCount: 12,
        maxWeek: 20,
        createdAt: Date.now(),
      })
    }

    const drafts = meetingBlocks.flatMap((block) =>
      block.days.slice().sort((a, b) => a - b).map((day) =>
        buildCourseEntity(tableId!, '', courseName.trim(), block, day, courseAlias.trim(), effectiveTimeJson),
      ),
    )
    const fixedDrafts = isEditing
      ? drafts.map((d) => ({ ...d, groupId: editingCourse!.groupId }))
      : drafts

    // v7.10.16u: 不拦但讲清楚 — 编辑模式排除同组旧记录(自己撞自己)
    if (!forceAfterConflict) {
      const existing = (await getCourses(tableId)).filter((c) => c.groupId !== editingCourse?.groupId)
      const dayNames = [1, 2, 3, 4, 5, 6, 7].map((d) => localizedDay(d, i18n.language))
      const details = draftConflictDetails(fixedDrafts as Course[], existing, dayNames, effectiveTimeJson)
        .map((d) => formatDetail(d, t('conflict_detail_line')))
      if (details.length > 0) {
        setPendingConflictDetails(details)
        return
      }
    }

    if (isEditing) {
      // v7.10.16+: 行级 diff/patch 替换整组覆盖 — 不波及同表其他课程
      const existing = (await getCourses(tableId)).filter((c) => c.groupId === editingCourse!.groupId)
      const diff = rowKeyDiff(fixedDrafts as Course[], existing)
      await applyDiff(tableId, diff)
    } else {
      const gid = cryptoGroupId()
      await insertCourses(fixedDrafts.map((d) => ({ ...d, groupId: gid })))
    }

    // issue#23: 槽位变更在课程落库成功后写回 timeJson (批边界在 repository capture 内)
    const table = await getTable(tableId)
    if (table && (pendingEdgeInserts.length > 0 || pendingEdgeEdits.length > 0)) {
      let json = table.timeJson
      for (const ins of pendingEdgeInserts) json = insertEdgeNode(json, ins.edgeClass, ins.start, ins.end)
      for (const ed of pendingEdgeEdits) json = updateEdgeNodeTimes(json, ed.node, ed.start, ed.end)
      if (json !== table.timeJson) await updateTable({ ...table, timeJson: json })
    }
    onSaved()
  }

  async function handleDeleteGroup() {
    if (!editingCourse || !defaultTable) return
    await deleteCourseGroup(defaultTable.id, editingCourse.groupId)
    onSaved()
  }

  const dayNamesForPicker = [1, 2, 3, 4, 5, 6, 7]

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Header onBack={onBack} title={isEditing ? t('edit_course') : t('create_course')} />

      {validationIssues.length > 0 && (
        <div className="m3-card" style={{ padding: 14, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }}>
          <div className="m3-title-small" style={{ fontWeight: 600, marginBottom: 6 }}>
            {t('validation_title', '请检查以下问题')}
          </div>
          {validationIssues.map((iss, i) => (
            <div key={i} className="m3-body-small">• {iss.message}</div>
          ))}
        </div>
      )}

      {/* 基础信息 */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="m3-title-medium" style={{ fontWeight: 600 }}>{t('course_basic_info')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('course_basic_info_sub')}</div>
        </div>
        <Field label={t('course_name_required')} value={courseName} onChange={setCourseName} />
        <Field label={t('course_alias')} value={courseAlias} onChange={setCourseAlias} />
      </div>

      {/* 周次范围 */}
      <div className="m3-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="m3-title-medium" style={{ fontWeight: 600 }}>{t('week_range')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('week_range_sub')}</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <NumberField label={t('start_week')} value={startWeek} onChange={setStartWeek} grow />
          <NumberField label={t('end_week')} value={endWeek} onChange={setEndWeek} grow />
        </div>
        <button
          onClick={() => setMeetingBlocks((bs) => bs.map((b) => ({ ...b, startWeek, endWeek })))}
          style={{
            padding: 10, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t('apply_to_all_slots')}
        </button>
      </div>

      {/* 上课时段 */}
      <div style={{ padding: '0 4px' }}>
        <div className="m3-title-medium" style={{ fontWeight: 600 }}>{t('meeting_slots')}</div>
        <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('meeting_slots_sub')}</div>
      </div>

      {meetingBlocks.map((block, index) => (
        <MeetingBlockCard
          key={block.id}
          title={t('slot_n', { v1: index + 1 })}
          block={block}
          canRemove={meetingBlocks.length > 1}
          maxStd={maxStdOf(effectiveTimeJson)}
          issues={validationIssues.filter((iss) => iss.blockId === block.id).map((iss) => iss.message)}
          onRemove={() => setMeetingBlocks((bs) => bs.filter((b) => b.id !== block.id))}
          onChange={(patch) => updateBlock(block.id, patch)}
          onPickNewEdgeSlot={(start, end, edgeClass) => {
            // 计算新槽位 node: before=1, after=尾部+1 (insertEdgeNode 同构)
            const rows = parseTimeSlotRows(effectiveTimeJson)
            const node = edgeClass === 'before' ? 1 : Math.max(...rows.map((r) => r.node), 0) + 1
            setPendingEdgeInserts((arr) => [...arr.filter((x) => x.ownerBlockId !== block.id), { edgeClass, start, end, ownerBlockId: block.id }])
            updateBlock(block.id, { isIrregularNode: true, selectedEdgeNode: node })
          }}
        />
      ))}

      <button
        onClick={() =>
          setMeetingBlocks((bs) => [
            ...bs,
            {
              ...initialMeetingBlock(Math.max(...bs.map((b) => b.id), 0) + 1),
              days: [2],
              startNode: 3,
              startTime: '10:00',
              endTime: '11:40',
            },
          ])
        }
        style={{
          padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          fontSize: 14, fontWeight: 600,
        }}
      >
        + {t('add_slot')}
      </button>

      <button
        onClick={() => void performSave(false)}
        disabled={!canSave}
        style={{
          padding: 14, borderRadius: 12, border: 'none', cursor: canSave ? 'pointer' : 'default',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 15, fontWeight: 600, opacity: canSave ? 1 : 0.5,
        }}
      >
        ✓ {isEditing ? t('save_course') : t('create_course_btn')}
      </button>

      {isEditing && (
        <button
          onClick={() => {
            if (window.confirm(t('delete_course_confirm', { v1: editingCourse!.courseName }))) {
              void handleDeleteGroup()
            }
          }}
          style={{
            padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-error-container)', color: 'var(--md-on-error-container)',
            fontSize: 14, fontWeight: 600,
          }}
        >
          ✕ {t('delete_course')}
        </button>
      )}

      {/* 冲突明细弹窗 — 仍然保存 = 明确放行 */}
      {pendingConflictDetails.length > 0 && (
        <Overlay onDismiss={() => setPendingConflictDetails([])}>
          <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('conflict_detail_title')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingConflictDetails.slice(0, 6).map((line, i) => (
              <div key={i} className="m3-body-small">• {line}</div>
            ))}
            {pendingConflictDetails.length > 6 && (
              <div className="m3-label-small">{t('more_unexpanded', { v1: pendingConflictDetails.length - 6 })}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPendingConflictDetails([])} style={ghostStyle}>
              {t('conflict_detail_go_back')}
            </button>
            <button
              onClick={() => {
                setPendingConflictDetails([])
                void performSave(true)
              }}
              style={{
                padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600,
              }}
            >
              {t('conflict_detail_save_anyway')}
            </button>
          </div>
        </Overlay>
      )}
      {dayNamesForPicker}
    </div>
  )
}

// ── MeetingBlockCard — 单时段卡 ─────────────────────────────────────────

function MeetingBlockCard({
  title, block, canRemove, maxStd, issues, onRemove, onChange, onPickNewEdgeSlot,
}: {
  title: string
  block: MeetingBlockDraft
  canRemove: boolean
  maxStd: number
  issues: string[]
  onRemove: () => void
  onChange: (patch: Partial<MeetingBlockDraft>) => void
  onPickNewEdgeSlot: (start: string, end: string, edgeClass: 'before' | 'after') => void
}) {
  const { t, i18n } = useTranslation()

  function toggleDay(day: number) {
    const days = block.days.includes(day)
      ? block.days.filter((d) => d !== day)
      : [...block.days, day]
    onChange({ days })
  }

  const weekTypes: Array<[WeekType, string]> = [
    [0, t('week_every')], [1, t('week_odd')], [2, t('week_even')], [3, t('week_custom')],
  ]

  return (
    <div
      className="m3-card"
      style={{
        padding: 14,
        background: issues.length > 0 || block.clamped ? 'var(--md-error-container)' : 'var(--md-surface-container-high)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div className="m3-title-small" style={{ fontWeight: 600 }}>{title}</div>
          <div className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {block.days.length === 0
              ? t('select_at_least_one_day')
              : t('selected_days', { v1: block.days.slice().sort((a, b) => a - b).map((d) => localizedDay(d, i18n.language)).join(' / ') })}
          </div>
        </div>
        {canRemove && (
          <button onClick={onRemove} aria-label={t('delete_slot')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: 'var(--md-on-surface-variant)' }}>
            ✕
          </button>
        )}
      </div>

      {/* 星期多选 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => {
          const on = block.days.includes(d)
          return (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              aria-pressed={on}
              style={{
                padding: '6px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12,
                background: on ? 'var(--md-primary-container)' : 'var(--md-surface-container)',
                color: on ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
                fontWeight: on ? 600 : 400,
              }}
            >
              {localizedDay(d, i18n.language)}
            </button>
          )
        })}
      </div>

      {/* 标准节次 */}
      {!block.isIrregularNode && (
        <div style={{ display: 'flex', gap: 12 }}>
          <NumberField
            label={t('start_node')}
            value={block.startNode}
            onChange={(v) => {
              const stepCap = Math.max(1, maxStd - v + 1)
              onChange({ startNode: v, step: block.step > stepCap ? stepCap : block.step })
            }}
            grow
          />
          <NumberField
            label={t('step_count')}
            value={block.step}
            onChange={(v) => onChange({ step: v })}
            max={Math.max(1, maxStd - block.startNode + 1)}
            grow
          />
        </div>
      )}

      {/* 非常规选项 */}
      <details open={block.isIrregularNode || block.isIrregularTime}>
        <summary className="m3-body-medium" style={{ cursor: 'pointer', color: 'var(--md-on-surface-variant)' }}>
          {t('irregular_node_switch')} / {t('irregular_time_switch')}
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
          <ToggleRow
            label={t('irregular_node_switch')}
            checked={block.isIrregularNode}
            onChange={(v) => onChange({ isIrregularNode: v, selectedEdgeNode: v ? block.selectedEdgeNode : 0 })}
          />
          {block.isIrregularNode && (
            <div style={{ display: 'flex', gap: 8 }}>
              <NumberField label={t('start_node')} value={block.selectedEdgeNode} onChange={(v) => onChange({ selectedEdgeNode: v })} grow />
              <button
                onClick={() => {
                  const s = window.prompt(t('irregular_time_switch') + ' start (HH:mm)', '07:10')
                  const e = window.prompt(t('irregular_time_switch') + ' end (HH:mm)', '07:50')
                  if (s && e && parseHm(s) !== null && parseHm(e) !== null) {
                    onPickNewEdgeSlot(s, e, block.selectedEdgeNode === 1 ? 'before' : 'after')
                  }
                }}
                style={ghostStyle}
              >
                {t('add_slot')}
              </button>
            </div>
          )}
          <ToggleRow
            label={t('irregular_time_switch')}
            checked={block.isIrregularTime}
            onChange={(v) => onChange({ isIrregularTime: v })}
          />
          {block.isIrregularTime && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="time"
                value={block.startTime}
                aria-label={t('irregular_time_switch') + ' start'}
                onChange={(e) => onChange({ startTime: e.target.value })}
                style={fieldStyle}
              />
              <input
                type="time"
                value={block.endTime}
                aria-label={t('irregular_time_switch') + ' end'}
                onChange={(e) => onChange({ endTime: e.target.value })}
                style={fieldStyle}
              />
            </div>
          )}
        </div>
      </details>

      {/* 每卡周次 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <NumberField label={`${t('slot_week_range')} ${t('start_week')}`} value={block.startWeek} onChange={(v) => onChange({ startWeek: v })} grow />
        <NumberField label={`${t('slot_week_range')} ${t('end_week')}`} value={block.endWeek} onChange={(v) => onChange({ endWeek: v })} grow />
      </div>

      {/* 单双周 4 态 */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--md-surface-container)', borderRadius: 12, padding: 4 }}>
        {weekTypes.map(([val, label]) => (
          <button
            key={val}
            onClick={() => onChange({ weekType: val })}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12,
              background: block.weekType === val ? 'var(--md-primary-container)' : 'transparent',
              color: block.weekType === val ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
              fontWeight: block.weekType === val ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Field label={t('course_teacher')} value={block.teacher} onChange={(v) => onChange({ teacher: v })} />
      <Field label={t('course_room')} value={block.room} onChange={(v) => onChange({ room: v })} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('course_note')}</span>
        <textarea value={block.note} onChange={(e) => onChange({ note: e.target.value })} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
      </label>

      {/* 颜色三态 */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--md-surface-container)', borderRadius: 12, padding: 4 }}>
        {([0, 1, 2] as ColorMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onChange({ colorMode: mode })}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12,
              background: block.colorMode === mode ? 'var(--md-primary-container)' : 'transparent',
              color: block.colorMode === mode ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
              fontWeight: block.colorMode === mode ? 600 : 400,
            }}
          >
            {mode === 0 ? t('color_follow_group') : mode === 1 ? t('color_auto') : t('color_custom')}
          </button>
        ))}
      </div>
      {block.colorMode === 2 && (
        <input
          type="color"
          value={block.color || '#6750A4'}
          aria-label={t('color_custom')}
          onChange={(e) => onChange({ color: argbOf(e.target.value) })}
          style={{ width: 48, height: 32, border: 'none', cursor: 'pointer', background: 'transparent' }}
        />
      )}

      {issues.map((issue, i) => (
        <div key={i} className="m3-label-small" style={{ color: 'var(--md-error)' }}>{issue}</div>
      ))}
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

/** '#RRGGBB' → '#FFRRGGBB' (ARGB, Course.color 存储形态) */
function argbOf(hex: string): string {
  return hex.startsWith('#') && hex.length === 7 ? `#FF${hex.slice(1)}` : hex
}

function maxStdOf(timeJson: string): number {
  // 避免循环 import — 本地实现 maxStandardNode (标准 1..N 连续段上界)
  try {
    const rows = parseTimeSlotRows(timeJson).filter((r) => r.edgeClass === null)
    let expect = 1
    for (const r of rows) {
      if (r.node !== expect) break
      expect++
    }
    return expect - 1
  } catch {
    return 12
  }
}

/** crypto.randomUUID 兜底 (http 非安全上下文) */
function cryptoGroupId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** RowKeyDiffer.diff 1:1 — 行身份键 8 字段 (room/teacher 进 key; color/note/alias 不进);
 *  draft 命中 server → fieldsDiffer 才 update(保 server id); server 无匹配 → delete */
function rowKeyDiff(drafts: Course[], existing: Course[]): RowDiff {
  const keyOf = (c: Pick<Course, 'day' | 'startNode' | 'step' | 'startWeek' | 'endWeek' | 'type' | 'room' | 'teacher'>) =>
    `${c.day}|${c.startNode}|${c.step}|${c.startWeek}|${c.endWeek}|${c.type}|${c.room}|${c.teacher}`
  const toAdd: Omit<Course, 'id'>[] = []
  const toUpdate: Course[] = []
  const toDeleteIds: number[] = []
  const sKeyToCourse = new Map(existing.map((c) => [keyOf(c), c] as const))
  const dKeyToCourse = new Map(drafts.map((c) => [keyOf(c), c] as const))
  for (const [key, draftCourse] of dKeyToCourse) {
    const serverCourse = sKeyToCourse.get(key)
    if (!serverCourse) {
      toAdd.push(draftCourse)
    } else if (fieldsDiffer(serverCourse, draftCourse)) {
      toUpdate.push({ ...draftCourse, id: serverCourse.id })
    }
  }
  for (const [key, serverCourse] of sKeyToCourse) {
    if (!dKeyToCourse.has(key)) toDeleteIds.push(serverCourse.id)
  }
  return { toAdd, toUpdate, toDeleteIds }
}

/** fieldsDiffer — RowKey 外字段逐项比对 (alias 2026-09-11 纳入) */
function fieldsDiffer(a: Course, b: Course): boolean {
  return (
    a.courseName !== b.courseName ||
    a.alias !== b.alias ||
    a.note !== b.note ||
    a.color !== b.color ||
    a.colorMode !== b.colorMode ||
    a.ownTime !== b.ownTime ||
    a.startTime !== b.startTime ||
    a.endTime !== b.endTime ||
    a.credit !== b.credit ||
    a.level !== b.level ||
    a.tableId !== b.tableId
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

const ghostStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  background: 'var(--md-surface-container-high)',
  color: 'var(--md-on-surface)',
  fontSize: 13,
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle} />
    </label>
  )
}

function NumberField({
  label, value, onChange, max = 30, grow,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  max?: number
  grow?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: grow ? 1 : undefined }}>
      <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>
      <input
        type="number"
        value={value}
        min={1}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!Number.isNaN(v)) onChange(Math.min(Math.max(1, v), max))
        }}
        style={fieldStyle}
      />
    </label>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span className="m3-body-medium">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}
      >
        {children}
      </div>
    </div>
  )
}
