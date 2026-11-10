import 'fake-indexeddb/auto'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { initI18n } from '../i18n'
import { ExportView, ShareScheduleSheetView } from './ExportView'
import { parseSchedule } from '../domain/import/scheduleParser'
import type { Course, Table } from '../data/types'

beforeAll(()=>initI18n('zh-CN'))
afterEach(async()=>{cleanup();vi.restoreAllMocks();await db.delete();await db.open()})
const time=JSON.stringify([{node:1,start:'10:00',end:'10:45'}])
const source='{ "school": "Ａ校", "null": null }'
const table:Table & {importSourceJson:string}={id:1,name:'秋季',startDate:'2026-09-07',maxWeek:20,nodeCount:1,timeJson:'[]',smartConfigJson:'',periodTableId:3,isDefault:1,createdAt:0,importSourceJson:source}
const course:Course & {fixedDate:string}={id:1,groupId:'g',tableId:1,courseName:'实验',alias:'单次实验',teacher:'李',room:'A',note:'备注',day:1,startNode:1,step:1,startWeek:1,endWeek:20,type:0,color:'#FF123456',colorMode:0,ownTime:false,isIrregularNode:false,isIrregularTime:false,startTime:'',endTime:'',credit:0,level:0,fixedDate:'2026-09-15'}
async function seed(){await db.timetables.put(table);await db.courses.put(course);await db.periodTables.put({id:3,name:'实际作息',nodesPerDay:1,timeJson:time,smartConfigJson:'',createdAt:0,updatedAt:0})}

it.each(['export','sheet'] as const)('%s 分享文本 uses native markers and preserves fixed date, raw source and bound schedule',async(kind)=>{
  await seed()
  const writeText=vi.fn(async(_text:string)=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  if(kind==='export') render(<ExportView onBack={()=>{}} />)
  else render(<ShareScheduleSheetView table={table} courses={[course]} onDismiss={()=>{}} />)
  await waitFor(()=>expect(screen.getByText('分享文本')).toBeTruthy())
  // Wait for the live course query before invoking the export action.
  if(kind==='export') await waitFor(()=>expect(screen.getByText(/1 门课程|1 门|1 个/)).toBeTruthy())
  fireEvent.click(screen.getByText('分享文本'))
  await waitFor(()=>expect(writeText).toHaveBeenCalledTimes(1))
  const text=writeText.mock.calls[0][0] as string
  expect(text).toContain('<<<SLEEPY-BEGIN>>>');expect(text).toContain('#sleepy-v1')
  const result=parseSchedule(text,0)
  if(!result.ok)throw result.error
  expect(result.value.importSourceJson).toBe(source)
  expect(result.value.periodTable?.name).toBe('实际作息')
  expect(result.value.courses[0]).toMatchObject({fixedDate:'2026-09-15',alias:'单次实验'})
  expect(result.value.timeJson).toContain('10:00')
})

it('failed clipboard writes show a failure instead of copied success',async()=>{
  await seed();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn(async()=>{throw Error('denied')})}})
  render(<ShareScheduleSheetView table={table} courses={[course]} onDismiss={()=>{}} />)
  fireEvent.click(screen.getByText('分享文本'))
  await waitFor(()=>expect(screen.getByText('导出失败，请重试')).toBeTruthy())
  expect(screen.queryByText('已复制')).toBeNull()
})
