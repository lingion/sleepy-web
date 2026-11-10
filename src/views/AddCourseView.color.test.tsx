import 'fake-indexeddb/auto'
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {db} from '../data/db'
import type {Course} from '../data/types'
import {initI18n} from '../i18n'
import {AddCourseView} from './AddCourseView'
const mocks=vi.hoisted(()=>({setGroupSourceColor:vi.fn(),saveCourseDraft:vi.fn()}))
vi.mock('../data/repository',async original=>({...await original<typeof import('../data/repository')>(),setGroupSourceColor:mocks.setGroupSourceColor,saveCourseDraft:mocks.saveCourseDraft}))
const course={id:1,tableId:1,groupId:'g',courseName:'数学',teacher:'',room:'',note:'',alias:'',day:1,startNode:1,step:1,startWeek:1,endWeek:16,type:0,color:'#FF112233',colorMode:0,ownTime:false,isIrregularNode:false,isIrregularTime:false,startTime:'',endTime:'',credit:0,level:0} as Course
beforeAll(()=>initI18n('zh-CN'))
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
 Element.prototype.scrollIntoView=vi.fn()
 await db.timetables.put({id:1,name:'当前表',isDefault:1,startDate:'2026-09-07',maxWeek:20,nodeCount:1,timeJson:JSON.stringify([{node:1,start:'08:00',end:'08:45'}]),smartConfigJson:'',createdAt:0})
 await db.courses.put(course)
 mocks.setGroupSourceColor.mockImplementation(async()=>db.courses.update(1,{color:'#FFFF0000'}))
 mocks.saveCourseDraft.mockResolvedValue(true)
})
afterEach(async()=>{cleanup();vi.unstubAllGlobals();await db.delete();await db.open()})
async function pickRed() {
 fireEvent.click(await screen.findByRole('button',{name:/改组色|Change group color/}))
 const picker=await screen.findByRole('dialog',{name:'颜色'})
 fireEvent.change(within(picker).getByRole('slider',{name:'饱和度'}),{target:{value:'1'}})
 fireEvent.change(within(picker).getByRole('slider',{name:'明度'}),{target:{value:'1'}})
 fireEvent.keyDown(within(picker).getByRole('slider',{name:'色相'}),{key:'Home'})
 fireEvent.click(within(picker).getByRole('button',{name:'确定'}))
 return screen.findByRole('dialog',{name:'确认修改组色'})
}
describe('课程级组色与时段三态',()=>{
 it('places group color in basic information and applies it only after the impact confirmation',async()=>{
  render(<AddCourseView editingCourse={course} onBack={()=>{}} onSaved={()=>{}}/>)
  await waitFor(()=>expect(screen.getAllByText('#FF112233').length).toBeGreaterThan(0))
  const confirm=await pickRed()
  expect(mocks.setGroupSourceColor).not.toHaveBeenCalled()
  fireEvent.click(within(confirm).getByRole('button',{name:'确定'}))
  await waitFor(()=>expect(mocks.setGroupSourceColor).toHaveBeenCalledWith(1,'g','#FFFF0000'))
  await waitFor(()=>expect(screen.getAllByText('#FFFF0000').length).toBeGreaterThan(0))
  expect(screen.getByRole('switch',{name:'自定义颜色'}).getAttribute('aria-checked')).toBe('false')
 })
 it('cancels the group impact prompt without writing',async()=>{
  render(<AddCourseView editingCourse={course} onBack={()=>{}} onSaved={()=>{}}/>)
  const confirm=await pickRed();fireEvent.click(within(confirm).getByRole('button',{name:'返回修改'}))
  expect(mocks.setGroupSourceColor).not.toHaveBeenCalled()
  expect((await db.courses.get(1))?.color).toBe('#FF112233')
 })
 it('keeps quick-add fields and multiline notes when opening the full editor',async()=>{
  render(<AddCourseView quickAdd={{tableId:1,date:'2026-09-08',week:1,day:2,startNode:1,step:1}} onBack={()=>{}} onSaved={()=>{}}/>)
  fireEvent.change(screen.getByLabelText(/备注/),{target:{value:'第一行\n第二行'}})
  fireEvent.click(screen.getByRole('button',{name:'更多设置'}))
  expect((screen.getByLabelText(/备注/) as HTMLTextAreaElement).value).toBe('第一行\n第二行')
  expect(screen.getByRole('button',{name:/改组色|Change group color/})).toBeTruthy()
 })
})
