import {afterEach,describe,expect,it,vi} from 'vitest'
import {act,cleanup,renderHook} from '@testing-library/react'
import {useGlassLens} from './useGlassLens'
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete document.documentElement.dataset.uiStyle})
describe('complete glass lens motion',()=>{
 it('keeps both pointer axes independent of the selected position and settles without a permanent frame loop',()=>{
  document.documentElement.dataset.uiStyle='liquid_glass'
  let id=0,now=0
  const frames=new Map<number,FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id})
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key))
  const advance=(count:number)=>{for(let n=0;n<count;n++){const current=[...frames.values()];frames.clear();now+=16.667;act(()=>current.forEach(fn=>fn(now)))}}
  const element=document.createElement('div')
  vi.spyOn(element,'getBoundingClientRect').mockReturnValue({height:32} as DOMRect)
  const {result}=renderHook(()=>useGlassLens({current:element}))
  act(()=>{result.current.press(100,100);result.current.move(120,80)});advance(60)
  expect(parseFloat(element.style.getPropertyValue('--lens-x'))).toBeGreaterThan(0)
  expect(parseFloat(element.style.getPropertyValue('--lens-y'))).toBeLessThan(0)
  expect(parseFloat(element.style.getPropertyValue('--lens-lift'))).toBeGreaterThan(.97)
  act(()=>result.current.move(70,140));advance(60)
  expect(parseFloat(element.style.getPropertyValue('--lens-x'))).toBeLessThan(0)
  expect(parseFloat(element.style.getPropertyValue('--lens-y'))).toBeGreaterThan(0)
  act(()=>result.current.release());advance(300)
  expect(element.style.getPropertyValue('--lens-lift')).toBe('0')
  expect(element.style.getPropertyValue('--lens-x')).toBe('0px')
  expect(element.style.getPropertyValue('--lens-y')).toBe('0px')
  expect(frames.size).toBe(0)
 })
})

describe('track selection commits on release',()=>{
 it('survives a StrictMode remount, follows the pointer, and cancels without selecting',async()=>{
  const {StrictMode}=await import('react')
  document.documentElement.dataset.uiStyle='liquid_glass'
  let id=0,now=0
  const frames=new Map<number,FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id})
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key))
  const advance=(count:number)=>{for(let n=0;n<count;n++){const current=[...frames.values()];frames.clear();now+=16.667;act(()=>current.forEach(fn=>fn(now)))}}
  const element=document.createElement('div')
  vi.spyOn(element,'getBoundingClientRect').mockReturnValue({left:0,width:400,height:64} as DOMRect)
  const onSelect=vi.fn()
  const {result}=renderHook(()=>useGlassLens({current:element},{index:0,count:4,inset:0,onSelect}),{wrapper:StrictMode})
  act(()=>result.current.press(50,30));advance(35)
  expect(parseFloat(element.style.getPropertyValue('--lens-lift'))).toBeGreaterThan(.97)
  act(()=>result.current.move(350,45));advance(40)
  expect(onSelect).not.toHaveBeenCalled()
  expect(parseFloat(element.style.getPropertyValue('--lens-position'))).toBeGreaterThan(2.9)
  act(()=>result.current.release(true));advance(180)
  expect(onSelect).not.toHaveBeenCalled()
  act(()=>{result.current.press(50,30);result.current.move(250,30);result.current.release()})
  expect(onSelect).toHaveBeenCalledTimes(1);expect(onSelect).toHaveBeenCalledWith(2)
  advance(300);expect(frames.size).toBe(0)
 })
})
