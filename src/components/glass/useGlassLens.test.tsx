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
