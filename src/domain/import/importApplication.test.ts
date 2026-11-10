import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import { useUndoStore } from '../../data/undoStore'
import { applyPortableImport } from './importApplication'
import { parseSchedule } from './scheduleParser'

const times = '[{"node":1,"start":"08:00","end":"08:45"},{"node":2,"start":"08:55","end":"09:40"}]'
function parsed() {
  const result = parseSchedule(JSON.stringify({name:'来源', startDate:'2026-09-07',tableInfo:{time:times,maxWeek:20,importSourceJson:'{ "学校": "Ａ校" }'},courses:[{name:'高数',day:1,startNode:1,step:2,startWeek:1,endWeek:16,type:1,fixedDate:'2026-09-15'}]}),0)
  if (!result.ok) throw result.error
  return result.value
}
afterEach(async () => {
  vi.restoreAllMocks()
  useUndoStore.setState({undoStack:[],redoStack:[],batchDepth:0,batchCaptured:false,restoring:false})
  await db.delete(); await db.open()
})
it('new import is atomic, retains source and confirmed date, and does not change an existing default', async () => {
  await db.timetables.add({id:1,name:'原课表',isDefault:1,timeJson:times,smartConfigJson:'',startDate:'2026-09-07',maxWeek:20,nodeCount:2,createdAt:0})
  const id = await applyPortableImport({result:parsed(),name:'新课表',startDate:'2026-09-16',timeJson:times})
  expect(await db.timetables.get(id)).toMatchObject({name:'新课表',startDate:'2026-09-14',importSourceJson:'{ "学校": "Ａ校" }',isDefault:0})
  expect(await db.timetables.get(1)).toMatchObject({name:'原课表',isDefault:1})
  expect((await db.courses.toArray())[0]).toMatchObject({fixedDate:'2026-09-15'})
  expect(useUndoStore.getState().undoStack).toHaveLength(1)
  await useUndoStore.getState().undo()
  expect(await db.timetables.count()).toBe(1)
  expect(await db.courses.count()).toBe(0)
})
it('a failed course write leaves no timetable, period table, or undo entry', async () => {
  vi.spyOn(db.courses,'bulkPut').mockRejectedValueOnce(new Error('storage failure'))
  await expect(applyPortableImport({result:parsed(),name:'新课表',startDate:'2026-09-07',timeJson:times})).rejects.toThrow('storage failure')
  expect(await db.timetables.count()).toBe(0)
  expect(await db.periodTables.count()).toBe(0)
  expect(useUndoStore.getState().undoStack).toHaveLength(0)
})
it('a missing binding rejects before writing; an existing binding is preserved unchanged', async () => {
  await expect(applyPortableImport({result:parsed(),name:'新课表',startDate:'2026-09-07',timeJson:times,bindPeriodTableId:99})).rejects.toThrow()
  await db.periodTables.add({id:3,name:'共享作息',nodesPerDay:2,timeJson:times,smartConfigJson:'',createdAt:0,updatedAt:0})
  const id=await applyPortableImport({result:parsed(),name:'新课表',startDate:'2026-09-07',timeJson:'[]',bindPeriodTableId:3})
  expect(await db.timetables.get(id)).toMatchObject({periodTableId:3,timeJson:times})
  expect(await db.periodTables.count()).toBe(1)
})
it('append uses parity-aware conflicts, backs up the original, and preserves target metadata', async () => {
  const id=await applyPortableImport({result:parsed(),name:'原课表',startDate:'2026-09-07',timeJson:times})
  const incoming=parsed();incoming.courses[0].type=2;incoming.courses[0].fixedDate=null
  await applyPortableImport({result:incoming,targetTableId:id,backupOriginal:true,appendConflicts:false})
  expect(await db.courses.where('tableId').equals(id).count()).toBe(2)
  const backup=(await db.timetables.toArray()).find(t=>t.id!==id)!
  expect(backup.name).toContain('备份')
  expect(backup).toMatchObject({periodTableId:null,preBindSnapshotJson:'',timeJson:times,reminderEnabled:0,reminderOverride:null})
  const targetCourses=await db.courses.where('tableId').equals(id).toArray()
  expect(targetCourses[0].groupId).not.toBe(targetCourses[1].groupId)
  expect(await db.courses.where('tableId').equals(backup.id).count()).toBe(1)
  expect((await db.timetables.get(id))?.startDate).toBe('2026-09-07')
})
it('append rejection never writes a backup or alters the shared period table',async()=>{
  const id=await applyPortableImport({result:parsed(),startDate:'2026-09-07',timeJson:times})
  await expect(applyPortableImport({result:parsed(),targetTableId:id})).rejects.toThrow('没有可以追加')
  expect(await db.timetables.count()).toBe(1)
  const incomplete='[{"node":1,"start":"08:00","end":"08:45"}]'
  const target=(await db.timetables.get(id))!
  await db.periodTables.update(target.periodTableId!,{timeJson:incomplete})
  const incoming=parsed();incoming.courses[0].type=2
  await expect(applyPortableImport({result:incoming,targetTableId:id})).rejects.toThrow('第 2 节')
  expect(await db.timetables.count()).toBe(1)
  expect((await db.periodTables.get(target.periodTableId!))?.timeJson).toBe(incomplete)
})
it('append remaps separate authoritative groups without merging them into existing names',async()=>{
  const id=await applyPortableImport({result:parsed(),startDate:'2026-09-07',timeJson:times})
  const incoming=parsed();incoming.groupIdsAuthoritative=true
  incoming.courses=[{...incoming.courses[0],type:2,groupId:'a'}, {...incoming.courses[0],day:2,groupId:'b'}]
  await applyPortableImport({result:incoming,targetTableId:id,backupOriginal:false,appendConflicts:true})
  const courses=await db.courses.where('tableId').equals(id).toArray()
  expect(new Set(courses.map(c=>c.groupId)).size).toBe(3)
  expect(courses.slice(1).map(c=>c.groupId)).not.toEqual(['a','b'])
})
