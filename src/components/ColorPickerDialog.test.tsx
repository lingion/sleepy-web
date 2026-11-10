import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {initI18n} from '../i18n'
import {ColorPickerDialog,hsvToRgb,rgbToHsv} from './ColorPickerDialog'
beforeAll(()=>initI18n('zh-CN'))
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Android 颜色对话框',()=>{
 it('parses ARGB without shifting channels and previews the exact opaque HSV color',()=>{
  const onConfirm=vi.fn();render(<ColorPickerDialog initialHex="#AA112233" onConfirm={onConfirm} onDismiss={()=>{}}/>)
  expect(screen.getByText('#FF112233')).toBeTruthy()
  expect(hsvToRgb(...rgbToHsv([17,34,51]))).toEqual([17,34,51])
  fireEvent.click(screen.getByRole('button',{name:'确定'}));expect(onConfirm).toHaveBeenCalledWith('#FF112233')
 })
 it('keeps the opening hue ghost through changes and clears it on return',()=>{
  render(<ColorPickerDialog initialHex="#FFFF0000" onConfirm={()=>{}} onDismiss={()=>{}}/>)
  const hue=screen.getByRole('slider',{name:'色相'})
  fireEvent.keyDown(hue,{key:'ArrowRight'});expect(document.querySelector('[data-hue-ghost]')).not.toBeNull()
  fireEvent.keyDown(hue,{key:'Home'});expect(document.querySelector('[data-hue-ghost]')).toBeNull()
  fireEvent.keyDown(hue,{key:'End'});expect(screen.getByText('#FFFF0000')).toBeTruthy()
 })
 it('updates saturation and value continuously during captured pointer movement',()=>{
  vi.stubGlobal('PointerEvent',MouseEvent)
  render(<ColorPickerDialog initialHex="#FFFF0000" onConfirm={()=>{}} onDismiss={()=>{}}/>)
  const panel=screen.getByRole('group',{name:'饱和度和明度'})
  vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({left:10,top:20,width:200,height:200} as DOMRect)
  fireEvent.pointerDown(panel,{button:0,clientX:210,clientY:20})
  fireEvent.pointerMove(panel,{clientX:110,clientY:120})
  expect(screen.getByText('#FF804040')).toBeTruthy()
  fireEvent.pointerUp(panel);fireEvent.pointerMove(panel,{clientX:210,clientY:20})
  expect(screen.getByText('#FF804040')).toBeTruthy()
 })
})
