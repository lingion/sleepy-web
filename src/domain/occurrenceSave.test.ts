import {describe,it,expect,vi} from 'vitest'
import {initialMeetingBlock,groupSlotsForEdit} from './courseDraft'
import {coursesForDate,displayMaxWeek,mergeMatchingRows,occurrenceAtDate} from './courseOccurrence'
import {occurrenceConflictDetails,resolveDraftDestinations} from './occurrenceSave'
import {DEFAULT_TIME_JSON} from './timeTable'
import type {Course,Table} from '../data/types'
const table={id:1,startDate:'2026-09-07',maxWeek:4,timeJson:DEFAULT_TIME_JSON} as Table
const course={id:7,tableId:1,groupId:'g',courseName:'数学',alias:'',room:'A',teacher:'',note:'',day:1,startWeek:1,endWeek:4,type:0,startNode:1,step:2,ownTime:false,startTime:'',endTime:''} as Course
const transfers=[{sourceDate:'2026-09-07',targetDate:'2026-10-10',segmentId:'t'}]
describe('Android immutable occurrence decisions',()=>{
  it('splits only affected source dates and retains the other recurring weeks',async()=>{
    const ask=vi.fn().mockResolvedValue(0)
    const rows=await resolveDraftDestinations([course],table,transfers,ask)
    expect(rows?.map(row=>[row.startWeek,row.endWeek,row.day])).toEqual([[1,1,1],[2,4,1]])
    expect(ask).toHaveBeenCalledTimes(1)
    expect(coursesForDate('2026-10-10',table.startDate,4,rows!,transfers)).toHaveLength(1)
    expect(displayMaxWeek(table,transfers)).toBe(5)
  })
  it('offers reverse source attribution and requires a second confirmation for direct scheduling',async()=>{
    const transfer=[{sourceDate:'2026-09-07',targetDate:'2026-09-19',segmentId:'t'}]
    const target=occurrenceAtDate(course,'2026-09-19',table)
    const follow=await resolveDraftDestinations([target],table,transfer,vi.fn().mockResolvedValue(0))
    expect(follow?.[0]).toMatchObject({day:1,startWeek:1,fixedDate:null})
    const ask=vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(null)
    expect(await resolveDraftDestinations([target],table,transfer,ask)).toBeNull()
    expect(ask).toHaveBeenCalledTimes(2)
    const direct=await resolveDraftDestinations([target],table,transfer,vi.fn().mockResolvedValue(1))
    expect(coursesForDate('2026-09-19',table.startDate,4,direct!,transfer)).toEqual([])
  })
  it('leaves fixed-date rows fixed and retains separate editing blocks',async()=>{
    const fixed=occurrenceAtDate(course,'2026-09-07',table,true)
    const ask=vi.fn()
    expect(await resolveDraftDestinations([fixed],table,transfers,ask)).toEqual([fixed])
    expect(ask).not.toHaveBeenCalled()
    expect(initialMeetingBlock(1,fixed).fixedDate).toBe('2026-09-07')
    expect(groupSlotsForEdit([fixed,{...fixed,fixedDate:null} as Course])).toHaveLength(2)
  })
  it('reports actual display-date conflicts including incoming draft pairs',()=>{
    const target=occurrenceAtDate(course,'2026-09-07',table)
    const details=occurrenceConflictDetails([target,{...target,id:8,courseName:'物理'}],[],table,transfers,['一','二','三','四','五','六','日'],'%1$s %2$s %3$s %4$s')
    expect(details).toHaveLength(1)
    expect(details[0]).toContain('2026-10-10')
    expect(details[0]).toContain('物理')
  })
  it('keeps Android stored range endpoints when merging parity rows',()=>{
    const a={...course,type:1,startWeek:1,endWeek:4} as Course
    const b={...course,id:8,type:1,startWeek:5,endWeek:8} as Course
    expect(mergeMatchingRows([a,b])).toEqual([{...a,endWeek:8}])
  })
})
