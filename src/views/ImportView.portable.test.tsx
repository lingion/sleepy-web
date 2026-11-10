import 'fake-indexeddb/auto'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../data/db'
import { initI18n } from '../i18n'
import { useUndoStore } from '../data/undoStore'
import { ImportView } from './ImportView'

beforeAll(()=>initI18n('zh-CN'))
afterEach(async()=>{cleanup();vi.restoreAllMocks();useUndoStore.setState({undoStack:[],redoStack:[],batchDepth:0,batchCaptured:false,restoring:false});await db.delete();await db.open()})
const times='[{"node":1,"start":"08:00","end":"08:45"}]'
const json=JSON.stringify({name:'导入来源',startDate:'2026-09-07',tableInfo:{time:times,importSourceJson:'{ "校区": "Ａ" }'},courses:[{name:'数学',day:1,startNode:1,step:1,startWeek:1,endWeek:20,type:0,fixedDate:'2026-09-15'},{name:'英语',day:2,startNode:1,step:1,startWeek:1,endWeek:20,type:0}]})
async function seed(){await db.timetables.put({id:1,name:'原课表',startDate:'2026-09-07',maxWeek:20,nodeCount:1,timeJson:times,smartConfigJson:'',isDefault:1,createdAt:0})}
async function paste(){await waitFor(()=>expect((screen.getByRole('button',{name:'粘贴课表文本'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('粘贴课表文本'));fireEvent.change(screen.getByLabelText('粘贴课表文本'),{target:{value:json}});fireEvent.click(screen.getByRole('button',{name:'预览导入'}))}

it('new-table import saves the confirmed date and metadata once without touching the existing default',async()=>{
  await seed();const done=vi.fn();render(<ImportView onDone={done} />);await paste()
  await screen.findByText('导入预览');fireEvent.click(screen.getByRole('button',{name:'导入为新课表'}))
  const dialog=screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('第一周从哪天开始'),{target:{value:'2026-09-16'}})
  const confirm=screen.getByRole('button',{name:'确认导入'});fireEvent.click(confirm);fireEvent.click(confirm)
  await waitFor(()=>expect(done).toHaveBeenCalledTimes(1))
  expect(await db.timetables.count()).toBe(2)
  expect((await db.timetables.get(1))?.isDefault).toBe(1)
  const saved=(await db.timetables.toArray()).find(t=>t.id!==1)!
  expect(saved).toMatchObject({startDate:'2026-09-14',importSourceJson:'{ "校区": "Ａ" }',isDefault:0})
  expect((await db.courses.where('tableId').equals(saved.id).toArray())[0]).toMatchObject({fixedDate:'2026-09-15'})
  expect(useUndoStore.getState().undoStack).toHaveLength(1)
})

it('append selects course groups first, defaults to backup and skips conflicts, and preserves the target',async()=>{
  await seed();const done=vi.fn();render(<ImportView onDone={done} addingCourses targetTableId={1}/>);await paste()
  await screen.findByText('选择导入课程')
  fireEvent.click(screen.getByLabelText('英语（1）'))
  fireEvent.click(screen.getByRole('button',{name:'确定'}))
  await screen.findByText('导入预览')
  expect((screen.getByLabelText('导入前备份原课表') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('同时追加冲突课程') as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'确认导入'}))
  await waitFor(()=>expect(done).toHaveBeenCalledTimes(1))
  expect((await db.courses.where('tableId').equals(1).toArray()).map(c=>c.courseName)).toEqual(['数学'])
  expect((await db.timetables.get(1))?.name).toBe('原课表')
  expect(await db.timetables.count()).toBe(2)
})

it('failed persistence remains in the confirmation dialog, displays its error, and allows retry',async()=>{
  const done=vi.fn();render(<ImportView onDone={done}/>);await paste()
  await screen.findByText('导入预览');fireEvent.click(screen.getByRole('button',{name:'导入为新课表'}))
  vi.spyOn(db.courses,'bulkPut').mockRejectedValueOnce(Error('disk full'))
  fireEvent.click(screen.getByRole('button',{name:'确认导入'}))
  await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe('disk full'))
  expect(await db.timetables.count()).toBe(0);expect(await db.periodTables.count()).toBe(0);expect(done).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'确认导入'}))
  await waitFor(()=>expect(done).toHaveBeenCalledTimes(1))
})

it('callers without a school navigation callback still open the complete guarded directory',async()=>{
  const done=vi.fn();render(<ImportView onDone={done}/>)
  await waitFor(()=>expect((screen.getByRole('button',{name:'教务直连'}) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button',{name:'教务直连'}))
  const search=await screen.findByRole('searchbox')
  fireEvent.change(search,{target:{value:'哈尔滨工程大学'}})
  fireEvent.click(screen.getAllByRole('option',{name:'哈尔滨工程大学'})[0])
  expect((await screen.findByRole('alertdialog')).textContent).toContain('网页暂不支持教务导入，请使用安卓版导入')
  expect(await db.timetables.count()).toBe(0)
  expect(done).not.toHaveBeenCalled()
})
