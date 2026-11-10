import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen,waitFor} from '@testing-library/react'
import {GlassControls} from './GlassControls'
afterEach(()=>{cleanup();delete document.documentElement.dataset.uiStyle})
describe('semantic glass control enhancement',()=>{
 it('preserves each primary and destructive fill and restores classic controls on mode change',async()=>{
  function Example({style}:{style:'classic'|'liquid_glass'}) {return <><GlassControls style={style}/><button style={{background:'#6750a4',color:'white'}}>保存</button><button style={{background:'#f9dedc'}}>删除</button></>}
  const {rerender}=render(<Example style="classic"/>)
  const save=screen.getByRole('button',{name:'保存'}),remove=screen.getByRole('button',{name:'删除'})
  expect(save.classList.contains('glass-control')).toBe(false)
  rerender(<Example style="liquid_glass"/>)
  await waitFor(()=>expect(save.style.getPropertyValue('--glass-control-tint')).toContain('103, 80, 164'))
  expect(remove.style.getPropertyValue('--glass-control-tint')).toContain('249, 222, 220')
  expect(save.style.color).toBe('white')
  rerender(<Example style="classic"/>)
  expect(save.classList.contains('glass-control')).toBe(false)
  expect(save.style.background).toBe('rgb(103, 80, 164)')
  expect(save.style.getPropertyValue('--glass-control-tint')).toBe('')
 })
 it('enhances controls opened in dialogs and leaves lens tracks independent',async()=>{
  const {rerender}=render(<GlassControls style="liquid_glass"/>)
  rerender(<><GlassControls style="liquid_glass"/><div role="dialog"><button>新弹窗</button></div><div data-glass-motion="off"><button>透镜按钮</button></div></>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'新弹窗'}).classList.contains('glass-control')).toBe(true))
  expect(screen.getByRole('button',{name:'透镜按钮'}).classList.contains('glass-control')).toBe(false)
 })
 it('separates a square icon touch target from its optical disc and restores classic markup',()=>{
  function Example({style}:{style:'classic'|'liquid_glass'}) {return <><GlassControls style={style}/><button aria-label="返回" style={{width:48,height:48}}><svg/></button><button style={{width:48,height:48}}>保存</button></>}
  const {rerender}=render(<Example style="liquid_glass"/>)
  const icon=screen.getByRole('button',{name:'返回'})
  expect(icon.hasAttribute('data-glass-icon')).toBe(true)
  expect(screen.getByRole('button',{name:'保存'}).hasAttribute('data-glass-icon')).toBe(false)
  rerender(<Example style="classic"/>);expect(icon.hasAttribute('data-glass-icon')).toBe(false)
 })
})
