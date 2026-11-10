import './occurrence.css'
import { useEffect, useRef, useState } from 'react'
import type { Course, Table } from '../../data/types'
import { normalizeNode } from '../../data/types'
import { getCourses } from '../../data/repository'
import { getHolidayTransfers } from '../../state/holidayStore'
import { dateOfWeekIso, occurrenceAtDate, resolveOccurrence, withoutOccurrence, type CourseOccurrence } from '../../domain/courseOccurrence'
import type { HolidayTransferEntry } from '../../domain/holiday/transfers'
import { occurrenceConflictDetails, resolveDraftDestinations } from '../../domain/occurrenceSave'
import { prepareOccurrenceDraft, validateOccurrenceNodes } from '../../domain/occurrenceDraft'
import { parseTimeSlotRows } from '../../domain/timeTable'
import { AlertDialog } from '../AlertDialog'
import { DialogActionButtons } from '../DialogActionButtons'
import { IntRangeSlider } from '../IntRangeSlider'
import { Switch } from '../../views/mine/shared'
import { installBackHandler, useBackStack } from '../../state/backStack'
import { useOccurrenceDialogs } from './useOccurrenceDialogs'

import type { OccurrenceTarget } from './interactionTypes'
export type { OccurrenceTarget,QuickAddSeed } from './interactionTypes'

export function useOccurrenceActions(table: Table | undefined) {
  const { ask,host }=useOccurrenceDialogs()
  const [editing, setEditing] = useState<{ occurrence: CourseOccurrence; snapshot: Course[]; transfers: HolidayTransferEntry[]; table: Table } | null>(null)
  const [error, setError] = useState('')
  useEffect(()=>installBackHandler(key=>{if(key==='courseDetail')setEditing(null)}),[])
  const closeEditor=()=>{setEditing(null);useBackStack.getState().pop()}
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const snapshotFor = async (projected: Course, sourceWeek: number) => {
    if (!table) throw new Error('课表已变化')
    const snapshot = await getCourses(table.id)
    const transfers = getHolidayTransfers(table.id)
    const original = snapshot.find((course) => course.id === projected.id)
    if (!original) throw new Error('课程已被修改，请重新打开')
    const occurrence = resolveOccurrence(original, dateOfWeekIso(table.startDate, sourceWeek, projected.day), transfers)
    if (!occurrence) throw new Error('该日期没有这次课程')
    return { occurrence, snapshot, transfers, table: { ...table } }
  }
  const destinations = async (draft: Course, date: string, savedTable: Table, transfers: HolidayTransferEntry[]) => {
    const rows=await resolveDraftDestinations([occurrenceAtDate(draft,date,savedTable)],savedTable,transfers,ask)
    return rows?.[0] ?? null
  }
  const conflicts = async (replacement: Course, context: NonNullable<typeof editing>) => {
    const { table: savedTable, transfers, occurrence, snapshot } = context
    const stored = [...snapshot.filter((course) => course.id !== occurrence.course.id), ...withoutOccurrence(occurrence.course, occurrence.sourceDate, savedTable.startDate)]
    const details=occurrenceConflictDetails([replacement],stored,savedTable,transfers,['周一','周二','周三','周四','周五','周六','周日'],'%1$s 第%2$s节，%3$s：%4$s')
    return details.length === 0 || await ask('发现课程冲突', [...new Set(details)].join('\n'), ['仍然保存'], true) !== null
  }
  const persist = async (context: NonNullable<typeof editing>, replacement: Course | null) => {
    const repository = await import('../../data/repository') as typeof import('../../data/repository') & {
      saveOccurrence: (occurrence: CourseOccurrence, replacement: Course | null, courses: Course[], table: Table, transfers: HolidayTransferEntry[]) => Promise<boolean>
    }
    if (typeof repository.saveOccurrence !== 'function') throw new Error('课程数据接口尚未就绪，请稍后重试')
    const ok = await repository.saveOccurrence(context.occurrence, replacement, context.snapshot, context.table, context.transfers)
    if (!ok) throw new Error('课表或调休已变化，请重新打开本次课程')
    return true
  }
  const move = async (projected: Course, sourceWeek: number, target: OccurrenceTarget, resizeOnly = false) => {
    try {
      const context = await snapshotFor(projected, sourceWeek)
      const normalized = normalizeNode(context.occurrence.course, context.table.timeJson)
      if (sourceWeek === target.week && projected.day === target.day && normalized.startNode === target.startNode && normalized.step === target.step) return true
      const rows = validateOccurrenceNodes(context.table.timeJson,target.startNode,target.step,true)
      const span = (w: number, d: number, n: number, s: number) => `第 ${w} 周，周${['一','二','三','四','五','六','日'][d - 1]}，第 ${n}–${n+s-1} 节`
      if (await ask(resizeOnly ? '调整持续节次' : '挪动本次课程', `${projected.courseName}\n${span(sourceWeek, projected.day, normalized.startNode, normalized.step)}\n改为 ${span(target.week, target.day, target.startNode, target.step)}`) === null) return false
      const targetDate = dateOfWeekIso(context.table.startDate, target.week, target.day)
      const custom = context.occurrence.course.ownTime || context.occurrence.course.isIrregularTime
      const draft = { ...context.occurrence.course, isIrregularNode: rows.some(row=>row.node===target.startNode && row.edgeClass!==null), startNode: target.startNode, step: target.step, ownTime: custom, isIrregularTime: custom,
        startTime: custom ? rows.find((row) => row.node === target.startNode)!.start : '', endTime: custom ? rows.find((row) => row.node === target.startNode + target.step - 1)!.end : '' }
      const replacement = targetDate === context.occurrence.displayDate
        ? occurrenceAtDate(draft, context.occurrence.sourceDate, context.table, !!(draft as Course & { fixedDate?: string }).fixedDate)
        : await destinations(draft, targetDate, context.table, context.transfers)
      return !!replacement && await conflicts(replacement, context) && await persist(context, replacement)
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败'); return false }
  }
  const remove = async (projected: Course, week: number) => {
    try {
      const context = await snapshotFor(projected, week)
      if (await ask('删除本次课程', `${projected.courseName}\n${context.occurrence.displayDate}，仅删除这一次。`, ['删除本次'], true) === null) return false
      return await persist(context, null)
    } catch (e) { setError(e instanceof Error ? e.message : '删除失败'); return false }
  }
  const openEdit = async (projected: Course, week: number, replaceDetail = false) => {
    try { const context=await snapshotFor(projected,week); const navigation=useBackStack.getState();const hash=location.hash.startsWith('#/%E4%BB%8A%E6%97%A5') || decodeURIComponent(location.hash).startsWith('#/今日') ? '#/今日/调整本次' : '#/课表/调整本次';replaceDetail ? navigation.replace('courseDetail',hash) : navigation.push('courseDetail',hash);setEditing(context) } catch (e) { setError(e instanceof Error ? e.message : '打开失败') }
  }
  return { move, remove, openEdit, overlays: <>
    {editing && <OccurrenceEditor occurrence={editing.occurrence} table={editing.table} onDismiss={closeEditor} onSave={async (draft, date) => {
      const fixed = !!(editing.occurrence.course as Course & { fixedDate?: string }).fixedDate
      const replacement = date === editing.occurrence.displayDate ? occurrenceAtDate(draft, editing.occurrence.sourceDate, editing.table, fixed) : await destinations(draft, date, editing.table, editing.transfers)
      if (replacement && await conflicts(replacement, editing) && await persist(editing, replacement)) closeEditor()
    }} onDelete={async () => { if (await ask('删除本次课程', `${editing.occurrence.course.courseName}\n${editing.occurrence.displayDate}，仅删除这一次。`, ['删除本次'], true) !== null && await persist(editing,null)) closeEditor() }} />}
    {host}
    {error && <AlertDialog title="课程未保存" onDismiss={() => setError('')}><p>{error}</p><DialogActionButtons confirmText="知道了" onConfirm={() => setError('')} /></AlertDialog>}
  </> }
}

export function OccurrenceEditor({ occurrence, table, onDismiss, onSave, onDelete }: { occurrence: CourseOccurrence; table: Table; onDismiss: () => void; onSave: (course: Course, date: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const dialog=useRef<HTMLElement>(null)
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>previous?.focus()},[])
  const [date, setDate] = useState(occurrence.displayDate)
  const [draft, setDraft] = useState(()=>({...occurrence.course,ownTime:occurrence.course.ownTime || occurrence.course.isIrregularTime}))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape' && !busy && dialog.current?.contains(document.activeElement)){event.stopPropagation();onDismiss()}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[busy,onDismiss])
  const rows = parseTimeSlotRows(table.timeJson)
  const max = Math.max(1, ...rows.filter((row) => row.edgeClass === null).map((row) => row.node))
  const standard = occurrence.course.startNode >= 1 && occurrence.course.startNode <= max && !occurrence.course.isIrregularNode
  const patch = (value: Partial<Course>) => { if (busy) return;setDraft((course) => ({ ...course, ...value })) }
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); try { await action() } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) } }
  return <div className="occurrence-scrim" onClick={() => { if (!busy) onDismiss() }}><section ref={dialog} tabIndex={-1} className="occurrence-editor" role="dialog" aria-modal="true" aria-label="调整本次课程" onClick={(e) => e.stopPropagation()}>
    <fieldset disabled={busy} className="occurrence-fields"><h2 className="m3-title-large">{draft.courseName}</h2><p>{occurrence.displayDate}，调整本次课程</p>
    <label className="occurrence-field">日期<input type="date" value={date} min={dateOfWeekIso(table.startDate,1,1)} max={dateOfWeekIso(table.startDate,table.maxWeek,7)} onChange={(e) => setDate(e.target.value)} /></label>
    {standard ? <IntRangeSlider label={`第 ${draft.startNode}–${draft.startNode+draft.step-1} 节`} max={max} start={draft.startNode} end={draft.startNode+draft.step-1} initialStart={occurrence.course.startNode} initialEnd={occurrence.course.startNode+occurrence.course.step-1} onChange={(s,e) => patch({ startNode:s, step:e-s+1 })} /> : <div className="occurrence-inline"><label className="occurrence-field">开始节次<input type="number" value={draft.startNode} onChange={(e) => patch({ startNode:Number(e.target.value) })} /></label><label className="occurrence-field">连续节数<input type="number" value={draft.step} onChange={(e) => patch({ step:Number(e.target.value) })} /></label></div>}
    <div className="occurrence-inline"><span>自定义时间</span><Switch checked={draft.ownTime} onChange={(value) => patch({ ownTime:value, isIrregularTime:value, startTime: draft.startTime || rows.find((row) => row.node === draft.startNode)?.start || '08:00', endTime:draft.endTime || rows.find((row) => row.node === draft.startNode+draft.step-1)?.end || '09:40' })} /></div>
    {draft.ownTime && <div className="occurrence-inline"><label className="occurrence-field">开始时间<input type="time" value={draft.startTime} onChange={(e) => patch({ startTime:e.target.value })} /></label><label className="occurrence-field">结束时间<input type="time" value={draft.endTime} onChange={(e) => patch({ endTime:e.target.value })} /></label></div>}
    <label className="occurrence-field">教室或地点<input value={draft.room} onChange={(e) => patch({ room:e.target.value })} /></label>
    </fieldset>{error && <p role="alert">{error}</p>}
    <button className="occurrence-primary" disabled={busy} onClick={() => void run(async () => {
      if (!date) throw new Error('请选择日期')
      await onSave(prepareOccurrenceDraft(occurrence.course,draft,table.timeJson),date)
    })}>{busy ? '正在保存' : '保存本次'}</button>
    <button className="occurrence-danger" disabled={busy} onClick={() => void run(onDelete)}>删除本次</button>
    <button className="occurrence-secondary" disabled={busy} onClick={onDismiss}>取消</button>
  </section></div>
}
