import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { act,cleanup,renderHook } from '@testing-library/react'
import type { Course,Table } from '../../data/types'
const mocks=vi.hoisted(()=>({getCourses:vi.fn(),saveOccurrence:vi.fn(),ask:vi.fn(),transfers:vi.fn()}))
vi.mock('../../data/repository',()=>({getCourses:mocks.getCourses,saveOccurrence:mocks.saveOccurrence}))
vi.mock('../../state/holidayStore',()=>({getHolidayTransfers:mocks.transfers}))
vi.mock('./useOccurrenceDialogs',()=>({useOccurrenceDialogs:()=>({ask:mocks.ask,host:null})}))
import {useOccurrenceActions} from './useOccurrenceActions'
const timeJson=JSON.stringify([{node:1,start:'08:00',end:'08:45'},{node:2,start:'08:55',end:'09:40'},{node:3,start:'09:50',end:'10:35'}])
const table={id:1,startDate:'2026-09-07',maxWeek:20,timeJson} as Table
const course={id:7,tableId:1,groupId:'math',courseName:'数学',room:' A ',day:1,startNode:1,step:2,startWeek:1,endWeek:20,type:0,ownTime:false,isIrregularTime:false,isIrregularNode:false,startTime:'',endTime:''} as Course
beforeEach(()=>{vi.clearAllMocks();mocks.getCourses.mockResolvedValue([course]);mocks.transfers.mockReturnValue([]);mocks.ask.mockResolvedValue(0);mocks.saveOccurrence.mockResolvedValue(true)})
afterEach(cleanup)
describe('single occurrence immutable UI pipeline',()=>{
 it('drops in place without a prompt, save or undo-producing repository call',async()=>{
  const {result}=renderHook(()=>useOccurrenceActions(table))
  let saved=false
  await act(async()=>{saved=await result.current.move(course,2,{week:2,day:1,startNode:1,step:2})})
  expect(saved).toBe(true);expect(mocks.ask).not.toHaveBeenCalled();expect(mocks.saveOccurrence).not.toHaveBeenCalled()
 })
 it('keeps reverse-transfer provenance when only the occurrence span changes',async()=>{
  const transfers=[{sourceDate:'2026-09-07',targetDate:'2026-09-19',segmentId:'x'}]
  mocks.transfers.mockReturnValue(transfers)
  const {result}=renderHook(()=>useOccurrenceActions(table))
  await act(async()=>{await result.current.move({...course,day:6},2,{week:2,day:6,startNode:1,step:3},true)})
  expect(mocks.saveOccurrence).toHaveBeenCalledWith({course,sourceDate:'2026-09-07',displayDate:'2026-09-19'},expect.objectContaining({room:' A ',startWeek:1,endWeek:1,day:1,step:3}),[course],table,transfers)
 })
 it('cancellation and invalid targets never write; deletion passes the captured snapshot',async()=>{
  const {result}=renderHook(()=>useOccurrenceActions(table))
  mocks.ask.mockResolvedValueOnce(null)
  await act(async()=>{await result.current.move(course,1,{week:1,day:2,startNode:1,step:2});await result.current.move(course,1,{week:1,day:1,startNode:0,step:1})})
  expect(mocks.saveOccurrence).not.toHaveBeenCalled()
  await act(async()=>{await result.current.remove(course,1)})
  expect(mocks.saveOccurrence).toHaveBeenCalledWith({course,sourceDate:'2026-09-07',displayDate:'2026-09-07'},null,[course],table,[])
 })
})
