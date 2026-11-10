import './interaction.css'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Course, Table } from '../../data/types'
import { dateOfWeekIso } from '../../domain/courseOccurrence'
import { haptic } from '../glass/physics'
import type { OccurrenceTarget, QuickAddSeed } from './interactionTypes'
import { CourseOverlayCard } from './CardsGridView'
import { usePrefsStore } from '../../state/prefsStore'

interface FloatState {
  course: Course | null; sourceWeek: number; target: OccurrenceTarget; x: number; y: number; width: number; height: number
  original: { x: number; y: number; width: number; height: number }; background?: string; color?: string; valid: boolean; dragging: boolean; resized: boolean; busy: boolean
}
interface GridHit { target: OccurrenceTarget; box: { x: number; y: number; width: number; height: number } }

export function hitGrid(root: HTMLElement, week: number, x: number, y: number, step = 1): GridHit | null {
  const grid = root.querySelector<HTMLElement>(`[data-grid-week="${week}"]`)
  if (!grid) return null
  const r = grid.getBoundingClientRect()
  const days = JSON.parse(grid.dataset.gridDays ?? '[]') as number[]
  const rows = JSON.parse(grid.dataset.gridRows ?? '[]') as { node: number; y: number; height: number }[]
  const timeW = Number(grid.dataset.gridTime), gap = Number(grid.dataset.gridGap), colW = Number(grid.dataset.gridCol)
  if (!Number.isInteger(step) || step<1 || step>rows.length || !rows.length || !days.length || x < r.left + timeW || x > r.right + 32 || y < r.top - 24 || y > r.bottom + 24) return null
  const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor((x - r.left - timeW - gap) / (colW + gap))))
  const allowed = rows.filter((row) => row.node >= 1 && Array.from({ length: step }, (_,i) => row.node+i).every((node) => rows.some((candidate) => candidate.node===node)))
  if (!allowed.length) return null
  const row = [...allowed].sort((a,b) => Math.abs(r.top+a.y-y) - Math.abs(r.top+b.y-y))[0]
  const last = rows.find((candidate) => candidate.node===row.node+step-1)!
  return { target:{ week, day:days[dayIndex], startNode:row.node, step }, box:{ x:r.left+timeW+gap+dayIndex*(colW+gap), y:r.top+row.y, width:colW, height:last.y+last.height-row.y } }
}

export function boxForTarget(root: HTMLElement, target: OccurrenceTarget): GridHit | null {
  const grid = root.querySelector<HTMLElement>(`[data-grid-week="${target.week}"]`)
  if (!grid) return null
  const rect = grid.getBoundingClientRect()
  const rows = JSON.parse(grid.dataset.gridRows ?? '[]') as {node:number;y:number;height:number}[]
  const days = JSON.parse(grid.dataset.gridDays ?? '[]') as number[]
  const first = rows.find(row=>row.node===target.startNode), last = rows.find(row=>row.node===target.startNode+target.step-1)
  const dayIndex=days.indexOf(target.day)
  if (!first || !last || dayIndex<0 || !Number.isInteger(target.step) || target.step<1 || target.step>rows.length || Array.from({length:target.step},(_,i)=>target.startNode+i).some(node=>!rows.some(row=>row.node===node))) return null
  const gap=Number(grid.dataset.gridGap),width=Number(grid.dataset.gridCol)
  return {target,box:{x:rect.left+Number(grid.dataset.gridTime)+gap+dayIndex*(width+gap),y:rect.top+first.y,width,height:last.y+last.height-first.y}}
}

export function ScheduleInteractionLayer({ rootRef, table, courses, week, readOnly, onWeek, onMove, onDelete, onEdit, onQuickAdd }: {
  rootRef: RefObject<HTMLDivElement>; table: Table | undefined; courses: Course[]; week: number; readOnly: boolean
  onWeek: (week:number) => void; onMove: (course:Course, sourceWeek:number, target:OccurrenceTarget, resize:boolean) => Promise<boolean>
  onDelete: (course:Course, week:number) => Promise<boolean>; onEdit: (course:Course, week:number, startInEdit?:boolean) => void; onQuickAdd: (seed:QuickAddSeed) => void
}) {
  const prefs = usePrefsStore(s=>s.prefs)
  const [floating, setFloating] = useState<FloatState | null>(null)
  const state = useRef<FloatState | null>(null)
  const latest = useRef({ table, courses, week, onWeek, onMove, onDelete, onEdit, onQuickAdd })
  latest.current = { table, courses, week, onWeek, onMove, onDelete, onEdit, onQuickAdd }
  const set = (next: FloatState | null) => { state.current=next; setFloating(next) }
  const ignoreClicks = useRef(0)
  const drag = useRef<{ pointer:number; x:number; y:number; offsetX:number; offsetY:number; active:boolean; resize:'start'|'end'|null; seed:FloatState|null } | null>(null)
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointer = useRef({ x:0, y:0 })
  const edgeDirection = useRef(0)
  const endEdge = () => { if (edgeTimer.current) clearTimeout(edgeTimer.current); edgeTimer.current=null; edgeDirection.current=0 }
  const commit = async (resize: boolean) => {
    const current = state.current
    if (!current || current.busy) return
    if (!current.course) { set(null); return }
    endEdge()
    if (!current.valid) { latest.current.onWeek(current.sourceWeek); set({...current,...current.original,valid:true,dragging:false,target:{week:current.sourceWeek,day:current.course.day,startNode:current.course.startNode,step:current.course.step}}); return }
    set({ ...current,busy:true,dragging:false })
    const saved = await latest.current.onMove(current.course,current.sourceWeek,current.target,resize)
    if (saved) set(null)
    else { latest.current.onWeek(current.sourceWeek); set({ ...current, ...current.original, dragging:false,busy:false, target:{ week:current.sourceWeek,day:current.course.day,startNode:current.course.startNode,step:current.course.step },resized:false }) }
  }
  useEffect(() => {
    const root = rootRef.current
    if (!root || readOnly) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const cancelHold = () => { if (timer) clearTimeout(timer); timer=null }
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element) || e.target.closest('[data-float-ui],button,input,[role="dialog"]')) return
      if (!root.contains(e.target)) { if (state.current && !state.current.busy && !e.target.closest('[data-float-ui],[role="dialog"]')) { state.current.resized ? void commit(true) : set(null) }; return }
      const active = state.current
      if (active) {
        e.preventDefault(); e.stopPropagation(); ignoreClicks.current=performance.now()+500
        if (active.resized) void commit(true); else set(null)
        return
      }
      const card = e.target.closest<HTMLElement>('[data-course-id]')
      const grid = e.target.closest<HTMLElement>('[data-grid-week]')
      if (!card && !grid) return
      const current = latest.current
      const original = card && current.courses.find((course) => course.id===Number(card.dataset.courseId))
      const projected = original ? { ...original, day:Number(card!.dataset.courseDay || original.day), startNode:Number(card!.dataset.courseNode || original.startNode), step:Number(card!.dataset.courseStep || original.step) } : null
      const sourceWeek = Number(card?.closest<HTMLElement>('[data-schedule-week]')?.dataset.scheduleWeek ?? grid?.dataset.gridWeek ?? current.week)
      if (sourceWeek!==current.week) return
      const r = card?.getBoundingClientRect()
      const point = hitGrid(root,sourceWeek,e.clientX,e.clientY, projected?.step ?? 1)
      const box = r ? { x:r.left,y:r.top,width:r.width,height:r.height } : point?.box
      if (!box) return
      const target = projected ? { week:sourceWeek,day:projected.day,startNode:projected.startNode,step:projected.step } : point!.target
      const paint=card ? getComputedStyle(card) : null
      const seed: FloatState = { course:projected,sourceWeek,target,...box,original:box,valid:true,background:paint?.backgroundColor,color:paint?.color,dragging:false,resized:false,busy:false }
      drag.current={ pointer:e.pointerId,x:e.clientX,y:e.clientY,offsetX:e.clientX-box.x,offsetY:e.clientY-box.y,active:false,resize:null,seed }
      lastPointer.current={x:e.clientX,y:e.clientY}
      timer=setTimeout(() => { if (!drag.current) return; ignoreClicks.current=performance.now()+700; haptic(); if(card && !grid) { latest.current.onEdit(projected!,sourceWeek); drag.current=null;return }; drag.current.active=true; root.setPointerCapture?.(e.pointerId); set(seed) },400)
    }
    const move = (e: PointerEvent) => {
      const pointer=drag.current
      if (!pointer || pointer.pointer!==e.pointerId) return
      lastPointer.current={ x:e.clientX,y:e.clientY }
      if (!pointer.active) { if (Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>8) { cancelHold(); drag.current=null }; return }
      e.preventDefault(); e.stopPropagation()
      const current=state.current
      if (!current || current.busy) return
      if (pointer.resize) {
        const grid=hitGrid(root,latest.current.week,e.clientX,e.clientY,1)
        if (!grid) return
        const node=grid.target.startNode, start=pointer.resize==='start' ? Math.min(node,current.target.startNode+current.target.step-1) : current.target.startNode
        const end=pointer.resize==='end' ? Math.max(node,start) : current.target.startNode+current.target.step-1
        const target={...current.target,startNode:start,step:end-start+1}
        const at=boxForTarget(root,target)
        if (at) set({ ...current,...at.box,target,resized:true,valid:true })
        return
      }
      if (!current.course) return
      const moved=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>16
      if (!current.dragging && !moved) return
      const hit=hitGrid(root,latest.current.week,e.clientX-pointer.offsetX+current.width/2,e.clientY-pointer.offsetY,current.target.step)
      set({ ...current,dragging:true,x:e.clientX-pointer.offsetX,y:e.clientY-pointer.offsetY,target:hit?.target ?? current.target,valid:!!hit })
      const bounds=root.getBoundingClientRect(),direction=e.clientX<bounds.left+32 ? -1 : e.clientX>bounds.right-32 ? 1 : 0
      if (!direction || direction!==edgeDirection.current) endEdge()
      if (direction && !edgeTimer.current && latest.current.table) {
        edgeDirection.current=direction
        const turn=()=>{
          edgeTimer.current=null
          const current=state.current
          if (!current?.dragging || !drag.current?.active || edgeDirection.current!==direction) return
          const next=Math.max(1,Math.min(latest.current.table!.maxWeek,latest.current.week+direction))
          if (next!==latest.current.week) {
            latest.current.onWeek(next); set({...current,target:{...current.target,week:next}});haptic()
            edgeTimer.current=setTimeout(turn,600)
          }
        }
        edgeTimer.current=setTimeout(turn,600)
      }
      if (!scrollFrame) scrollFrame=requestAnimationFrame(scrollTick)
    }
    const up = (e: PointerEvent) => {
      if (drag.current?.pointer!==e.pointerId) return
      cancelHold(); endEdge();cancelAnimationFrame(scrollFrame);scrollFrame=0
      const active=drag.current.active
      drag.current=null
      if (!active) return
      e.preventDefault(); e.stopPropagation(); ignoreClicks.current=performance.now()+500
      if (state.current?.dragging) void commit(false)
    }
    const cancel = (e:PointerEvent) => { if (drag.current?.pointer===e.pointerId) { cancelHold(); endEdge();cancelAnimationFrame(scrollFrame);scrollFrame=0; drag.current=null; if (state.current?.dragging) set(null) } }
    const click = (e:MouseEvent) => { if (!(e.target instanceof Element && e.target.closest('[data-float-ui],[role="dialog"]')) && performance.now()<ignoreClicks.current) { e.preventDefault(); e.stopPropagation() } }
    document.addEventListener('pointerdown',down,true)
    const touch=(event:TouchEvent)=>{if(drag.current?.active && event.cancelable) event.preventDefault()}
    document.addEventListener('touchmove',touch,{passive:false,capture:true})
    let scrollFrame=0
    const scrollTick=()=>{
      scrollFrame=0
      if (state.current?.dragging && drag.current?.active) {
        const scroller=root.querySelector<HTMLElement>('[data-schedule-scroll]')
        if (scroller) {const rect=scroller.getBoundingClientRect(),y=lastPointer.current.y;const dy=y>rect.bottom-50 ? 8 : y<rect.top+50 ? -8 : 0;if(dy) {scroller.scrollTop+=dy; const active=state.current;const hit=hitGrid(root,latest.current.week,active.x+active.width/2,active.y,active.target.step);set({...active,target:hit?.target ?? active.target,valid:!!hit})}}
        scrollFrame=requestAnimationFrame(scrollTick)
      }
    }
    root.addEventListener('click',click,true)
    document.addEventListener('pointermove',move,{ capture:true,passive:false })
    document.addEventListener('pointerup',up,true)
    document.addEventListener('pointercancel',cancel,true)
    const key=(e:KeyboardEvent) => { if (e.key==='Escape' && state.current) { e.preventDefault(); state.current.resized ? void commit(true) : set(null) } }
    document.addEventListener('keydown',key)
    return () => { cancelHold(); endEdge(); document.removeEventListener('pointerdown',down,true); document.removeEventListener('touchmove',touch,true);cancelAnimationFrame(scrollFrame); root.removeEventListener('click',click,true); document.removeEventListener('pointermove',move,true); document.removeEventListener('pointerup',up,true); document.removeEventListener('pointercancel',cancel,true); document.removeEventListener('keydown',key) }
  },[rootRef,readOnly])
  useEffect(() => {
    const root=rootRef.current
    root?.classList.toggle('has-course-float',!!floating && !floating.dragging)
    root?.querySelectorAll('[data-float-origin]').forEach(el=>el.removeAttribute('data-float-origin'))
    if(floating?.course)root?.querySelector(`[data-grid-week="${floating.sourceWeek}"] [data-course-id="${floating.course.id}"]`)?.setAttribute('data-float-origin','true')
    if (root) root.dataset.floatingCourse=String(floating?.course?.id ?? '')
    return () => { root?.classList.remove('has-course-float'); root?.querySelectorAll('[data-float-origin]').forEach(el=>el.removeAttribute('data-float-origin')); if (root) delete root.dataset.floatingCourse }
  },[floating,rootRef])
  if (!floating || !table) return null
  const startDrag=(e:React.PointerEvent,resize:'start'|'end'|null=null) => {
    if (floating.busy || e.button!==0) return
    e.preventDefault(); e.stopPropagation()
    lastPointer.current={x:e.clientX,y:e.clientY}
    drag.current={ pointer:e.pointerId,x:e.clientX,y:e.clientY,offsetX:e.clientX-floating.x,offsetY:e.clientY-floating.y,active:true,resize,seed:floating }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const projected=floating.valid ? boxForTarget(rootRef.current!,floating.target) : null
  return <>
    {floating.dragging && projected && <div data-float-ui className="course-drop-preview" style={{ left:projected.box.x,top:projected.box.y,width:projected.box.width,height:projected.box.height }} />}
    <div data-float-ui data-testid={floating.course ? 'floating-course' : 'quick-add-capsule'} className={`floating-course ${floating.dragging ? 'is-dragging' : ''}`} style={{ left:floating.x,top:floating.y,width:floating.width,height:floating.height,background:floating.course?undefined:floating.background,color:floating.color }} onPointerDown={startDrag}>
      <button className="float-resize top" aria-label="调整开始节次" onPointerDown={(e) => startDrag(e,'start')} data-glass-plain><span /></button>
      {floating.course ? <CourseOverlayCard course={floating.course} groupRows={courses.filter(course=>course.groupId===floating.course!.groupId)} isGrey={false} scale={prefs.gridScale} cornerRatio={prefs.gridCornerRatio} x={0} y={0} w={floating.width} h={floating.height} /> : <button className="quick-add-confirm" onPointerDown={event=>event.stopPropagation()} aria-label="添加选中时段课程" onClick={() => { latest.current.onQuickAdd({ ...floating.target,tableId:table.id,date:dateOfWeekIso(table.startDate,floating.target.week,floating.target.day) }); set(null) }}>+</button>}
      <button className="float-resize bottom" aria-label="调整结束节次" onPointerDown={(e) => startDrag(e,'end')} data-glass-plain><span /></button>
    </div>
    {!floating.dragging && <div className="float-actions" data-float-ui style={{ top:Math.max(8,Math.min(window.innerHeight-64,floating.y-60)),left:Math.max(8,Math.min(window.innerWidth-208,floating.x+floating.width/2-104)) }}>
      {floating.course ? <><button disabled={floating.busy} onClick={() => { latest.current.onEdit(floating.course!,floating.sourceWeek,true); set(null) }}>调整本次</button><button disabled={floating.busy} onClick={async () => { if (await latest.current.onDelete(floating.course!,floating.sourceWeek)) set(null) }}>删除本次</button></> : <button onClick={() => set(null)}>取消添加</button>}
    </div>}
    {floating.dragging && <div data-float-ui className="float-week-hint">第 {floating.target.week} 周，拖到左右边缘可跨周</div>}
  </>
}
