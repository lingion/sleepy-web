import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../data/db'
import { initI18n } from '../i18n'
import { useBackStack } from '../state/backStack'
import { useUndoStore } from '../data/undoStore'
import { ScheduleView } from './ScheduleView'
import { ManageView } from './ManageView'
import { AddCourseView } from './AddCourseView'

beforeAll(() => {
  initI18n('zh-CN')
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({matches:false,addEventListener() {},removeEventListener() {}}))
  // jsdom queues history traversal across test boundaries. Deliver that boundary
  // synchronously while exercising the real shared popstate handler and stack.
  vi.spyOn(window.history,'back').mockImplementation(() => window.dispatchEvent(new PopStateEvent('popstate')))
})
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
afterEach(async () => {
  cleanup()
  useBackStack.setState({stack:[]})
  useUndoStore.setState({undoStack:[],redoStack:[],batchDepth:0,batchCaptured:false,restoring:false})
  await db.delete(); await db.open()
})
const times = '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:55","end":"09:40"}]'
const source = '{ "学校": "Ａ校", "optional": null }'
async function seed() {
  await db.periodTables.put({id:7,name:'目标作息',nodesPerDay:1,timeJson:times,smartConfigJson:'',createdAt:0,updatedAt:0})
  await db.timetables.bulkPut([
    {id:1,name:'目标课表',startDate:'2026-09-07',maxWeek:20,nodeCount:1,timeJson:times,smartConfigJson:'',isDefault:1,createdAt:0,periodTableId:7,importSourceJson:source},
    {id:2,name:'已有来源',startDate:'2026-09-07',maxWeek:20,nodeCount:1,timeJson:times,smartConfigJson:'',isDefault:0,createdAt:0,importSourceJson:'{"other":true}'},
  ])
  await db.courses.put({id:1,tableId:2,groupId:'source',courseName:'来源单次课',teacher:'',room:'',note:'',alias:'',day:1,startNode:1,step:1,startWeek:1,endWeek:20,type:0,color:'',colorMode:0,ownTime:false,startTime:'',endTime:'',isIrregularNode:false,isIrregularTime:false,credit:0,level:0,fixedDate:'2026-11-15'})
}

it('schedule add opens the Android entry in order, selects existing courses and appends to its explicit target', async () => {
  await seed(); render(<ScheduleView />)
  const add = await screen.findByTitle('添加课程')
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(add)
  await screen.findByRole('heading',{name:'添加课程'})
  const methods = ['从已有课表选择','教务直连','粘贴课表文本','手动添加课程','从文件导入']
  const buttons = screen.getAllByRole('button')
  const positions = methods.map(name => buttons.indexOf(screen.getByRole('button',{name})))
  expect(positions).toEqual([...positions].sort((a,b) => a-b))
  expect(positions.every(position => position >= 0)).toBe(true)
  await waitFor(() => expect((screen.getByRole('button',{name:methods[0]}) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button',{name:methods[0]}))
  fireEvent.click(await screen.findByRole('button',{name:'已有来源'}))
  await screen.findByRole('heading',{name:'选择导入课程'})
  fireEvent.click(screen.getByRole('button',{name:'确定'}))
  await screen.findByRole('heading',{name:'导入预览'})
  fireEvent.click(screen.getByRole('button',{name:'确认导入'}))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(await db.timetables.get(1)).toMatchObject({periodTableId:7,importSourceJson:source,isDefault:1})
  expect(await db.courses.where('tableId').equals(1).first()).toMatchObject({courseName:'来源单次课',fixedDate:'2026-11-15'})
  expect(await db.periodTables.count()).toBe(1)
})

it.each(['schedule','manage'] as const)('%s manual form returns to its entry before returning to the parent', async view => {
  await seed(); render(view === 'schedule' ? <ScheduleView /> : <ManageView />)
  if (view === 'schedule') {
    const add = await screen.findByTitle('添加课程')
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(add)
  }
  else fireEvent.click(await screen.findByRole('button',{name:/^添加课程/}))
  await screen.findByRole('heading',{name:'添加课程'})
  const manual = screen.getByRole('button',{name:'手动添加课程'})
  await waitFor(() => expect((manual as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(manual)
  await screen.findByLabelText('课程名 *')
  expect(useBackStack.getState().stack).toEqual(['addCourse','addCourse'])
  fireEvent.click(screen.getByRole('button',{name:'返回'}))
  await screen.findByRole('button',{name:'从已有课表选择'})
  expect(useBackStack.getState().stack).toEqual(['addCourse'])
  fireEvent.click(screen.getByRole('button',{name:'返回'}))
  expect(useBackStack.getState().stack).toEqual([])
})

it('browser back from the manual form removes one layer and keeps the target append entry', async () => {
  await seed(); render(<ManageView />)
  fireEvent.click(await screen.findByRole('button',{name:/^添加课程/}))
  const manual = await screen.findByRole('button',{name:'手动添加课程'})
  await waitFor(() => expect((manual as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(manual)
  await screen.findByLabelText('课程名 *')
  window.history.replaceState({},'', '#/课表/添加课程')
  fireEvent.popState(window)
  await screen.findByRole('button',{name:'从已有课表选择'})
  expect(useBackStack.getState().stack).toEqual(['addCourse'])
  fireEvent.popState(window)
  await screen.findByRole('heading',{name:'课表管理'})
  expect(useBackStack.getState().stack).toEqual([])
})

it('an absent target disables append methods and cannot turn the operation into a new-table import', async () => {
  render(<ManageView />)
  fireEvent.click(screen.getByRole('button',{name:/^添加课程/}))
  const entry = await screen.findByRole('heading',{name:'添加课程'})
  const page = entry.parentElement!.parentElement!
  for (const name of ['从已有课表选择','教务直连','粘贴课表文本','手动添加课程','从文件导入']) {
    expect((within(page).getByRole('button',{name}) as HTMLButtonElement).disabled).toBe(true)
  }
  expect(await db.timetables.count()).toBe(0)
})

it('manual addition keeps the explicit target even when another timetable is the default', async () => {
  await seed()
  await db.courses.delete(1)
  const done = vi.fn()
  render(<AddCourseView targetTableId={2} onBack={vi.fn()} onSaved={done}/>)
  fireEvent.change(await screen.findByLabelText('课程名 *'),{target:{value:'指定目标手动课'}})
  const save = screen.getByRole('button',{name:'创建课程'})
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(save)
  await waitFor(() => expect(done).toHaveBeenCalledOnce())
  const saved = (await db.courses.toArray()).filter(course => course.courseName === '指定目标手动课')
  expect(saved.length).toBeGreaterThan(0)
  expect(saved.every(course => course.tableId === 2)).toBe(true)
  expect(await db.timetables.get(1)).toMatchObject({importSourceJson:source,periodTableId:7})
})

it('manual addition with a deleted explicit target shows an error without creating a replacement table', async () => {
  const done = vi.fn()
  render(<AddCourseView targetTableId={99} onBack={vi.fn()} onSaved={done}/>)
  fireEvent.change(await screen.findByLabelText('课程名 *'),{target:{value:'不可保存'}})
  const save = screen.getByRole('button',{name:'创建课程'})
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(save)
  await screen.findByText('目标课表已不存在，请返回并重新选择课表。')
  expect(await db.timetables.count()).toBe(0)
  expect(await db.courses.count()).toBe(0)
  expect(done).not.toHaveBeenCalled()
})
