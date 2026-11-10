/** Portable import: new tables and explicit-target course append follow Android v1.0.64. */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { IconDescription, IconExpandLess, IconExpandMore, IconFileUpload, IconInfo, IconQrCode2 } from '../components/icons'
import { FormatDetailDialog } from '../components/FormatDetailDialog'
import { FORMAT_KEYS, IMPORT_FORMATS, type ImportFormat } from '../components/formatHelp'
import { db } from '../data/db'
import { getTable, getCourses } from '../data/repository'
import { parseSchedule, type ParseResult, type ParsedCourse } from '../domain/import/scheduleParser'
import { looksLikeWakeupShareCode, resolveWakeupShare } from '../domain/import/wakeupShare'
import { applyPortableImport, applyPeriodTableImport, effectiveImportTable } from '../domain/import/importApplication'
import { coursesConflict, firstMissingCourseNode, importCourseGroupKey, timeJsonForAppend } from '../domain/import/courseImportPolicy'
import { validFixedDate } from '../domain/import/sleepyNativeParser'
import { suggestUniqueName } from './mine/periodTableNames'
import { parseTimeSlotRows, buildTimeJsonFromRows, mergeMostComplete } from '../domain/timeTable'
import { inferSmartConfig, encodeSmartConfig } from '../domain/smartPeriod'
import { TimeSlotEditor } from './jw/TimeSlotEditor'
import type { Course, PeriodTable } from '../data/types'

type ApplyMode = 'ImportAsNew' | 'AppendNonConflict' | 'AppendAll'
type IconComponent = ComponentType<{ size?: number; color?: string }>
interface ImportPreview {
  targetTableId: number
  targetTableName: string
  parseResult: ParseResult
  existingCourses: Course[]
  conflicts: {incoming: ParsedCourse; existing: Course}[]
  multiLocationWarnings: string[]
}

export function ImportView({ onDone, onJwImport, targetTableId = 0, addingCourses = false }: {
  onDone: () => void
  onJwImport?: () => void
  targetTableId?: number
  addingCourses?: boolean
}) {
  const { t } = useTranslation()
  const tables = useLiveQuery(() => db.timetables.orderBy('id').toArray(), []) ?? []
  const periodTables = useLiveQuery(() => db.periodTables.toArray(), []) ?? []
  const periodTableNames = periodTables.map(p => p.name)
  const previewRef = useRef<ImportPreview | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const applying = useRef(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const [textExpanded, setTextExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const [detailFormat, setDetailFormat] = useState<ImportFormat | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [pendingMode, setPendingMode] = useState<ApplyMode | null>(null)
  const [selection, setSelection] = useState<ParseResult | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [confirmedTableName, setConfirmedTableName] = useState('')
  const [confirmedStartDate, setConfirmedStartDate] = useState('')
  const [confirmedTimeJson, setConfirmedTimeJson] = useState('')
  const [confirmedSmartJson, setConfirmedSmartJson] = useState('')
  const [binding, setBinding] = useState<number | null>(null)
  const [purePeriodName, setPurePeriodName] = useState<string | null>(null)

  async function stagePreview(result: ParseResult) {
    const id = addingCourses ? targetTableId : 0
    const target = id ? await getTable(id) : undefined
    if (addingCourses && !target) throw Error(t('manage_no_table'))
    const existingCourses = id ? await getCourses(id) : []
    const effective = target ? await effectiveImportTable(target) : undefined
    const timeJson = timeJsonForAppend(effective?.timeJson ?? '', result.timeJson, result.nodesPerDay, target?.periodTableId != null)
    const groups = new Map<string, ParsedCourse[]>()
    for (const c of result.courses) {
      const key = importCourseGroupKey(c)
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
    const p: ImportPreview = {
      targetTableId: id, targetTableName: target?.name ?? '', parseResult: result, existingCourses,
      conflicts: result.courses.flatMap(incoming => {
        const existing = existingCourses.find(c => coursesConflict(incoming, c, timeJson))
        return existing ? [{ incoming, existing }] : []
      }),
      multiLocationWarnings: [...groups.values()].flatMap(cs => {
        const rooms = new Set(cs.map(c => c.room.trim()).filter(Boolean))
        return rooms.size > 1 ? [t('import_multi_location_warning_detail', {v1: cs[0].courseName, v2: rooms.size})] : []
      }),
    }
    previewRef.current = p
    setPreview(p)
  }

  async function acceptResult(result: ParseResult) {
    if (addingCourses) {
      if (!result.courses.length) throw Error(t('import_content_empty'))
      setSelection(result)
    } else if (!result.courses.length && result.periodTable) {
      previewRef.current = {targetTableId:0,targetTableName:'',parseResult:result,existingCourses:[],conflicts:[],multiLocationWarnings:[]}
      setPurePeriodName(suggestUniqueName(result.periodTable.name, tables.map(t => t.name), periodTableNames, t('period_table_new')))
    } else await stagePreview(result)
  }

  async function buildPreview(text: string) {
    setErrorMsg(null)
    if (!text.trim()) { setErrorMsg(t('import_content_empty')); return }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    try {
      const payload = looksLikeWakeupShareCode(text) ? await resolveWakeupShare(text, globalThis.fetch, {signal:request.signal}) : text
      if (request.signal.aborted) return
      const result = parseSchedule(payload, addingCourses ? targetTableId : 0)
      if (!result.ok) throw result.error
      await acceptResult(result.value)
    } catch (error) {
      if (!request.signal.aborted) setErrorMsg(t('import_failed', {v1:error instanceof Error ? error.message : String(error)}))
    }
  }

  async function applyPreview(p: ImportPreview, mode: ApplyMode, backupOriginal = true) {
    if (applying.current) return
    applying.current = true
    setIsLoading(true)
    setErrorMsg(null)
    try {
      await applyPortableImport({result:p.parseResult,targetTableId:mode === 'ImportAsNew' ? 0 : p.targetTableId,
        name:confirmedTableName,startDate:confirmedStartDate,timeJson:confirmedTimeJson,
        smartConfigJson:confirmedSmartJson,bindPeriodTableId:binding,backupOriginal,appendConflicts:mode === 'AppendAll'})
      setPreview(null);setPendingMode(null)
      onDone()
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error))
    } finally { applying.current=false;setIsLoading(false) }
  }

  function handleFile(file: File) {
    if (isLoading) return
    setIsLoading(true)
    void file.text().then(buildPreview).catch(error => setErrorMsg(t('read_failed',{v1:String(error)}))).finally(() => setIsLoading(false))
  }

  const hasTables = addingCourses && tables.some(t => t.id === targetTableId)

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 className="m3-title-large" style={{ margin: 0 }}>{t('import_title')}</h1>
      <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
        {t('import_preview_sub')}
      </p>

      {addingCourses && <ImportMethodRow icon={IconDescription} label={t('add_course_from_existing', '从已有课表选择')} onClick={() => setShowSources(true)} disabled={isLoading} />}

      {/* 行 1：教务直连 — ImportSheet.kt:221-229 (关弹窗 → 拉起教务导入) */}
      <ImportMethodRow
        icon={IconQrCode2}
        label={t('import_jw')}
        onClick={() => onJwImport?.()} disabled={isLoading}
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
        onClick={() => fileInputRef.current?.click()} disabled={isLoading}
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

      {/* 备份导入入口在 我的→通用设置→数据迁移 (Android GeneralSettingsScreen 分组⑥ 1:1);
          ImportSheet.kt 无此行 → 本页不放 */}


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

      {errorMsg && !preview && purePeriodName === null && !showSources && (
        <div
          role="alert"
          className="m3-card"
          style={{ padding: 12, background: 'var(--md-error-container)', color: 'var(--md-on-error-container)' }}
        >
          {errorMsg}
        </div>
      )}
      {!hasTables && (
        <p className="m3-body-small" style={{ color: 'var(--md-primary)', margin: 0 }}>
          {t('import_new_table_hint')}
        </p>
      )}

      {/* v1.0.56 T9: 纯作息导入命名框 — ImportSheet.kt:419-490 1:1 */}
      {preview === null && purePeriodName !== null && (
        <PurePeriodDialog
          name={purePeriodName}
          existingNames={[
            ...tables.map((x) => x.name),
            ...periodTableNames,
          ]}
          onNameChange={setPurePeriodName}
          isApplying={isLoading} errorMessage={errorMsg}
          onDismiss={() => { if (!isLoading) setPurePeriodName(null) }}
          onConfirm={async (finalName) => {
            const period = previewRef.current?.parseResult.periodTable
            if (!period || applying.current) return
            applying.current = true;setIsLoading(true);setErrorMsg(null)
            try {
              await applyPeriodTableImport(period,finalName)
              setPurePeriodName(null);onDone()
            } catch(error) {setErrorMsg(error instanceof Error ? error.message : String(error))}
            finally {applying.current=false;setIsLoading(false)}
          }}
        />
      )}

      {showSources && <Overlay onDismiss={() => setShowSources(false)}>
        <h2>{t('add_course_from_existing', '从已有课表选择')}</h2>
        {errorMsg && <p role="alert">{errorMsg}</p>}
        {tables.filter(table => table.id !== targetTableId).map(table => <button type="button" key={table.id} disabled={isLoading} className="m3-btn-regular" onClick={() => {
          setIsLoading(true)
          void (async () => {
            const effective = await effectiveImportTable(table)
            const courses = await getCourses(table.id)
            if (!courses.length) throw Error(t('import_content_empty'))
            await acceptResult({tableName:effective.name,startDate:effective.startDate,courses,timeJson:effective.timeJson,
              nodesPerDay:effective.nodeCount,maxWeek:effective.maxWeek,groupIdsAuthoritative:true,periodTable:null,droppedLines:[],warnings:[]})
            setShowSources(false)
          })().catch(error => setErrorMsg(String(error))).finally(() => setIsLoading(false))
        }}>{table.name}</button>)}
        {tables.filter(table => table.id !== targetTableId).length === 0 && <p>{t('add_course_no_source','没有其他可用课表')}</p>}
        <GhostBtn label={t('cancel')} onClick={() => setShowSources(false)} />
      </Overlay>}
      {selection && <CourseSelectionDialog result={selection} onDismiss={() => setSelection(null)} onConfirm={courses => {
        const result = {...selection,courses}
        setSelection(null)
        void stagePreview(result).catch(error => setErrorMsg(String(error)))
      }} />}
      {preview && !pendingMode && <PreviewDialog preview={preview} hasTables={hasTables} isApplying={isLoading} errorMessage={errorMsg}
        onDismiss={() => { if (!isLoading) setPreview(null) }}
        onApply={(mode, backup) => {
          if (mode !== 'ImportAsNew') { void applyPreview(preview, mode, backup); return }
          setConfirmedStartDate(preview.parseResult.startDate || new Date().toISOString().slice(0,10))
          setConfirmedTableName(preview.parseResult.tableName || t('default_table_name'))
          setConfirmedTimeJson(mergeMostComplete('',preview.parseResult.timeJson,preview.parseResult.nodesPerDay))
          setConfirmedSmartJson('');setBinding(null);setPendingMode(mode)
        }} />}
      {preview && pendingMode === 'ImportAsNew' && <ConfirmDialog
        startDate={confirmedStartDate} tableName={confirmedTableName} timeJson={confirmedTimeJson}
        courses={preview.parseResult.courses} periodTables={periodTables} binding={binding} onBindingChange={setBinding}
        isApplying={isLoading} errorMessage={errorMsg} onSmartConfigChange={setConfirmedSmartJson}
        onTableNameChange={setConfirmedTableName} onStartDateChange={setConfirmedStartDate} onTimeJsonChange={setConfirmedTimeJson}
        onDismiss={() => { if (!isLoading) setPendingMode(null) }}
        onConfirm={() => { void applyPreview(preview,'ImportAsNew') }} />}

    </div>
  )
}

/** v1.0.56 T9 纯作息导入命名框 — ImportSheet.kt:419-490 1:1 (预填唯一名/撞名报错/色块按钮) */
function PurePeriodDialog({
  name, existingNames, onNameChange, onDismiss, onConfirm, isApplying, errorMessage,
}: {
  name: string
  existingNames: string[]
  isApplying: boolean
  errorMessage: string | null
  onNameChange: (v: string) => void
  onDismiss: () => void
  onConfirm: (finalName: string) => void
}) {
  const { t } = useTranslation()
  const candidate = name.trim()
  const nameTaken =
    candidate !== '' && existingNames.filter((n) => n === candidate).length > 0
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'color-mix(in srgb, var(--md-scrim) 40%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="m3-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}
      >
        <h2 className="m3-title-medium" style={{ margin: 0 }}>{t('period_table_import_title')}</h2>
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <p className="m3-body-medium" style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>
          {t('period_table_import_body')}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="m3-label-small" style={{ color: 'var(--md-on-surface-variant)' }}>
            {t('period_table_name_label')}
          </span>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
            style={{
              background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)',
              border: `1px solid ${nameTaken ? 'var(--md-error)' : 'var(--md-outline)'}`,
              borderRadius: 8, padding: '8px 10px', fontSize: 14,
            }}
          />
          {nameTaken && (
            <span className="m3-body-small" style={{ color: 'var(--md-error)' }}>
              {t('period_table_name_taken')}
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onDismiss} style={{
            padding: '8px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', fontSize: 13,
          }}>{t('cancel')}</button>
          <button
            disabled={isApplying || candidate === '' || nameTaken}
            onClick={() => onConfirm(candidate)}
            style={{
              padding: '8px 16px', borderRadius: 12, border: 'none',
              cursor: candidate === '' || nameTaken ? 'not-allowed' : 'pointer',
              background: candidate === '' || nameTaken ? 'var(--md-surface-container-high)' : 'var(--md-primary)',
              color: candidate === '' || nameTaken ? 'var(--md-on-surface-variant)' : 'var(--md-on-primary)',
              fontSize: 13, fontWeight: 600,
            }}
          >{t('period_table_import_confirm')}</button>
        </div>
      </div>
    </div>
  )
}

// ── 预览对话框 — ImportPreviewDialog.kt ─────────────────────────────────

function PreviewDialog({
  preview,
  hasTables,
  onDismiss,
  onApply,
  isApplying, errorMessage,
}: {
  errorMessage: string | null
  preview: ImportPreview
  hasTables: boolean
  onDismiss: () => void
  onApply: (mode: ApplyMode, backupOriginal?: boolean) => void
  isApplying: boolean
}) {
  const { t } = useTranslation()
  const p = preview.parseResult
  const [backupOriginal, setBackupOriginal] = useState(true)
  const [appendConflicts, setAppendConflicts] = useState(false)
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
      {errorMessage && <p role="alert" style={{color:'var(--md-error)'}}>{errorMessage}</p>}
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

      <div style={{position:'sticky',bottom:-20,background:'var(--md-surface-container)',padding:'12px 0',display:'flex',flexDirection:'column',gap:12}}>
        {hasTables && <>
          <label><input type="checkbox" checked={backupOriginal} disabled={isApplying} onChange={e => setBackupOriginal(e.target.checked)} />{t('import_backup_original','导入前备份原课表')}</label>
          <label><input type="checkbox" checked={appendConflicts} disabled={isApplying} onChange={e => setAppendConflicts(e.target.checked)} />{t('import_append_conflicts_option','同时追加冲突课程')}</label>
        </>}
        <button type="button" className="m3-btn-regular" disabled={isApplying} onClick={() => onApply(hasTables ? appendConflicts ? 'AppendAll' : 'AppendNonConflict' : 'ImportAsNew',backupOriginal)}>
          {hasTables ? t('import_confirm') : t('import_as_new')}
        </button>
        <GhostBtn label={t('cancel')} onClick={onDismiss} />
      </div>
    </Overlay>
  )
}

// ── 确认对话框 — ImportConfirmDialog.kt (节次时间编辑简版) ────────────────

function ConfirmDialog({startDate,tableName,timeJson,courses,periodTables,binding,onBindingChange,isApplying,errorMessage,onSmartConfigChange,
  onTableNameChange,onStartDateChange,onTimeJsonChange,onDismiss,onConfirm}: {
  startDate:string;tableName:string;timeJson:string;courses:ParsedCourse[];periodTables:PeriodTable[];binding:number|null
  onBindingChange:(id:number|null)=>void;isApplying:boolean;errorMessage:string|null;onSmartConfigChange:(json:string)=>void
  onTableNameChange:(name:string)=>void;onStartDateChange:(date:string)=>void;onTimeJsonChange:(json:string)=>void
  onDismiss:()=>void;onConfirm:()=>void
}) {
  const {t}=useTranslation()
  const [rows,setRows]=useState(() => parseTimeSlotRows(timeJson))
  const [smart,setSmart]=useState(() => inferSmartConfig(rows))
  const [error,setError]=useState<string|null>(null)
  const bound=periodTables.find(p => p.id === binding)
  function confirm() {
    if (isApplying) return
    if (!tableName.trim()) {setError(t('import_table_name','课表名称'));return}
    if (!validFixedDate(startDate)) {setError(t('start_date_format'));return}
    if (binding != null && !bound) {setError('所选作息表已不存在');return}
    const effective=bound ? parseTimeSlotRows(bound.timeJson) : rows
    const json=buildTimeJsonFromRows(effective)
    const missing=firstMissingCourseNode(courses,json)
    if (missing != null) {setError(t('slot_time_required',{v1:missing}));return}
    const invalid=effective.find(r => !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end) || r.start>=r.end)
    if (invalid) {setError(t('slot_time_invalid',{v1:invalid.node}));return}
    setError(null);onTimeJsonChange(json);onConfirm()
  }
  return <Overlay onDismiss={onDismiss}>
    <h2 className="m3-title-large" style={{margin:0}}>{t('import_confirm_title')}</h2>
    <p>{t('import_confirm_body')}</p>
    {errorMessage && <p role="alert" style={{color:'var(--md-error)'}}>{errorMessage}</p>}
    <Field label={t('import_table_name')} value={tableName} onChange={onTableNameChange} />
    <label>{t('import_week_start')}<input type="date" aria-label={t('import_week_start')} value={startDate} onChange={e => onStartDateChange(e.target.value)} style={fieldStyle} /></label>
    <label>{t('period_tables_title')}<select aria-label={t('period_tables_title')} value={binding ?? ''} onChange={e => onBindingChange(e.target.value ? Number(e.target.value) : null)} style={fieldStyle}>
      <option value="">{t('import_new_period_table','使用导入作息')}</option>
      {periodTables.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
    </select></label>
    {error && <p role="alert" style={{color:'var(--md-error)'}}>{error}</p>}
    {bound ? <p>{bound.name}，{bound.nodesPerDay} 节/天</p> : <TimeSlotEditor rows={rows} onRowsChange={next => {setRows(next);onTimeJsonChange(buildTimeJsonFromRows(next))}} smartConfig={smart} onSmartConfigChange={config => {setSmart(config);onSmartConfigChange(encodeSmartConfig(config))}} />}
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
      <GhostBtn label={t('back')} onClick={onDismiss} />
      <button type="button" className="m3-btn-regular" disabled={isApplying} onClick={confirm}>{t('import_confirm')}</button>
    </div>
  </Overlay>
}

function CourseSelectionDialog({result,onDismiss,onConfirm}:{result:ParseResult;onDismiss:()=>void;onConfirm:(courses:ParsedCourse[])=>void}) {
  const {t}=useTranslation()
  const groups=new Map<string,ParsedCourse[]>()
  for (const course of result.courses) {const key=importCourseGroupKey(course);groups.set(key,[...(groups.get(key) ?? []),course])}
  const [selected,setSelected]=useState(() => new Set(groups.keys()))
  return <Overlay onDismiss={onDismiss}>
    <h2>{t('import_select_courses','选择导入课程')}</h2>
    <button type="button" className="m3-btn-regular" onClick={() => setSelected(selected.size === groups.size ? new Set() : new Set(groups.keys()))}>{selected.size === groups.size ? t('deselect_all','取消全选') : t('select_all','全选')}</button>
    {[...groups].map(([key,cs]) => <label key={key} style={{display:'flex',gap:12,padding:12}}>
      <input type="checkbox" checked={selected.has(key)} onChange={e => setSelected(old => {const next=new Set(old);if(e.target.checked)next.add(key);else next.delete(key);return next})} />
      <span>{cs[0].courseName}（{cs.length}）</span>
    </label>)}
    {!selected.size && <p role="alert">{t('import_selection_empty','请至少选择一门课程')}</p>}
    <button type="button" className="m3-btn-regular" disabled={!selected.size} onClick={() => onConfirm(result.courses.filter(c => selected.has(importCourseGroupKey(c))))}>{t('confirm','确定')}</button>
    <GhostBtn label={t('cancel')} onClick={onDismiss} />
  </Overlay>
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
  disabled = false,
}: {
  icon: IconComponent
  label: string
  trailing?: IconComponent
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
