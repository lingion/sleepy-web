import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { loadPublicSchedule } from '../publicSchedule'
import { exportSleepyV1File } from '../domain/import/sleepyNativeExporter'

afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await db.delete(); await db.open() })

it('loads a real checksummed public timetable with its period table before reporting ready', async () => {
  vi.stubEnv('VITE_PUBLIC_SCHEDULE_PATH', '/public.sleepy')
  const times = '[{"node":1,"start":"08:00","end":"08:45"}]'
  const course = { groupId:'math', courseName:'Math', alias:'', teacher:'Teacher', room:'A101', note:'', day:1, startNode:1, step:1, startWeek:1, endWeek:20, type:0, color:'#ff6750a4', ownTime:false, startTime:'', endTime:'' }
  const file = exportSleepyV1File('Public schedule', '2026-09-07', 20, 1, times, [course], { id:7, name:'Public periods', nodesPerDay:1, timeJson:times })
  const fetch = vi.fn().mockResolvedValue({ ok:true, text:async () => file })
  vi.stubGlobal('fetch', fetch)
  expect(await loadPublicSchedule()).toBe(true)
  expect(fetch).toHaveBeenCalledWith('/public.sleepy', { cache:'no-store' })
  expect(await db.timetables.get(1)).toMatchObject({ name:'Public schedule', periodTableId:1, isDefault:1 })
  expect(await db.periodTables.get(1)).toMatchObject({ name:'Public periods', nodesPerDay:1 })
  expect(await db.courses.where('tableId').equals(1).first()).toMatchObject({ courseName:'Math', room:'A101' })
})

it('rejects an unsupported public file before replacing persisted tables', async () => {
  vi.stubEnv('VITE_PUBLIC_SCHEDULE_PATH', '/public.sleepy')
  await db.prefs.put({ key:'publicScheduleLoaded', value:'untouched' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, text:async () => 'sleepy-v2\nT|name=Future' }))
  await expect(loadPublicSchedule()).rejects.toThrow()
  expect(await db.prefs.get('publicScheduleLoaded')).toMatchObject({ value:'untouched' })
  expect(await db.timetables.count()).toBe(0)
})
