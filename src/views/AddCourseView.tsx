/**
 * AddCourseView — Kotlin AddCourseScreen.kt 1:1 移植 (新建/编辑课程)
 * 基础信息(名称/别名) + 周次范围(可应用全部时段) + 每时段卡(MultiDayPicker/节次/
 * 周次/单双周/教师/教室/备注/颜色三态) + 校验卡 + 冲突明细弹窗(仍然保存放行)。
 * 保存: 新建=组共享新 groupId; 编辑=applyDiff 行级 diff 不波及他组 (issue#22)。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconArrowBack,
  IconAdd,
  IconCheck,
  IconClose,
  IconDelete,
  IconEdit,
  IconChevronRight,
} from '../components/icons'
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
import { undoManager } from '../data/undoStore'
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
  blockEffectiveRange,
  type MeetingBlockDraft,
  type ValidationIssue,
} from '../domain/courseDraft'
import {
  parseTimeSlotRows,
  insertEdgeNode,
  updateEdgeNodeTimes,
  edgeCandidates,
  type EdgeCandidate,
  DEFAULT_TIME_JSON,
} from '../domain/timeTable'

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
  const [pendingEdgeInserts, setPendingEdgeInserts] = useState<
    Array<{ edgeClass: 'before' | 'after'; node: number; start: string; end: string; ownerBlockId: number }>
  >([])
  const [pendingEdgeEdits, setPendingEdgeEdits] = useState<
    Array<{ node: number; start: string; end: string }>
  >([])

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
      // 没表就自动建一张 — 命名去重递增、起始上周一、首张 isDefault (issue #19/Kotlin 同构)
      const { insertTable, setDefault } = await import('../data/repository')
      const existingNames = new Set(tables.map((tb) => tb.name))
      let index = tables.length + 1
      let name = t('default_table_with_num', { v1: index })
      while (existingNames.has(name)) {
        index++
        name = t('default_table_with_num', { v1: index })
      }
      const d = new Date()
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7)
      const startDate = d.toISOString().slice(0, 10)
      const isFirstTable = tables.length === 0
      tableId = await insertTable({
        name,
        timeJson: DEFAULT_TIME_JSON,
        smartConfigJson: '',
        isDefault: isFirstTable ? 1 : 0,
        startDate,
        nodeCount: 12,
        maxWeek: 20,
        createdAt: Date.now(),
      })
      if (isFirstTable) await setDefault(tableId)
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

    // v7.10.16v 撤回: 课程行 + timeJson 写回是一次动作 — beginBatch 让快照固定
    // 在动作前, 撤回一次整步回退(否则第二写覆盖快照, 只回退一半)
    undoManager.beginBatch()
    try {
      if (isEditing) {
        // v7.10.16+: 行级 diff/patch 替换整组覆盖 — 不波及同表其他课程
        const existing = (await getCourses(tableId)).filter((c) => c.groupId === editingCourse!.groupId)
        const diff = rowKeyDiff(fixedDrafts as Course[], existing)
        await applyDiff(tableId, diff)
      } else {
        const gid = cryptoGroupId()
        await insertCourses(fixedDrafts.map((d) => ({ ...d, groupId: gid })))
      }

      // issue#23: 槽位变更在课程落库成功后写回 timeJson (批边界已开)
      const table = await getTable(tableId)
      if (table && (pendingEdgeInserts.length > 0 || pendingEdgeEdits.length > 0)) {
        let json = table.timeJson
        for (const ins of pendingEdgeInserts) json = insertEdgeNode(json, ins.edgeClass, ins.start, ins.end)
        for (const ed of pendingEdgeEdits) json = updateEdgeNodeTimes(json, ed.node, ed.start, ed.end)
        if (json !== table.timeJson) await updateTable({ ...table, timeJson: json })
      }
      await undoManager.endBatch()
    } catch (e) {
      await undoManager.endBatch()
      throw e
    }
    onSaved()
  }

  async function handleDeleteGroup() {
    if (!editingCourse || !defaultTable) return
    await deleteCourseGroup(defaultTable.id, editingCourse.groupId)
    onSaved()
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Header onBack={onBack} title={isEditing ? t('edit_course') : t('create_course')} />

      {validationIssues.length > 0 && (
        <div
          className="m3-card"
          style={{
            padding: 14,
            borderRadius: 16,
            background: 'var(--md-error-container)',
            color: 'var(--md-on-error-container)',
          }}
        >
          <div className="m3-title-small" style={{ fontWeight: 600, marginBottom: 6 }}>
            {t('fix_issues_first')}
          </div>
          {validationIssues.slice(0, 4).map((iss, i) => (
            <div key={i} className="m3-body-small">• {iss.message}</div>
          ))}
          {validationIssues.length > 4 && (
            <div className="m3-label-small">
              {t('more_unexpanded', { v1: validationIssues.length - 4 })}
            </div>
          )}
        </div>
      )}

      {/* 基础信息 — 28dp 圆角 + surfaceContainer (§10 区块卡片档位) */}
      <div
        className="m3-card"
        style={{
          padding: 16,
          borderRadius: 28,
          background: 'var(--md-surface-container)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div>
          <div className="m3-title-medium" style={{ fontWeight: 600 }}>{t('course_basic_info')}</div>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>{t('course_basic_info_sub')}</div>
        </div>
        <Field label={t('course_name_required')} value={courseName} onChange={setCourseName} />
        <Field label={t('course_alias')} value={courseAlias} onChange={setCourseAlias} />
      </div>

      {/* 周次范围 — 28dp 圆角 + surfaceContainer */}
      <div
        className="m3-card"
        style={{
          padding: 16,
          borderRadius: 28,
          background: 'var(--md-surface-container)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
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
            height: 48, borderRadius: 16, padding: '0 16px', border: 'none', cursor: 'pointer',
            background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
            fontSize: 14, fontWeight: 600,
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
          timeJson={effectiveTimeJson}
          issues={validationIssues.filter((iss) => iss.blockId === block.id).map((iss) => iss.message)}
          onRemove={() => setMeetingBlocks((bs) => bs.filter((b) => b.id !== block.id))}
          onChange={(patch) => updateBlock(block.id, patch)}
          onPickExistingEdge={(node) =>
            updateBlock(block.id, { isIrregularNode: true, selectedEdgeNode: node, clamped: false })
          }
          onPickNewEdgeSlot={(start, end, node, edgeClass) => {
            // node 由 edgeCandidates 同构计算(insertEdgeNode 内的 same 编号算法)
            // 这里把候选 node 一并存入, 关闭开关时按 ownerBlockId + node 回收
            setPendingEdgeInserts((arr) => [
              ...arr.filter((x) => x.ownerBlockId !== block.id),
              { edgeClass, node, start, end, ownerBlockId: block.id },
            ])
            updateBlock(block.id, { isIrregularNode: true, selectedEdgeNode: node, clamped: false })
          }}
          onEditExistingSlot={(node, start, end) => {
            setPendingEdgeEdits((arr) => [...arr.filter((x) => x.node !== node), { node, start, end }])
          }}
          onDeselectEdge={(released) => {
            // 本卡独占的新建槽位: 无他卡引用同 node 即回收 (Android §2.3 槽位复用)
            setPendingEdgeInserts((arr) => arr.filter((ins) => {
              if (ins.ownerBlockId !== block.id || ins.node !== released) return true
              return meetingBlocks.some((o) => o.id !== block.id && o.isIrregularNode && o.selectedEdgeNode === released)
            }))
            updateBlock(block.id, { isIrregularNode: false, selectedEdgeNode: 0 })
          }}
          onToggleIrregularTime={(next) => {
            if (next) {
              // §2.4 B 规则: 起止空时按本卡生效时间预填, 编辑模式回填已在 blocks 构造时给值
              const patch: Partial<MeetingBlockDraft> = { isIrregularTime: true }
              if (block.startTime === '' || block.endTime === '') {
                const r = blockEffectiveRange({ ...block, isIrregularTime: false }, effectiveTimeJson)
                patch.startTime = r?.[0] ?? '08:00'
                patch.endTime = r?.[1] ?? '09:40'
              }
              updateBlock(block.id, patch)
            } else {
              updateBlock(block.id, { isIrregularTime: false })
            }
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
          height: 48, borderRadius: 16, padding: '0 16px', border: 'none', cursor: 'pointer',
          background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)',
          fontSize: 14, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <IconAdd size={18} />
        {t('add_slot')}
      </button>

      <button
        onClick={() => void performSave(false)}
        disabled={!canSave}
        style={{
          height: 56, borderRadius: 16, padding: '0 16px', border: 'none', cursor: canSave ? 'pointer' : 'default',
          background: 'var(--md-primary)', color: 'var(--md-on-primary)',
          fontSize: 15, fontWeight: 600, opacity: canSave ? 1 : 0.5,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <IconCheck size={18} />
        {isEditing ? t('save_course') : t('create_course_btn')}
      </button>

      {isEditing && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            height: 48, borderRadius: 16, padding: '0 16px', border: 'none', cursor: 'pointer',
            background: 'var(--md-error-container)', color: 'var(--md-on-error-container)',
            fontSize: 14, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <IconDelete size={18} />
          {t('delete_course')}
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

      {/* 删除课程确认 — M3 AlertDialog 语义 (onSurface 标题 + error 色按钮) */}
      {showDeleteConfirm && (
        <Overlay onDismiss={() => setShowDeleteConfirm(false)}>
          <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('confirm_delete')}</h2>
          <div className="m3-body-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('delete_course_confirm', { v1: editingCourse?.courseName ?? '' })}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={ghostStyle}>
              {t('cancel')}
            </button>
            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                void handleDeleteGroup()
              }}
              style={{
                padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--md-error)', fontWeight: 600,
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

// ── MeetingBlockCard — 单时段卡 ─────────────────────────────────────────

function MeetingBlockCard({
  title, block, canRemove, maxStd, issues, timeJson, onRemove, onChange,
  onPickExistingEdge, onPickNewEdgeSlot, onEditExistingSlot, onDeselectEdge, onToggleIrregularTime,
}: {
  title: string
  block: MeetingBlockDraft
  canRemove: boolean
  maxStd: number
  issues: string[]
  timeJson: string
  onRemove: () => void
  onChange: (patch: Partial<MeetingBlockDraft>) => void
  onPickExistingEdge: (node: number) => void
  onPickNewEdgeSlot: (start: string, end: string, node: number, edgeClass: 'before' | 'after') => void
  onEditExistingSlot: (node: number, start: string, end: string) => void
  onDeselectEdge: (released: number) => void
  onToggleIrregularTime: (next: boolean) => void
}) {
  const { t, i18n } = useTranslation()

  // 受控折叠态 — 编辑已启用任一非常规项的卡时默认展开 (Android §4 IrregularOptionsSection)
  const [irregularOpen, setIrregularOpen] = useState(block.isIrregularNode || block.isIrregularTime)
  const [edgePickerOpen, setEdgePickerOpen] = useState(false)
  const [newSlotDraft, setNewSlotDraft] = useState<{ node: number; start: string; end: string; edgeClass: 'before' | 'after' } | null>(null)
  const [slotEditDraft, setSlotEditDraft] = useState<{ node: number; start: string; end: string } | null>(null)

  function toggleDay(day: number) {
    const days = block.days.includes(day)
      ? block.days.filter((d) => d !== day)
      : [...block.days, day]
    onChange({ days })
  }

  const weekTypes: Array<[WeekType, string]> = [
    [0, t('week_every')], [1, t('week_odd')], [2, t('week_even')], [3, t('week_custom')],
  ]

  const selectedCandidate: EdgeCandidate | null = block.isIrregularNode
    ? edgeCandidates(timeJson).find((c) => c.node === block.selectedEdgeNode) ?? null
    : null

  // §2.4 B 规则: 联动起止与时长 (任一为 null → duration 为空; 改时长反推 end, 跨午夜回退清空)
  function setStart(start: string) {
    const s = parseHm(start)
    const e = parseHm(block.endTime)
    const patch: Partial<MeetingBlockDraft> = { startTime: start }
    if (s !== null && e !== null && e > s) patch.endTime = endHm(s, e - s)
    onChange(patch)
  }
  function setEnd(end: string) {
    const s = parseHm(block.startTime)
    const e = parseHm(end)
    const patch: Partial<MeetingBlockDraft> = { endTime: end }
    if (s !== null && e !== null && e > s) patch.endTime = end
    onChange(patch)
  }
  function setDuration(mins: number) {
    const s = parseHm(block.startTime)
    if (s === null || mins <= 0) {
      onChange({ startTime: block.startTime, endTime: block.endTime })
      return
    }
    const eMin = s + mins
    // plusMinutes 跨午夜(end<=start) → 回退清空交由校验
    if (eMin <= s || eMin >= 24 * 60) {
      onChange({ startTime: '', endTime: '' })
      return
    }
    onChange({ startTime: hmOf(s), endTime: hmOf(eMin) })
  }

  return (
    <div
      className="m3-card"
      style={{
        padding: 14,
        borderRadius: 16,
        // issue#9 延伸: NumberField 被夹紧时 block.clamped=true 也走 errorContainer
        background: issues.length > 0 || block.clamped ? 'var(--md-error-container)' : 'var(--md-surface-container-high)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      {block.clamped && (
        <div className="m3-label-small" style={{ color: 'var(--md-on-error-container)' }}>
          {t('slot_step_clamped_hint', { v3: maxStd })}
        </div>
      )}
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
          <button
            onClick={onRemove}
            aria-label={t('delete_slot')}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: 8, color: 'var(--md-on-surface-variant)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <IconClose size={18} />
          </button>
        )}
      </div>

      {/* 星期多选 — 两行网格: 4 列 × 2 行 + 第 2 行末占位 (Android MultiDayPicker §10) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[1, 2, 3, 4].map((d) => {
            const on = block.days.includes(d)
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                style={{
                  height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14,
                  background: on ? 'var(--md-primary)' : 'var(--md-surface-container-highest)',
                  color: on ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                  fontWeight: 500,
                }}
              >
                {localizedDay(d, i18n.language)}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[5, 6, 7].map((d) => {
            const on = block.days.includes(d)
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={on}
                style={{
                  height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14,
                  background: on ? 'var(--md-primary)' : 'var(--md-surface-container-highest)',
                  color: on ? 'var(--md-on-primary)' : 'var(--md-on-surface)',
                  fontWeight: 500,
                }}
              >
                {localizedDay(d, i18n.language)}
              </button>
            )
          })}
          <div aria-hidden="true" />
        </div>
      </div>

      {/* 标准节次 — max=maxStd (§10); 任一字段成功编辑复位 clamped */}
      {!block.isIrregularNode && (
        <div style={{ display: 'flex', gap: 12 }}>
          <NumberField
            label={t('start_node')}
            value={block.startNode}
            max={maxStd}
            onChange={(v) => {
              const stepCap = Math.max(1, maxStd - v + 1)
              onChange({ startNode: v, step: block.step > stepCap ? stepCap : block.step, clamped: false })
            }}
            onClamp={() => onChange({ clamped: true })}
            grow
          />
          <NumberField
            label={t('step_count')}
            value={block.step}
            max={Math.max(1, maxStd - block.startNode + 1)}
            onChange={(v) => onChange({ step: v, clamped: false })}
            onClamp={() => onChange({ clamped: true })}
            grow
          />
        </div>
      )}

      {/* 非常规选项折叠栏 — surfaceContainerHighest 底, 12dp 圆角, chevron 旋转动画 (§4) */}
      <div
        style={{
          background: 'var(--md-surface-container-highest)',
          borderRadius: 12,
        }}
      >
        <div
          role="button"
          aria-expanded={irregularOpen}
          onClick={() => setIrregularOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 12px', userSelect: 'none',
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="m3-body-medium" style={{ fontWeight: 600 }}>
              {t('irregular_options_section')}
            </span>
            <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
              {irregularOpen
                ? t('irregular_options_section_sub')
                : irregularOptionsSummary(
                    block.isIrregularNode,
                    block.isIrregularTime,
                    block.startTime,
                    block.endTime,
                    block.selectedEdgeNode,
                    t('irregular_node_switch'),
                    t('irregular_time_switch'),
                  ) || t('irregular_options_section_sub')}
            </span>
          </div>
          <div
            style={{
              transition: 'transform 0.2s ease',
              transform: `rotate(${irregularOpen ? 90 : 0}deg)`,
              display: 'inline-flex',
              color: 'var(--md-on-surface-variant)',
            }}
          >
            <IconChevronRight size={20} />
          </div>
        </div>
        <div
          style={{
            maxHeight: irregularOpen ? 600 : 0,
            opacity: irregularOpen ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-height 0.2s ease, opacity 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px 12px' }}>
            {/* 开关一 — 非常规节次 */}
            <SwitchRow
              label={t('irregular_node_switch')}
              sub={t('irregular_node_switch_sub')}
              checked={block.isIrregularNode}
              onChange={(on) => {
                if (on) {
                  // 开 → 弹候选弹层; selectedEdgeNode 暂不锁, 待弹层回调再写
                  setEdgePickerOpen(true)
                } else {
                  const released = block.selectedEdgeNode
                  onChange({ isIrregularNode: false, selectedEdgeNode: 0, clamped: false })
                  onDeselectEdge(released)
                }
                setIrregularOpen(true)
              }}
            />
            {block.isIrregularNode && selectedCandidate && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: selectedCandidate.exists ? 'var(--md-secondary-container)' : 'var(--md-surface-container-highest)',
                  color: selectedCandidate.exists ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)',
                  borderRadius: 12, padding: '10px 12px',
                }}
              >
                <span className="m3-body-medium" style={{ flex: 1 }}>
                  {selectedCandidate.exists
                    ? t('edge_node_range', { v1: selectedCandidate.node, v2: selectedCandidate.start, v3: selectedCandidate.end })
                    : t('edge_node_label', { v1: selectedCandidate.node })}
                </span>
                {selectedCandidate.exists && (
                  <button
                    onClick={() =>
                      setSlotEditDraft({
                        node: selectedCandidate.node,
                        start: selectedCandidate.start,
                        end: selectedCandidate.end,
                      })
                    }
                    aria-label={t('irregular_slot_edit_title', { v1: selectedCandidate.node })}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      padding: 4, color: 'var(--md-on-surface-variant)',
                      display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    <IconEdit size={18} />
                  </button>
                )}
              </div>
            )}
            {/* 开关二 — 非常规时间 */}
            <SwitchRow
              label={t('irregular_time_switch')}
              sub={t('irregular_time_switch_sub')}
              checked={block.isIrregularTime}
              onChange={(on) => onToggleIrregularTime(on)}
            />
            {block.isIrregularTime && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <TimeField
                    label={t('start_time')}
                    value={block.startTime}
                    onChange={setStart}
                  />
                  <TimeField
                    label={t('end_time')}
                    value={block.endTime}
                    onChange={setEnd}
                  />
                </div>
                <NumberField
                  label={t('irregular_duration_label')}
                  value={durationMinutes(block.startTime, block.endTime)}
                  max={1440}
                  onChange={setDuration}
                  onClamp={() => onChange({ startTime: '', endTime: '' })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 每卡周次 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <NumberField label={`${t('slot_week_range')} ${t('start_week')}`} value={block.startWeek} onChange={(v) => onChange({ startWeek: v })} grow />
        <NumberField label={`${t('slot_week_range')} ${t('end_week')}`} value={block.endWeek} onChange={(v) => onChange({ endWeek: v })} grow />
      </div>

      {/* 单双周 4 态 — secondaryContainer 选中块 + 14dp 圆角 (Android SegmentedSwitcher §11) */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--md-surface-container)', borderRadius: 14, padding: 4 }}>
        {weekTypes.map(([val, label]) => (
          <button
            key={val}
            onClick={() => onChange({ weekType: val })}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12,
              background: block.weekType === val ? 'var(--md-secondary-container)' : 'transparent',
              color: block.weekType === val ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface-variant)',
              fontWeight: block.weekType === val ? 600 : 400,
              transition: 'background-color 0.15s ease',
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

      {/* 颜色三态 — 开关 + 32dp 圆点 + Switch 首次开 → AUTO (Android ColorSection §11) */}
      <ColorSection block={block} onChange={onChange} />

      {issues.map((issue, i) => (
        <div key={i} className="m3-label-small" style={{ color: 'var(--md-error)' }}>{issue}</div>
      ))}

      {/* 候选节次弹层 — Before/After 两组, exists 行 secondaryContainer, else 行 surfaceContainerHighest (§2.2) */}
      {edgePickerOpen && (
        <Overlay onDismiss={() => setEdgePickerOpen(false)}>
          <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('irregular_node_pick')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {edgeCandidates(timeJson).map((c) => (
              <button
                key={`${c.edgeClass}-${c.node}`}
                onClick={() => {
                  if (c.exists) {
                    onPickExistingEdge(c.node)
                    setEdgePickerOpen(false)
                  } else {
                    setNewSlotDraft({ node: c.node, start: '', end: '', edgeClass: c.edgeClass })
                    setEdgePickerOpen(false)
                  }
                }}
                className="m3-body-medium"
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '10px 12px', border: 'none', cursor: 'pointer',
                  borderRadius: 12,
                  background: c.exists ? 'var(--md-secondary-container)' : 'var(--md-surface-container-highest)',
                  color: c.exists ? 'var(--md-on-secondary-container)' : 'var(--md-on-surface)',
                }}
              >
                {c.exists
                  ? t('edge_node_range', { v1: c.node, v2: c.start, v3: c.end })
                  : t('irregular_node_new', { v1: c.node })}
              </button>
            ))}
          </div>
        </Overlay>
      )}
      {/* 新建槽位弹窗 — 起止 + 校验 disabled (§2.2) */}
      {newSlotDraft && (
        <NewEdgeSlotDialog
          node={newSlotDraft.node}
          start={newSlotDraft.start}
          end={newSlotDraft.end}
          onChangeStart={(s) => setNewSlotDraft({ ...newSlotDraft, start: s })}
          onChangeEnd={(e) => setNewSlotDraft({ ...newSlotDraft, end: e })}
          onConfirm={() => {
            if (parseHm(newSlotDraft.start) === null || parseHm(newSlotDraft.end) === null) return
            onPickNewEdgeSlot(newSlotDraft.start, newSlotDraft.end, newSlotDraft.node, newSlotDraft.edgeClass)
            setNewSlotDraft(null)
          }}
          onDismiss={() => setNewSlotDraft(null)}
        />
      )}
      {/* 已有槽位默认时间编辑弹窗 (§2.5) */}
      {slotEditDraft && (
        <NewEdgeSlotDialog
          node={slotEditDraft.node}
          start={slotEditDraft.start}
          end={slotEditDraft.end}
          onChangeStart={(s) => setSlotEditDraft({ ...slotEditDraft, start: s })}
          onChangeEnd={(e) => setSlotEditDraft({ ...slotEditDraft, end: e })}
          onConfirm={() => {
            if (parseHm(slotEditDraft.start) === null || parseHm(slotEditDraft.end) === null) return
            onEditExistingSlot(slotEditDraft.node, slotEditDraft.start, slotEditDraft.end)
            setSlotEditDraft(null)
          }}
          onDismiss={() => setSlotEditDraft(null)}
        />
      )}
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

/** endHm — minutes 加到 s 分钟数后转 HH:mm 字符串 (parseHm 已是分钟数) */
function endHm(startMin: number, deltaMin: number): string {
  return hmOf(startMin + deltaMin)
}

/** hmOf — 分钟数 → HH:mm 字符串 (0..1439) */
function hmOf(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** durationMinutes — 起止差(分钟), 任一失败返 0 (回填 NumberField 用) */
function durationMinutes(start: string, end: string): number {
  const s = parseHm(start)
  const e = parseHm(end)
  if (s === null || e === null || e <= s) return 0
  return e - s
}

/** irregularOptionsSummary — 收起时栏头摘要 (§4 折叠栏) */
function irregularOptionsSummary(
  isIrregularNode: boolean,
  isIrregularTime: boolean,
  startTime: string,
  endTime: string,
  selectedEdgeNode: number,
  nodeSwitchLabel: string,
  timeSwitchLabel: string,
): string {
  const parts: string[] = []
  if (isIrregularNode) {
    parts.push(selectedEdgeNode > 0 ? `${nodeSwitchLabel} · 第${selectedEdgeNode}节` : nodeSwitchLabel)
  }
  if (isIrregularTime) {
    if (startTime && endTime) parts.push(`${timeSwitchLabel} · ${startTime}–${endTime}`)
    else parts.push(timeSwitchLabel)
  }
  return parts.join(' / ')
}

/** '#RRGGBB' → '#FFRRGGBB' (ARGB, Course.color 存储形态) */
// export function argbOf ... — 当前未消费, 保留接口但暂不导出 (T21 courseColor 落地后接入)

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

// ── 颜色三态 (§11 ColorSection) ─────────────────────────────────────────

function ColorSection({
  block, onChange,
}: {
  block: MeetingBlockDraft
  onChange: (patch: Partial<MeetingBlockDraft>) => void
}) {
  const { t } = useTranslation()
  const useDifferent = block.colorMode !== 0
  const [showPicker, setShowPicker] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="m3-label-large" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('course_color')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {useDifferent ? t('color_use_different') : t('color_follow_group')}
          </span>
          <button
            role="switch"
            aria-checked={useDifferent}
            onClick={() => {
              if (useDifferent) {
                onChange({ colorMode: 0 })
              } else {
                // 首次打开: 落 AUTO (Android 同构)
                onChange({ colorMode: 1 })
              }
            }}
            style={{
              width: 52, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: useDifferent ? 'var(--md-primary)' : 'var(--md-surface-container-highest)',
              position: 'relative', padding: 0, flexShrink: 0,
              transition: 'background 150ms',
            }}
          >
            <div
              style={{
                width: useDifferent ? 24 : 16, height: useDifferent ? 24 : 16, borderRadius: 16,
                background: useDifferent ? 'var(--md-on-primary)' : 'var(--md-outline)',
                position: 'absolute', top: 4,
                left: useDifferent ? 24 : 4,
                transition: 'all 150ms',
              }}
            />
          </button>
        </div>
      </div>
      {useDifferent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 自动 — 32dp 圆点, 选中 primaryContainer 底, 内文 t('label_from') 11px */}
          <button
            onClick={() => onChange({ colorMode: 1, color: '' })}
            aria-label={t('color_auto')}
            style={{
              width: 32, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: block.colorMode === 1 ? 'var(--md-primary-container)' : 'var(--md-surface-variant)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 500,
              color: block.colorMode === 1 ? 'var(--md-on-primary-container)' : 'var(--md-on-surface-variant)',
            }}
          >
            {t('label_from')}
          </button>
          {/* 自定义 — 32dp 圆点, 有色显该色, 无色 surfaceVariant + 「＋」 */}
          <button
            onClick={() => setShowPicker(true)}
            aria-label={t('color_custom')}
            style={{
              width: 32, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer',
              background: block.colorMode === 2 && block.color ? block.color : 'var(--md-surface-variant)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: 'var(--md-on-surface-variant)',
            }}
          >
            {!(block.colorMode === 2 && block.color) && '＋'}
          </button>
          {block.colorMode === 2 && block.color && (
            <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
              {block.color}
            </span>
          )}
        </div>
      )}
      {showPicker && (
        <ColorPickerDialog
          initialHex={block.color || '#FF6750A4'}
          onConfirm={(hex) => {
            onChange({ colorMode: 2, color: hex })
            setShowPicker(false)
          }}
          onDismiss={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

/** HSV 取色器弹窗 — SV 面板(白→透明 + 透明→黑 双层渐变) + 色相条(rainbow linear-gradient)
 *  + 预览圆 + hex (web 等价实现, 拖动事件省略, 仅支持点击 — 用户极少数触达路径) */
function ColorPickerDialog({
  initialHex, onConfirm, onDismiss,
}: {
  initialHex: string
  onConfirm: (hex: string) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const rgb = parseHexRgb(initialHex) ?? [103, 80, 164]
  const initialHsv = rgbToHsv(rgb)
  const [hue, setHue] = useState(initialHsv[0])
  const [sat, setSat] = useState(initialHsv[1])
  const [val, setVal] = useState(initialHsv[2])
  const [hex, setHex] = useState(initialHex)

  function commitHSV(h: number, s: number, v: number) {
    setHue(h); setSat(s); setVal(v)
    const rgb2 = hsvToRgb(h, s, v)
    const rh = rgb2.map((x) => x.toString(16).padStart(2, '0')).join('')
    setHex(`#FF${rh.toUpperCase()}`)
  }

  return (
    <Overlay onDismiss={onDismiss}>
      <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('course_color')}</h2>
      {/* SV 面板 — 200dp 高 */}
      <div
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
          commitHSV(hue, x, 1 - y)
        }}
        style={{
          position: 'relative', width: '100%', height: 200, borderRadius: 16,
          background: `hsl(${hue}, 100%, 50%)`,
          cursor: 'crosshair',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, white, transparent)', borderRadius: 16 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, black)', borderRadius: 16 }} />
        <div
          style={{
            position: 'absolute',
            left: `${sat * 100}%`, top: `${(1 - val) * 100}%`,
            width: 12, height: 12, borderRadius: 6,
            transform: 'translate(-50%, -50%)',
            background: 'white', boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          }}
        />
      </div>
      {/* 色相滑条 — 36dp 高, 360° 彩虹 */}
      <div
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          commitHSV(x * 360, sat, val)
        }}
        style={{
          position: 'relative', width: '100%', height: 36, borderRadius: 16,
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          cursor: 'crosshair',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${(hue / 360) * 100}%`, top: '50%',
            width: 12, height: 12, borderRadius: 6,
            transform: 'translate(-50%, -50%)',
            background: 'white', boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
          }}
        />
      </div>
      {/* 预览 + Hex */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 20,
            background: `hsl(${hue}, ${sat * 100}%, ${val * 50}%)`,
          }}
        />
        <span className="m3-label-large" style={{ color: 'var(--md-on-surface-variant)' }}>{hex}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onDismiss} style={ghostStyle}>{t('cancel')}</button>
        <button
          onClick={() => onConfirm(hex)}
          style={{
            padding: '8px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600,
          }}
        >
          {t('ok')}
        </button>
      </div>
    </Overlay>
  )
}

// HSV/RGB 转换 (颜色三态拾色器用, 复用 domain/courseColor.ts 习惯)
function parseHexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.slice(0, 7))
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
function rgbToHsv(rgb: [number, number, number]): [number, number, number] {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  const v = max
  return [h, s, v]
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// ── 通用 UI ─────────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  background: 'var(--md-surface-container-highest)',
  color: 'var(--md-on-surface)',
  border: 'none',
  borderRadius: 12,
  padding: '10px 12px',
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
  label, value, onChange, max = 30, grow, onClamp,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  max?: number
  grow?: boolean
  onClamp?: () => void
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
          // Android NumberField: 空 → 回调 min, 保证 model 恒有合法值
          if (e.target.value === '') {
            onChange(1)
            return
          }
          const v = parseInt(e.target.value, 10)
          if (!Number.isNaN(v)) {
            const clamped = Math.min(Math.max(1, v), max)
            if (clamped !== v) onClamp?.()
            onChange(clamped)
          }
        }}
        style={fieldStyle}
      />
    </label>
  )
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle} />
    </label>
  )
}

/** SwitchRow — label + sub + Switch, M3 风格 (§11) */
function SwitchRow({
  label, sub, checked, onChange,
}: {
  label: string
  sub: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="m3-body-medium">{label}</span>
        <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{sub}</span>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 52, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer',
          background: checked ? 'var(--md-primary)' : 'var(--md-surface-container-highest)',
          position: 'relative', padding: 0, flexShrink: 0,
          transition: 'background 150ms',
        }}
      >
        <div
          style={{
            width: checked ? 24 : 16, height: checked ? 24 : 16, borderRadius: 16,
            background: checked ? 'var(--md-on-primary)' : 'var(--md-outline)',
            position: 'absolute', top: 4,
            left: checked ? 24 : 4,
            transition: 'all 150ms',
          }}
        />
      </button>
    </div>
  )
}

/** NewEdgeSlotDialog — 新建槽位 / 已有槽位默认时间编辑 复用 (Android 同构, §2.2/§2.5) */
function NewEdgeSlotDialog({
  node, start, end, onChangeStart, onChangeEnd, onConfirm, onDismiss,
}: {
  node: number
  start: string
  end: string
  onChangeStart: (v: string) => void
  onChangeEnd: (v: string) => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const valid = parseHm(start) !== null && parseHm(end) !== null
  return (
    <Overlay onDismiss={onDismiss}>
      <h2 className="m3-title-medium" style={{ margin: 0 }}>
        {t('irregular_node_new_title', { v1: node })}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TimeField label={t('edge_insert_start_label')} value={start} onChange={onChangeStart} />
        <TimeField label={t('edge_insert_end_label')} value={end} onChange={onChangeEnd} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onDismiss} style={ghostStyle}>{t('cancel')}</button>
        <button
          disabled={!valid}
          onClick={onConfirm}
          style={{
            padding: '8px 16px', borderRadius: 12, border: 'none', cursor: valid ? 'pointer' : 'default',
            background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600,
            opacity: valid ? 1 : 0.5,
          }}
        >
          {t('edge_insert_ok')}
        </button>
      </div>
    </Overlay>
  )
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label={t('back')}
        style={{
          padding: '8px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--md-on-surface)', fontSize: 18,
        }}
      >
        <IconArrowBack size={20} />
      </button>
      <h1 className="m3-title-large" style={{ margin: 0 }}>{title}</h1>
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
        style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}
      >
        {children}
      </div>
    </div>
  )
}