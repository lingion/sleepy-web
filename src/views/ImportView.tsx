/**
 * ImportView — Kotlin ImportSheet.kt 1:1 移植 (粘贴/文件 → 预览 → 确认 → 应用)
 * 5 应用模式: ReplaceCurrent / ImportAsNew / AppendNonConflict / AppendAll / AppendAsNew
 * 导入是复合动作: applyImportPreview 全程 beginBatch/endBatch, 撤回一次回退到导入前。
 * 解析端权威 groupId (sleepy-v1) → 走 insertCoursesKeepingGroups/replaceCoursesKeepingGroups。
 */

import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { IconDescription, IconExpandLess, IconExpandMore, IconFileUpload, IconInfo, IconQrCode2 } from '../components/icons'
import { FormatDetailDialog } from '../components/FormatDetailDialog'
import { FORMAT_KEYS, IMPORT_FORMATS, type ImportFormat } from '../components/formatHelp'
import { db } from '../data/db'
import {
  getTable,
  getCourses,
  insertTable,
  updateTable,
  insertCoursesKeepingGroups,
  insertCourses,
  replaceCoursesKeepingGroups,
  replaceCourses,
  setDefault,
} from '../data/repository'
import { useUndoStore } from '../data/undoStore'
import { parseSchedule, type ParseResult } from '../domain/import/scheduleParser'
import type { ParsedCourse } from '../domain/import/sleepyNativeParser'
import { daysExceedingTwoLanes } from '../domain/conflictLayout'
import {
  parseTimeSlotRows,
  buildTimeJsonFromRows,
  mergeMostComplete,
} from '../domain/timeTable'
import type { Course } from '../data/types'
import { localizedDay } from '../components/schedule/CardsGridView'

type ApplyMode =
  | 'ReplaceCurrent'
  | 'ImportAsNew'
  | 'AppendNonConflict'
  | 'AppendAll'
  | 'AppendAsNew'

type IconComponent = ComponentType<{ size?: number; color?: string }>

interface CourseConflict {
  incoming: ParsedCourse
  existing: Course
}

interface ImportPreview {
  targetTableId: number
  targetTableName: string
  parseResult: ParseResult
  existingCourses: Course[]
  conflicts: CourseConflict[]
  multiLocationWarnings: string[]
}

/** coursesConflict — ImportSheet.kt 同名函数: day 相同 + 周次区间重叠 + 节次区间重叠 */
function coursesConflict(a: Course | ParsedCourse, b: Course | ParsedCourse): boolean {
  if (a.day !== b.day) return false
  if (a.endWeek < b.startWeek || b.endWeek < a.startWeek) return false
  const aEnd = a.startNode + a.step - 1
  const bEnd = b.startNode + b.step - 1
  return a.startNode <= bEnd && b.startNode <= aEnd
}

/** uniqueImportedTableName — 重名追加序号 (2, 3, …) */
function uniqueImportedTableName(base: string, existingNames: string[], defaultName: string): string {
  const effective = base.trim() || defaultName
  if (!existingNames.includes(effective)) return effective
  let index = 2
  while (existingNames.includes(`${effective}${index}`) || existingNames.includes(`${effective}(${index})`)) index++
  return `${effective}${index}`
}

import { normalizeStartDateToMonday as normalizeStartDate } from './importExportUtils'

/** ParsedCourse → Course 落库映射 — 补 Course 独有默认字段 */
function toCourse(pc: ParsedCourse, tableId: number): Course {
  return {
    id: 0,
    groupId: pc.groupId,
    tableId,
    courseName: pc.courseName,
    teacher: pc.teacher,
    room: pc.room,
    note: pc.note,
    alias: pc.alias,
    day: pc.day,
    startNode: pc.startNode,
    step: pc.step,
    startWeek: pc.startWeek,
    endWeek: pc.endWeek,
    type: pc.type as Course['type'],
    color: pc.color,
    colorMode: 0,
    ownTime: pc.ownTime,
    isIrregularNode: false,
    isIrregularTime: pc.ownTime,
    startTime: pc.startTime,
    endTime: pc.endTime,
    credit: 0,
    level: 0,
  }
}

export function ImportView({ onDone, onJwImport }: { onDone: () => void; onJwImport?: () => void }) {
  const { t, i18n } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const defaultTable = tables.find((x) => x.isDefault === 1) ?? tables[0]

  // 默认折叠 — ImportSheet.kt:109 textExpanded = false 同构
  const [textExpanded, setTextExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [inputText, setInputText] = useState('')
  // 格式详情弹窗 (ImportSheet.kt:366 detailFormat) — null = 未打开
  const [detailFormat, setDetailFormat] = useState<ImportFormat | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [pendingMode, setPendingMode] = useState<ApplyMode | null>(null)
  const [confirmedTableName, setConfirmedTableName] = useState('')
  const [confirmedStartDate, setConfirmedStartDate] = useState('')
  const [confirmedTimeJson, setConfirmedTimeJson] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  async function buildPreview(text: string) {
    if (!text.trim()) {
      setErrorMsg(t('import_content_empty'))
      return
    }
    // selectedTableId 缺失时也能导入 — 没有 tableId 就用 0, apply 时按 ImportAsNew 自动建表
    const tableId = defaultTable?.id ?? 0
    const result = parseSchedule(text, tableId)
    if (!result.ok) {
      setErrorMsg(t('import_failed', { v1: result.error.message }))
      return
    }
    const parseResult = result.value
    const existingTable = tableId === 0 ? undefined : await getTable(tableId)
    const existingCourses = tableId === 0 ? [] : await getCourses(tableId)
    const conflicts: CourseConflict[] =
      tableId === 0
        ? []
        : parseResult.courses.flatMap((incoming) => {
            const existing = existingCourses.find((c) => coursesConflict(incoming, c))
            return existing ? [{ incoming, existing }] : []
          })
    // issue#22: 同 groupId 多地点提示 — 按 groupId 聚合, ≥2 个非空不同地点时提示
    const multiLocationWarnings: string[] = []
    const byGroup = new Map<string, ParsedCourse[]>()
    for (const c of parseResult.courses) {
      if (!c.groupId) continue
      const list = byGroup.get(c.groupId) ?? []
      list.push(c)
      byGroup.set(c.groupId, list)
    }
    for (const cs of byGroup.values()) {
      const rooms = [...new Set(cs.map((c) => c.room.trim()).filter((r) => r !== ''))]
      if (rooms.length >= 2) {
        multiLocationWarnings.push(
          t('import_multi_location_warning_detail', { v1: cs[0].courseName, v2: rooms.length }),
        )
      }
    }
    setPreview({
      targetTableId: tableId,
      targetTableName: existingTable?.name ?? t('manage_current_table'),
      parseResult,
      existingCourses,
      conflicts,
      multiLocationWarnings,
    })
  }

  /** applyImportPreview — 唯一写库点, 复合动作批边界包裹 */
  async function applyPreview(p: ImportPreview, mode: ApplyMode) {
    const undo = useUndoStore.getState()
    undo.beginBatch()
    try {
      // 应用约定 startDate=周一; 用户可能手填非周一, 落库前归一 (issue #5)
      const existingTable = p.targetTableId === 0 ? undefined : await getTable(p.targetTableId)
      const authoritative = p.parseResult.groupIdsAuthoritative
      const confirmStart =
        p.parseResult.startDate || existingTable?.startDate || new Date().toISOString().slice(0, 10)

      if (mode === 'ReplaceCurrent') {
        if (existingTable) {
          await updateTable({
            ...existingTable,
            name: confirmedTableName.trim() || p.parseResult.tableName || existingTable.name,
            startDate: normalizeStartDate(confirmStart),
            timeJson: confirmedTimeJson,
            nodeCount:
              p.parseResult.nodesPerDay > 0
                ? p.parseResult.nodesPerDay
                : existingTable.nodeCount,
          })
        }
        // sleepy-v1 (§3.4 契约一): 解析端权威 groupId → 绕过 assignGroupIds 再分配;
        // 非 authoritative (WakeUp share/JSON/ICS 等 groupId='') → assignGroupIds 按名补组
        // (Kotlin replaceCourses / replaceCoursesKeepingGroups 分流同构)
        if (authoritative) {
          await replaceCoursesKeepingGroups(
            p.targetTableId,
            p.parseResult.courses.map((c) => toCourse(c, p.targetTableId)),
          )
        } else {
          await replaceCourses(p.targetTableId, p.parseResult.courses.map((c) => toCourse(c, p.targetTableId)))
        }
        await warnBadDays(p.parseResult.courses.map((c) => toCourse(c, p.targetTableId)))
        onDone()
      } else if (mode === 'ImportAsNew') {
        const newTableId = await insertTable({
          name: uniqueImportedTableName(
            confirmedTableName || p.parseResult.tableName,
            tables.map((x) => x.name),
            t('default_table_name'),
          ),
          timeJson: confirmedTimeJson,
          smartConfigJson: '',
          isDefault: 0,
          startDate: normalizeStartDate(confirmStart),
          nodeCount:
            p.parseResult.nodesPerDay > 0
              ? p.parseResult.nodesPerDay
              : Math.max(12, parseTimeSlotRows(confirmedTimeJson).length),
          maxWeek: p.parseResult.maxWeek > 0 ? p.parseResult.maxWeek : existingTable?.maxWeek ?? 20,
          createdAt: Date.now(),
        })
        if (authoritative) {
          await insertCoursesKeepingGroups(p.parseResult.courses.map((c) => toCourse(c, newTableId)))
        } else {
          await insertCourses(p.parseResult.courses.map((c) => toCourse(c, newTableId)))
        }
        await setDefault(newTableId)
        await warnBadDays(p.parseResult.courses.map((c) => toCourse(c, newTableId)))
        onDone()
      } else if (mode === 'AppendNonConflict') {
        const clean = p.parseResult.courses.filter(
          (incoming) => !p.existingCourses.some((existing) => coursesConflict(incoming, existing)),
        )
        if (clean.length === 0) {
          setErrorMsg(t('import_all_conflict'))
          return
        }
        // v7.10.16x 相对判定: 只剔让某天新超 2 层的候选, 原表已有超层不连坐
        const before = daysExceedingTwoLanes(p.existingCourses)
        const survivors = clean.filter((cand) => {
          const after = daysExceedingTwoLanes([...p.existingCourses, ...toCourseList([cand], p.targetTableId)])
          return setEq(after, before)
        })
        if (survivors.length === 0) {
          setErrorMsg(t('import_all_conflict'))
          return
        }
        if (survivors.length < clean.length) {
          const droppedDays = new Set(
            clean.filter((c) => !survivors.includes(c)).map((c) => c.day),
          )
          setNotice(t('import_three_layers_dropped', { v1: dayNames(droppedDays, i18n.language) }))
        }
        if (authoritative) {
          await insertCoursesKeepingGroups(survivors.map((c) => toCourse(c, p.targetTableId)))
        } else {
          await insertCourses(survivors.map((c) => toCourse(c, p.targetTableId)))
        }
        await extendTimeLossless(p.targetTableId, p.parseResult)
        onDone()
      } else if (mode === 'AppendAll') {
        if (p.parseResult.courses.length === 0) {
          setErrorMsg(t('import_content_empty'))
          return
        }
        const badDays = daysExceedingTwoLanes([
          ...p.existingCourses,
          ...toCourseList(p.parseResult.courses, p.targetTableId),
        ])
        if (badDays.size > 0) {
          setNotice(t('import_three_layers_kept', { v1: dayNames(badDays, i18n.language) }))
        }
        if (authoritative) {
          await insertCoursesKeepingGroups(p.parseResult.courses.map((c) => toCourse(c, p.targetTableId)))
        } else {
          await insertCourses(p.parseResult.courses.map((c) => toCourse(c, p.targetTableId)))
        }
        await extendTimeLossless(p.targetTableId, p.parseResult)
        onDone()
      } else {
        // AppendAsNew — 当前课表 + 导入合并 → 新课表
        const incoming = p.parseResult
        const mergedTimeJson =
          confirmedTimeJson ||
          mergeMostComplete(existingTable?.timeJson ?? '', incoming.timeJson, incoming.nodesPerDay)
        const mergedRows = parseTimeSlotRows(mergedTimeJson)
        const oldCourses = existingTable ? await getCourses(existingTable.id) : []
        const cleanIncoming = incoming.courses.filter(
          (inc) => !p.existingCourses.some((existing) => coursesConflict(inc, existing)),
        )
        const beforeDays = daysExceedingTwoLanes(oldCourses)
        const afterDays = daysExceedingTwoLanes([...oldCourses, ...toCourseList(cleanIncoming, 0)])
        if (!setEq(afterDays, beforeDays)) {
          const dropped = new Set([...afterDays].filter((d) => !beforeDays.has(d)))
          setNotice(t('import_three_layers_kept', { v1: dayNames(dropped, i18n.language) }))
        }
        const newTableId = await insertTable({
          name: uniqueImportedTableName(
            confirmedTableName || incoming.tableName,
            tables.map((x) => x.name),
            t('default_table_name'),
          ),
          timeJson: mergedTimeJson,
          smartConfigJson: '',
          isDefault: 0,
          startDate: normalizeStartDate(confirmStart),
          nodeCount: mergedRows.length > 0 ? mergedRows.length : existingTable?.nodeCount ?? 12,
          maxWeek: incoming.maxWeek > 0 ? incoming.maxWeek : existingTable?.maxWeek ?? 20,
          createdAt: Date.now(),
        })
        // 老课全量保留 + 全部非重复导入课 (合并=并集, 闸门只提示不剔除)
        if (authoritative) {
          const keptOld = oldCourses.map((c) => ({ ...c, id: 0, tableId: newTableId }))
          const keptIncoming = cleanIncoming.map((c) => toCourse(c, newTableId))
          await insertCoursesKeepingGroups([...keptOld, ...keptIncoming])
        } else {
          const all = [
            ...oldCourses.map((c) => ({ ...c, id: 0, tableId: newTableId })),
            ...cleanIncoming.map((c) => toCourse(c, newTableId)),
          ]
          await insertCourses(all)
        }
        await setDefault(newTableId)
        onDone()
      }
    } finally {
      await useUndoStore.getState().endBatch()
    }
  }

  function toCourseList(courses: ParsedCourse[], tableId: number): Course[] {
    return courses.map((c) => toCourse(c, tableId))
  }

  /** 超层提示 (整表替换/新建不拦截, 仅提示 — v7.10.12) */
  async function warnBadDays(courses: Course[]) {
    const badDays = daysExceedingTwoLanes(courses)
    if (badDays.size > 0) {
      setNotice(t('import_three_layers_kept', { v1: dayNames(badDays, i18n.language) }))
    }
  }

  /** v7.10.16k 无损延伸: 老表作息 ∪ 导入作息, 并拓到导入课程实际到达的最大节 */
  async function extendTimeLossless(tableId: number, parseResult: ParseResult) {
    const existing = await getTable(tableId)
    if (!existing) return
    const extended = mergeMostComplete(
      existing.timeJson,
      parseResult.timeJson,
      parseResult.nodesPerDay,
    )
    if (extended !== existing.timeJson) {
      const rows = parseTimeSlotRows(extended)
      const newMax = rows.length > 0 ? Math.max(...rows.map((r) => r.node)) : existing.nodeCount
      await updateTable({ ...existing, timeJson: extended, nodeCount: newMax })
    }
  }

  function handleFile(file: File) {
    setIsLoading(true)
    void file
      .text()
      .then((text) => buildPreview(text))
      .catch((e: unknown) => {
        setErrorMsg(t('read_failed', { v1: e instanceof Error ? e.message : String(e) }))
      })
      .finally(() => setIsLoading(false))
  }

  const hasTables = tables.length > 0

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="m3-title-large" style={{ margin: 0 }}>{t('import_title')}</h1>
      <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
        {t('import_preview_sub')}
      </p>

      {/* 行 1：教务直连 — ImportSheet.kt:221-229 (关弹窗 → 拉起教务导入) */}
      <ImportMethodRow
        icon={IconQrCode2}
        label={t('import_jw')}
        onClick={() => onJwImport?.()}
      />

      {/* 行 2：从文本导入 (可折叠) — ImportSheet.kt:232-287, 展开内容 padding-start 56 */}
      <ImportMethodRow
        icon={IconDescription}
        label={t('import_paste')}
        trailing={textExpanded ? IconExpandLess : IconExpandMore}
        onClick={() => setTextExpanded((v) => !v)}
      />
      {textExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 4px 8px 56px' }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={t('import_paste_hint')}
            disabled={isLoading}
            aria-label={t('import_paste')}
            style={{
              width: '100%', minHeight: 160, boxSizing: 'border-box', resize: 'vertical',
              background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
              border: '1px solid var(--md-outline)', borderRadius: 8, padding: 10,
              fontSize: 13, fontFamily: 'monospace',
            }}
          />
          <button
            onClick={() => { setIsLoading(true); void buildPreview(inputText).finally(() => setIsLoading(false)) }}
            disabled={isLoading || inputText.trim() === ''}
            style={{
              padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'var(--md-primary)', color: 'var(--md-on-primary)',
              fontSize: 14, fontWeight: 600, opacity: isLoading || inputText.trim() === '' ? 0.5 : 1,
            }}
          >
            {isLoading ? t('import_parsing') : t('import_preview')}
          </button>
        </div>
      )}

      {/* 行 3：从文件导入 — ImportSheet.kt:290-297 (触发系统选择器) */}
      <ImportMethodRow
        icon={IconFileUpload}
        label={t('import_file')}
        onClick={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.txt,.csv,.html,.htm,.ics,.sleepy,text/plain,application/json,text/csv,text/html,text/calendar"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />

      {/* 支持的导入类型 — ImportSheet.kt FormatRow: • + 课名 + 说明 + ⓘ 详情 */}
      <div className="m3-card" style={{ padding: 16 }}>
        <div className="m3-title-small" style={{ fontWeight: 600, marginBottom: 8 }}>
          {t('import_supported_formats')}
        </div>
        {IMPORT_FORMATS.map((fmt) => {
          const keys = FORMAT_KEYS[fmt]
          return (
            <div
              key={fmt}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0' }}
            >
              <span aria-hidden style={{ color: 'var(--md-primary)', marginTop: 2 }}>•</span>
              <span className="m3-body-small" style={{ width: 110, flexShrink: 0, fontWeight: 600 }}>
                {t(keys.title)}
              </span>
              <span className="m3-body-small" style={{ flex: 1, color: 'var(--md-on-surface-variant)' }}>
                {t(keys.desc)}
              </span>
              <button
                type="button"
                onClick={() => setDetailFormat(fmt)}
                aria-label={t('format_detail_content_desc')}
                title={t('format_detail_content_desc')}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 6,
                  marginTop: 2,
                  padding: 2,
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'var(--md-on-surface-variant)',
                }}
              >
                <IconInfo size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* 格式详情弹窗 (ImportSheet.kt:366-369) */}
      {detailFormat && (
        <FormatDetailDialog format={detailFormat} onDismiss={() => setDetailFormat(null)} />
      )}

      {errorMsg && (
        <div
          role="alert"
          className="m3-card"
          style={{ padding: 12, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }}
        >
          {errorMsg}
        </div>
      )}
      {notice && !preview && (
        <div
          role="status"
          className="m3-card"
          style={{ padding: 12, background: 'var(--md-secondary-container)', color: 'var(--md-on-secondary-container)' }}
        >
          {notice}
        </div>
      )}
      {!hasTables && (
        <p className="m3-body-small" style={{ color: 'var(--md-primary)', margin: 0 }}>
          {t('import_new_table_hint')}
        </p>
      )}

      {/* 预览对话框 */}
      {preview && (
        <PreviewDialog
          preview={preview}
          hasTables={hasTables}
          onDismiss={() => setPreview(null)}
          onApply={(mode) => {
            const existingTable = tables.find((x) => x.id === preview.targetTableId)
            setConfirmedStartDate(
              preview.parseResult.startDate || existingTable?.startDate || new Date().toISOString().slice(0, 10),
            )
            setConfirmedTableName(
              preview.parseResult.tableName || existingTable?.name || t('default_table_name'),
            )
            // v7.10.16k 无损合并: 老表作息∪导入作息, 节次数取双方最大并拓到实际到达节
            setConfirmedTimeJson(
              mergeMostComplete(
                existingTable?.timeJson ?? '',
                preview.parseResult.timeJson,
                preview.parseResult.nodesPerDay,
              ),
            )
            setPendingMode(mode)
          }}
        />
      )}

      {/* 确认对话框 — ImportAsNew/ImportAsNew/AppendAsNew/ReplaceCurrent 走这里; 追加两模式直接应用 */}
      {preview && pendingMode && pendingMode !== 'AppendNonConflict' && pendingMode !== 'AppendAll' && (
        <ConfirmDialog
          startDate={confirmedStartDate}
          tableName={confirmedTableName}
          timeJson={confirmedTimeJson}
          showTableName={pendingMode === 'ImportAsNew' || pendingMode === 'AppendAsNew'}
          onTableNameChange={setConfirmedTableName}
          onStartDateChange={setConfirmedStartDate}
          onTimeJsonChange={setConfirmedTimeJson}
          onDismiss={() => setPendingMode(null)}
          onConfirm={() => {
            const mode = pendingMode
            const p = preview
            if (!mode || !p) return
            setPendingMode(null)
            void applyPreview(p, mode)
          }}
        />
      )}

      {/* 追加两模式: 命名由目标课表自带, 直接应用 */}
      {preview && pendingMode && (pendingMode === 'AppendNonConflict' || pendingMode === 'AppendAll') && (
        <ApplyGate
          run={() => {
            const mode = pendingMode
            const p = preview
            setPendingMode(null)
            if (mode && p) void applyPreview(p, mode)
          }}
        />
      )}
    </div>
  )
}

/** 追加模式直通组件 — 挂载即触发一次 apply (Kotlin LaunchedEffect 同构) */
function ApplyGate({ run }: { run: () => void }) {
  useState(() => {
    run()
    return true
  }) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function dayNames(days: Set<number>, lang: string): string {
  return [...days].sort((a, b) => a - b).map((d) => localizedDay(d, lang)).join(' / ')
}

function setEq(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ── 预览对话框 — ImportPreviewDialog.kt ─────────────────────────────────

function PreviewDialog({
  preview,
  hasTables,
  onDismiss,
  onApply,
}: {
  preview: ImportPreview
  hasTables: boolean
  onDismiss: () => void
  onApply: (mode: ApplyMode) => void
}) {
  const { t } = useTranslation()
  const p = preview.parseResult
  const conflictCount = preview.conflicts.length
  const cleanCount = p.courses.length - conflictCount

  const Metric = ({ label, value, bg, fg }: { label: string; value: string; bg: string; fg: string }) => (
    <div style={{ flex: 1, background: bg, color: fg, borderRadius: 12, padding: '12px 10px' }}>
      <div className="m3-label-small" style={{ opacity: 0.8 }}>{label}</div>
      <div className="m3-title-large" style={{ fontWeight: 700 }}>{value}</div>
    </div>
  )
  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</div>
      <div className="m3-body-medium">{value || '—'}</div>
    </div>
  )

  return (
    <Overlay onDismiss={onDismiss}>
      <h2 className="m3-title-large" style={{ margin: 0 }}>{t('import_preview_title')}</h2>
      <div className="m3-body-small" style={{ color: hasTables ? 'var(--md-on-surface-variant)' : 'var(--md-primary)' }}>
        {hasTables
          ? t('import_target_table', { v1: preview.targetTableName })
          : t('import_new_table_hint')}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Metric label={t('import_courses')} value={String(p.courses.length)} bg="var(--md-primary-container)" fg="var(--md-on-primary-container)" />
        {hasTables && (
          <>
            <Metric
              label={t('import_conflicts')} value={String(conflictCount)}
              bg={conflictCount > 0 ? 'var(--md-error-container)' : 'var(--md-secondary-container)'}
              fg={conflictCount > 0 ? 'var(--md-on-error-container)' : 'var(--md-on-secondary-container)'}
            />
            <Metric label={t('import_appendable')} value={String(cleanCount)} bg="var(--md-tertiary-container)" fg="var(--md-on-tertiary-container)" />
          </>
        )}
      </div>

      <div className="m3-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <InfoRow label={t('import_table_name')} value={p.tableName} />
        <InfoRow label={t('import_start_date')} value={p.startDate} />
        {hasTables && (
          <InfoRow
            label={t('import_suggestion')}
            value={conflictCount === 0 ? t('import_no_conflict') : t('import_conflict_count', { v1: conflictCount })}
          />
        )}
      </div>

      {preview.multiLocationWarnings.length > 0 && (
        <WarnBox bg="var(--md-secondary-container)" fg="var(--md-on-secondary-container)" title={t('import_multi_location_warning')} items={preview.multiLocationWarnings} />
      )}
      {preview.conflicts.length > 0 && (
        <WarnBox
          bg="var(--md-surface-container)"
          fg="var(--md-on-surface-variant)"
          title={t('import_conflicts')}
          items={preview.conflicts.slice(0, 3).map(
            (c) => `• ${c.incoming.courseName} ↔ ${c.existing.courseName}（周${c.incoming.day} 第${c.incoming.startNode}-${c.incoming.startNode + c.incoming.step - 1}节）`,
          )}
          more={preview.conflicts.length - 3}
        />
      )}
      {p.droppedLines.length > 0 && (
        <WarnBox
          bg="var(--md-error-container)" fg="var(--md-on-error-container)"
          title={t('import_dropped_title', { v1: p.droppedLines.length })}
          items={p.droppedLines.slice(0, 3).map((l) => `• ${l}`)}
          hint={t('import_dropped_hint')}
          more={p.droppedLines.length - 3}
          mono
        />
      )}
      {p.warnings.length > 0 && (
        <WarnBox bg="var(--md-secondary-container)" fg="var(--md-on-secondary-container)" title={t('import_warnings_title')} items={p.warnings.slice(0, 4).map((w) => `• ${w}`)} more={p.warnings.length - 4} />
      )}

      {/* 按钮组 — 无表只允许 ImportAsNew; 有表 4+1 全量 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {!hasTables ? (
          <PrimaryBtn label={t('import_as_new')} onClick={() => onApply('ImportAsNew')} />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <PrimaryBtn label={t('import_append_only')} onClick={() => onApply('AppendNonConflict')} grow />
              <PrimaryBtn label={t('import_as_new')} onClick={() => onApply('ImportAsNew')} grow />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <DangerBtn label={t('import_append_conflict')} onClick={() => onApply('AppendAll')} grow />
              <PrimaryBtn label={t('import_append_as_new')} onClick={() => onApply('AppendAsNew')} grow />
            </div>
            <DangerBtn label={t('import_overwrite')} onClick={() => onApply('ReplaceCurrent')} />
          </>
        )}
        <GhostBtn label={t('cancel')} onClick={onDismiss} />
      </div>
    </Overlay>
  )
}

// ── 确认对话框 — ImportConfirmDialog.kt (节次时间编辑简版) ────────────────

function ConfirmDialog({
  startDate,
  tableName,
  timeJson,
  showTableName,
  onTableNameChange,
  onStartDateChange,
  onTimeJsonChange,
  onDismiss,
  onConfirm,
}: {
  startDate: string
  tableName: string
  timeJson: string
  showTableName: boolean
  onTableNameChange: (v: string) => void
  onStartDateChange: (v: string) => void
  onTimeJsonChange: (v: string) => void
  onDismiss: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(() => parseTimeSlotRows(timeJson))
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function updateRows(next: typeof rows) {
    setRows(next)
    onTimeJsonChange(buildTimeJsonFromRows(next))
  }

  return (
    <Overlay onDismiss={onDismiss}>
      <h2 className="m3-title-large" style={{ margin: 0 }}>{t('import_confirm_title')}</h2>
      <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
        {t('import_confirm_body')}
      </p>
      {showTableName && (
        <Field label={t('import_table_name')} value={tableName} onChange={onTableNameChange} />
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('import_week_start')}
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          style={fieldStyle}
        />
      </label>
      {errorMsg && (
        <div role="alert" className="m3-body-small" style={{ color: 'var(--md-error)' }}>{errorMsg}</div>
      )}
      <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={r.node} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="m3-label-medium" style={{ width: 40, color: 'var(--md-on-surface-variant)' }}>
              {r.node}
            </span>
            <input
              type="time"
              value={r.start}
              aria-label={`${t('edit_table_time_slots')} ${r.node} start`}
              onChange={(e) => {
                const next = [...rows]
                next[i] = { ...r, start: e.target.value }
                updateRows(next)
              }}
              style={{ ...fieldStyle, flex: 1 }}
            />
            <span style={{ color: 'var(--md-on-surface-variant)' }}>–</span>
            <input
              type="time"
              value={r.end}
              aria-label={`${t('edit_table_time_slots')} ${r.node} end`}
              onChange={(e) => {
                const next = [...rows]
                next[i] = { ...r, end: e.target.value }
                updateRows(next)
              }}
              style={{ ...fieldStyle, flex: 1 }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <GhostBtn label={t('back')} onClick={onDismiss} />
        <button
          onClick={() => {
            if (startDate === '') {
              setErrorMsg(t('import_start_date_required'))
              return
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
              setErrorMsg(t('start_date_format'))
              return
            }
            const empty = rows.find((r) => r.start === '' || r.end === '')
            if (empty) {
              setErrorMsg(t('slot_time_required', { v1: empty.node }))
              return
            }
            const invalid = rows.find(
              (r) => !/^\d{2}:\d{2}$/.test(r.start) || !/^\d{2}:\d{2}$/.test(r.end) || r.start >= r.end,
            )
            if (invalid) {
              setErrorMsg(t('slot_time_invalid', { v1: invalid.node }))
              return
            }
            setErrorMsg(null)
            onTimeJsonChange(buildTimeJsonFromRows(rows))
            onConfirm()
          }}
          style={{
            padding: '8px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600, fontSize: 14,
          }}
        >
          {t('import_confirm')}
        </button>
      </div>
    </Overlay>
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle} />
    </label>
  )
}

function Overlay({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto',
          display: 'flex', flexDirection: 'column', gap: 12, padding: 20,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function WarnBox({
  title, items, hint, more, bg, fg, mono,
}: {
  title: string
  items: string[]
  hint?: string
  more?: number
  bg: string
  fg: string
  mono?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div style={{ background: bg, color: fg, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="m3-title-small" style={{ fontWeight: 600 }}>{title}</div>
      {hint && <div className="m3-body-small">{hint}</div>}
      {items.map((line) => (
        <div key={line} className="m3-body-small" style={mono ? { fontFamily: 'monospace' } : undefined}>
          {line}
        </div>
      ))}
      {more !== undefined && more > 0 && (
        <div className="m3-label-small">{t('more_unexpanded', { v1: more })}</div>
      )}
    </div>
  )
}

function PrimaryBtn({ label, onClick, grow }: { label: string; onClick: () => void; grow?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: grow ? 1 : undefined, padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: 'var(--md-primary)', color: 'var(--md-on-primary)', fontWeight: 600, fontSize: 13,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  )
}

function DangerBtn({ label, onClick, grow }: { label: string; onClick: () => void; grow?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: grow ? 1 : undefined, padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: 'var(--md-error-container)', color: 'var(--md-on-error-container)', fontWeight: 600, fontSize: 13,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  )
}

function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 12, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: 'transparent', color: 'var(--md-on-surface-variant)', fontSize: 13,
      }}
    >
      {label}
    </button>
  )
}

/** ImportMethodRow — ImportSheet.kt:473-521 1:1:
 *  40dp primary-container 圆角方块 (20dp on-primary-container 图标) + bodyLarge Medium 标签
 *  padding-start 14 + 可选 trailing 图标 (on-surface-variant)。整行可点, vertical 14 / horizontal 4。 */
function ImportMethodRow({
  icon: Icon,
  label,
  trailing: Trailing,
  onClick,
}: {
  icon: IconComponent
  label: string
  trailing?: IconComponent
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', width: '100%',
        padding: '14px 4px', border: 'none', cursor: 'pointer', textAlign: 'left',
        background: 'transparent', borderRadius: 12,
      }}
    >
      <span
        style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'var(--md-primary-container)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon size={20} color="var(--md-on-primary-container)" />
      </span>
      <span
        className="m3-body-large"
        style={{ flex: 1, marginLeft: 14, fontWeight: 500, color: 'var(--md-on-surface)' }}
      >
        {label}
      </span>
      {Trailing && (
        <span style={{ display: 'inline-flex', color: 'var(--md-on-surface-variant)' }}>
          <Trailing size={24} />
        </span>
      )}
    </button>
  )
}
