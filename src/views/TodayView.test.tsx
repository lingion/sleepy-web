import 'fake-indexeddb/auto'
import { afterEach,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest'
import { cleanup,render,screen } from '@testing-library/react'
import { db } from '../data/db'
import type { Course } from '../data/types'
import { initI18n } from '../i18n'
import { useHolidayStore } from '../state/holidayStore'
import { usePrefsStore } from '../state/prefsStore'
import { TodayView } from './TodayView'

const timeJson=JSON.stringify([{node:1,start:'14:00',end:'14:45'}])
function course(patch:Partial<Course> & {fixedDate?:string}={}):Course {
 return {id:1,tableId:1,groupId:'g',courseName:'课表课程',teacher:'',room:'A101',note:'',alias:'',day:1,startNode:1,step:1,startWeek:1,endWeek:1,type:0,color:'',colorMode:0,ownTime:false,isIrregularTime:false,isIrregularNode:false,startTime:'',endTime:'',credit:0,level:0,...patch}
}
async function seed(courses:Course[]) {
 await db.periodTables.put({id:2,name:'绑定作息',timeJson,nodesPerDay:1,smartConfigJson:'',createdAt:0,updatedAt:0})
 await db.timetables.put({id:1,name:'当前表',isDefault:1,startDate:'2026-09-07',maxWeek:1,nodeCount:1,timeJson:'[]',smartConfigJson:'',periodTableId:2,createdAt:0})
 await db.courses.bulkPut(courses)
}
beforeAll(()=>initI18n('zh-CN'))
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-10T12:00:00'));localStorage.clear();usePrefsStore.setState(state=>({prefs:{...state.prefs,themeMode:'light'}}))})
afterEach(async()=>{cleanup();vi.useRealTimers();await db.delete();await db.open();localStorage.clear()})
describe('今日页的真实日期投影',()=>{
 it('shows every fixed-date course outside the semester with bound period-table clocks',async()=>{
  await seed(Array.from({length:9},(_,i)=>course({id:i+1,groupId:`g${i}`,courseName:`固定课程${i+1}`,fixedDate:'2026-11-10'})))
  render(<TodayView/>)
  expect(await screen.findByText('固定课程9')).toBeTruthy()
  expect(screen.getAllByText(/^固定课程/)).toHaveLength(9)
  expect(screen.getAllByText('14:00-14:45')).toHaveLength(9)
  expect(screen.getByText('学期已结束')).toBeTruthy()
 })
 it('uses the reverse transfer source for semester status and avoids weekday fallback courses',async()=>{
  await seed([course(),course({id:2,courseName:'错误的自然星期课',day:2})])
  useHolidayStore.getState().updateTransfer(1,'2026-09-07','2026-11-10','test')
  render(<TodayView/>)
  expect(await screen.findByText('课表课程')).toBeTruthy()
  expect(screen.queryByText('错误的自然星期课')).toBeNull()
  expect(screen.queryByText('学期已结束')).toBeNull()
  expect(screen.getByText('第 1 周')).toBeTruthy()
 })
})
