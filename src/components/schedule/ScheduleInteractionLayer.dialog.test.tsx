import {useRef} from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {ScheduleInteractionLayer} from './ScheduleInteractionLayer'
import type {Table} from '../../data/types'
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
describe('floating-course click guard',()=>{
 it('allows an immediate dialog answer while suppressing the original grid click',()=>{
  vi.useFakeTimers();vi.stubGlobal('PointerEvent',MouseEvent)
  const answer=vi.fn(),gridClick=vi.fn()
  function Harness(){const root=useRef<HTMLDivElement>(null);return <div ref={root}>
   <div onClick={gridClick} data-testid="grid" data-grid-week="1" data-grid-days="[1]" data-grid-rows='[{"node":1,"y":0,"height":50}]' data-grid-time="0" data-grid-gap="0" data-grid-col="100"/>
   <div role="dialog"><button onClick={answer}>返回修改</button></div>
   <ScheduleInteractionLayer rootRef={root} table={{id:1,startDate:'2026-09-07'} as Table} courses={[]} week={1} readOnly={false} onWeek={()=>{}} onMove={async()=>true} onDelete={async()=>true} onEdit={()=>{}} onQuickAdd={()=>{}}/>
  </div>}
  render(<Harness/>)
  const grid=screen.getByTestId('grid')
  vi.spyOn(grid,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:100,bottom:100,width:100,height:100} as DOMRect)
  fireEvent.pointerDown(grid,{button:0,clientX:30,clientY:20})
  act(()=>vi.advanceTimersByTime(401))
  fireEvent.pointerUp(grid,{clientX:30,clientY:20})
  fireEvent.click(grid);expect(gridClick).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'返回修改'}));expect(answer).toHaveBeenCalledTimes(1)
 })
})
