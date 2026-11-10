import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GlassControls } from './GlassControls'
import { GlassNavigation } from './GlassNavigation'
import { prepareGlassRuntime } from './runtime'

beforeAll(() => prepareGlassRuntime('liquid_glass'))

const globalStyles = readFileSync(resolve(__dirname, '../../theme/global.css'), 'utf8')
const glassStyles = readFileSync(resolve(__dirname, '../../theme/glass.css'), 'utf8')
const interactionStyles = readFileSync(resolve(__dirname, '../schedule/interaction.css'), 'utf8')

const styleElements: HTMLStyleElement[] = []
function installStyles(...sources: string[]) {
  for (const source of sources) {
    const style = document.createElement('style')
    style.textContent = source.replace(/^@import[^;]+;/gm, '')
    document.head.appendChild(style)
    styleElements.push(style)
  }
}
afterEach(() => {
  cleanup()
  for (const style of styleElements.splice(0)) style.remove()
  delete document.documentElement.dataset.uiStyle
})

describe('explicit Android glass boundaries', () => {
  it('enhances declared actions and leaves navigation rows, theme cards and ordinary dialogs alone', () => {
    render(<><GlassControls style="liquid_glass"/>
      <button data-glass-role="tinted" data-glass-tint="var(--md-primary)">保存</button>
      <button>外观设置入口</button><button>主题卡</button>
      <div role="dialog"><button>普通对话框动作</button></div>
      <div data-glass-role="menu" data-glass-motion="static">菜单</div>
    </>)
    expect(screen.getByRole('button',{name:'保存'}).classList.contains('glass-control')).toBe(true)
    for (const name of ['外观设置入口','主题卡','普通对话框动作']) expect(screen.getByRole('button',{name}).classList.contains('glass-control')).toBe(false)
    expect(screen.getByText('菜单').classList.contains('glass-surface')).toBe(true)
    expect(screen.getByText('菜单').classList.contains('glass-control')).toBe(false)
  })
  it('draws one grouped pane and removes enhancement when the role is withdrawn', async () => {
    const view=(role:boolean)=><><GlassControls style="liquid_glass"/><div data-testid="group" data-glass-role={role?'regular':undefined} data-glass-group="true"><button data-glass-role="regular">撤回</button><button data-glass-role="regular">重做</button></div></>
    const {rerender}=render(view(true))
    const group=screen.getByTestId('group')
    expect(group.classList.contains('glass-control')).toBe(true)
    expect(screen.getByRole('button',{name:'撤回'}).classList.contains('glass-control')).toBe(false)
    rerender(view(false))
    await waitFor(()=>expect(group.classList.contains('glass-control')).toBe(false))
    expect(group.style.getPropertyValue('--glass-optics-filter')).toBe('')
  })
  it('uses an explicit icon disc and restores classic fill without changing the declaration', () => {
    const view=(style:'classic'|'liquid_glass')=><><GlassControls style={style}/><button data-glass-role="regular" data-glass-icon="true" aria-label="返回" style={{width:48,height:48,background:'#6750a4'}}><svg/></button></>
    const {rerender}=render(view('liquid_glass'))
    const icon=screen.getByRole('button',{name:'返回'})
    expect(icon.classList.contains('glass-control')).toBe(true)
    rerender(view('classic'))
    expect(icon.classList.contains('glass-control')).toBe(false)
    expect(icon.style.background).toBe('rgb(103, 80, 164)')
    expect(icon.dataset.glassIcon).toBe('true')
  })

  it('opts the Dock backing into static glass beneath the custom-motion track', async () => {
    const items = ['课表', '我的'].map(key => ({ key, label: key, icon: () => <svg /> }))
    const view = (style: 'classic' | 'liquid_glass', dock = true) => <>
      <GlassControls style={style} />
      <GlassNavigation items={items} current="课表" dock={dock} onSelect={() => {}} />
    </>
    const { container, rerender } = render(view('classic'))
    const backing = container.querySelector<HTMLElement>('.navigation-backing')!
    const track = container.querySelector<HTMLElement>('.navigation-track')!
    expect(backing.classList.contains('glass-surface')).toBe(false)
    rerender(view('liquid_glass'))
    expect(backing.classList.contains('glass-surface')).toBe(true)
    expect(backing.classList.contains('glass-control')).toBe(false)
    expect(track.classList.contains('glass-control')).toBe(false)
    rerender(view('liquid_glass', false))
    await waitFor(() => expect(backing.classList.contains('glass-surface')).toBe(false))
    rerender(view('liquid_glass'))
    await waitFor(() => expect(backing.classList.contains('glass-surface')).toBe(true))
    rerender(view('classic'))
    expect(backing.classList.contains('glass-surface')).toBe(false)
  })

  it('keeps motion-off, plain and grouped descendants excluded unless an eligible pane explicitly declares static motion', async () => {
    const view = (staticBacking: boolean) => <><GlassControls style="liquid_glass" />
      <div data-glass-motion="off">
        <div data-testid="backing" data-glass-role="pill" data-glass-motion={staticBacking ? 'static' : undefined} />
        <button data-glass-role="regular">自有运动按钮</button>
        <div data-testid="plain" data-glass-role="regular" data-glass-motion="static" data-glass-plain />
        <div data-glass-group="true"><div data-testid="group-child" data-glass-role="pill" data-glass-motion="static" /></div>
      </div>
    </>
    const { rerender } = render(view(true))
    const backing = screen.getByTestId('backing')
    expect(backing.classList.contains('glass-surface')).toBe(true)
    for (const element of [screen.getByRole('button'), screen.getByTestId('plain'), screen.getByTestId('group-child')]) {
      expect(element.matches('.glass-control,.glass-surface')).toBe(false)
    }
    rerender(view(false))
    await waitFor(() => expect(backing.classList.contains('glass-surface')).toBe(false))
  })

  it('preserves native absolute and fixed carriers across glass and classic modes', () => {
    installStyles(globalStyles, interactionStyles, '.fixed-static-pane {position:fixed;}', glassStyles)
    const view = (style: 'classic' | 'liquid_glass') => <><GlassControls style={style} />
      <div data-testid="week" className="week-controls" data-glass-role="regular" data-glass-group="true" />
      <div data-testid="actions" className="float-actions" data-glass-role="regular" data-glass-group="true" />
      <div data-testid="quick-add" className="floating-course" data-glass-role="tinted" data-glass-group="true" />
      <div data-testid="static-pane" className="fixed-static-pane" data-glass-role="regular" data-glass-motion="static" />
    </>
    const { rerender } = render(view('classic'))
    for (const mode of ['liquid_glass', 'classic', 'liquid_glass'] as const) {
      rerender(view(mode))
      for (const [id, position] of [['week', 'absolute'], ['actions', 'fixed'], ['quick-add', 'fixed'], ['static-pane', 'fixed']]) {
        const element = screen.getByTestId(id)
        expect(getComputedStyle(element).position, `${id} in ${mode}`).toBe(position)
        expect(element.matches('.glass-control,.glass-surface')).toBe(mode === 'liquid_glass')
      }
    }
  })

  it('anchors icon and menu pseudo-elements without overriding positioned native carriers', () => {
    installStyles(glassStyles, '.native-fixed {position:fixed;} .native-absolute {position:absolute;}')
    render(<><GlassControls style="liquid_glass" />
      <button data-testid="flow-icon" data-glass-role="regular" data-glass-icon="true"><svg /></button>
      <div data-testid="flow-menu" data-glass-role="menu" data-glass-motion="static" />
      <div data-testid="flow-alert" data-glass-role="alert" data-glass-motion="static" />
      <button data-testid="fixed-icon" className="native-fixed" data-glass-role="regular" data-glass-icon="true" />
      <div data-testid="fixed-menu" className="native-fixed" data-glass-role="menu" data-glass-motion="static" />
      <div data-testid="absolute-alert" className="native-absolute" data-glass-role="alert" data-glass-motion="static" />
    </>)
    for (const id of ['flow-icon', 'flow-menu', 'flow-alert']) expect(getComputedStyle(screen.getByTestId(id)).position).toBe('relative')
    for (const id of ['fixed-icon', 'fixed-menu']) expect(getComputedStyle(screen.getByTestId(id)).position).toBe('fixed')
    expect(getComputedStyle(screen.getByTestId('absolute-alert')).position).toBe('absolute')
    expect(getComputedStyle(screen.getByTestId('flow-icon').firstElementChild!).zIndex).toBe('1')
  })

  it('allows vertical touch scrolling from segmented controls and switches while retaining horizontal gesture ownership', () => {
    installStyles(globalStyles)
    const rules = Array.from(styleElements[0].sheet!.cssRules).filter((rule): rule is CSSStyleRule => 'selectorText' in rule)
    // jsdom omits touch-action from computed styles; inspect the parsed declarations.
    for (const selector of ['.segmented-track', '.switch-track']) {
      expect(rules.find(rule => rule.selectorText === selector)!.style.getPropertyValue('touch-action')).toBe('pan-y')
    }
    expect(rules.find(rule => rule.selectorText === '.navigation-track')!.style.getPropertyValue('touch-action')).toBe('none')
  })
})
