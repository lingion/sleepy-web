import { describe, expect, it } from 'vitest'
import type { Course } from '../data/types'
import { prepareOccurrenceDraft, validateOccurrenceNodes } from './occurrenceDraft'
const timeJson = JSON.stringify([{node:0,start:'07:00',end:'07:40',edge:'before'},{node:1,start:'08:00',end:'08:45'},{node:2,start:'08:55',end:'09:40'},{node:4,start:'10:40',end:'11:25'}])
const course = { room:' A ',startNode:1,step:2,ownTime:false,isIrregularTime:false,isIrregularNode:false,startTime:'08:00',endTime:'09:40' } as Course

describe('single occurrence draft validation', () => {
  it('preserves unchanged imported room and clears inactive custom clocks', () => {
    expect(prepareOccurrenceDraft(course,course,timeJson)).toMatchObject({room:' A ',startTime:'',endTime:'',ownTime:false,isIrregularTime:false})
    expect(prepareOccurrenceDraft(course,{...course,room:' B '},timeJson).room).toBe('B')
  })
  it('recomputes edge classification and honors either historical custom flag', () => {
    expect(prepareOccurrenceDraft(course,{...course,startNode:0,step:1},timeJson).isIrregularNode).toBe(true)
    expect(prepareOccurrenceDraft(course,{...course,isIrregularNode:true},timeJson).isIrregularNode).toBe(false)
    expect(prepareOccurrenceDraft(course,{...course,isIrregularTime:true,startTime:' 08:00 ',endTime:' 09:40 '},timeJson)).toMatchObject({ownTime:true,isIrregularTime:true,startTime:'08:00',endTime:'09:40'})
  })
  it('rejects noninteger, nonfinite, missing and excessive spans before allocation', () => {
    for (const [node,step] of [[NaN,1],[1,Infinity],[1,1.5],[1,3],[1,1e12]]) expect(()=>validateOccurrenceNodes(timeJson,node,step)).toThrow()
    expect(()=>validateOccurrenceNodes(timeJson,0,1,true)).toThrow()
    expect(()=>validateOccurrenceNodes(timeJson,0,1)).not.toThrow()
  })
  it('rejects invalid clock ranges instead of silently changing them', () => {
    for (const [startTime,endTime] of [['25:00','26:00'],['09:40','08:00'],['08:00','08:00']]) expect(()=>prepareOccurrenceDraft(course,{...course,ownTime:true,startTime,endTime},timeJson)).toThrow()
  })
})
