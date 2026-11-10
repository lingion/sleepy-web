import { useEffect } from 'react'
import { GlassPressMotion, haptic } from './physics'
import { getPreparedGlassRuntime } from './runtime'
import type { LensOpticsController } from './optics'
import type { GlassStyleRole } from './styles'

const selector = '[data-glass-role]'
const roles = new Set<GlassStyleRole>(['regular','tinted','pill','menu','alert'])
/** Only native-equivalent declarations opt in. HTML semantics never choose a material. */
export function GlassControls({ style }: { style: 'classic' | 'liquid_glass' }) {
  useEffect(() => {
    const runtime = style === 'liquid_glass' ? getPreparedGlassRuntime() : undefined
    document.documentElement.dataset.uiStyle = style
    if (!runtime) return
    const { installLensOptics } = runtime
    const enhanced = new Map<HTMLElement,{ signature:string; optics:LensOpticsController }>()
    const motions = new Map<HTMLElement,GlassPressMotion>()
    const pointers = new Map<number,{ element:HTMLElement; x:number; y:number; side:number }>()
    const clear = (el:HTMLElement) => {
      enhanced.get(el)?.optics.destroy(); enhanced.delete(el); motions.delete(el)
      for(const [id,pointer] of pointers) if(pointer.element===el) pointers.delete(id)
      el.classList.remove('glass-control','glass-surface','glass-moving')
      for(const name of ['--glass-lift','--glass-x','--glass-y','--glass-scale-x','--glass-scale-y']) el.style.removeProperty(name)
    }
    const enhance = (el:HTMLElement) => {
      const role=el.dataset.glassRole as GlassStyleRole
      const group=el.closest<HTMLElement>('[data-glass-group="true"]')
      // A static backing still opts into optics inside a track that owns its motion.
      const motionBlocked=el.dataset.glassMotion!=='static' && el.closest('[data-glass-motion="off"]')
      if(!roles.has(role) || el.hasAttribute('data-glass-plain') || group && group!==el || motionBlocked) { if(enhanced.has(el)) clear(el); return }
      const signature=[role,el.dataset.glassTint,el.dataset.glassIcon,el.dataset.glassMotion,el.dataset.glassSelected,el.hasAttribute('disabled'),el.getAttribute('aria-disabled'),document.documentElement.dataset.mode,document.documentElement.dataset.theme,document.documentElement.getAttribute('style')].join('|')
      const current=enhanced.get(el)
      if(current?.signature===signature) return
      const options={role,size:el.dataset.glassIcon==='true'?{width:36,height:36}:undefined,borderRadius:el.dataset.glassIcon==='true'?18:undefined}
      const optics=current?.optics??installLensOptics(el,options)
      if(current)optics.configure(options)
      enhanced.set(el,{signature,optics})
      const moving=el.dataset.glassMotion!=='static' && role!=='menu' && role!=='alert'
      el.classList.toggle('glass-control',moving); el.classList.toggle('glass-surface',!moving)
    }
    const scan=(node:Node)=>{
      if(!(node instanceof Element)) return
      if(node.matches(selector) || enhanced.has(node as HTMLElement)) enhance(node as HTMLElement)
      node.querySelectorAll<HTMLElement>(selector).forEach(enhance)
    }
    scan(document.body)
    const observer=new MutationObserver(records=>{
      for(const record of records) {
        if(record.target===document.documentElement) { for(const el of [...enhanced.keys()]) enhance(el) }
        else if(record.type==='attributes') scan(record.target)
        else record.addedNodes.forEach(scan)
      }
      for(const el of enhanced.keys()) if(!el.isConnected) clear(el)
    })
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-glass-role','data-glass-tint','data-glass-icon','data-glass-group','data-glass-motion','data-glass-selected','data-glass-plain','disabled','aria-disabled']})
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['style','data-mode','data-theme']})
    let frame=0,last=0
    const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const paint=(el:HTMLElement,m:GlassPressMotion)=>{
      const lift=Math.max(0,Math.min(1,m.lift.value))
      const width=el.dataset.glassIcon==='true'?36:el.offsetWidth, height=el.dataset.glassIcon==='true'?36:el.offsetHeight
      const swell=1+Math.min(.25,16/Math.max(1,width,height))*lift
      el.style.setProperty('--glass-lift',String(lift))
      el.style.setProperty('--glass-x',`${m.x.value}px`); el.style.setProperty('--glass-y',`${m.y.value}px`)
      el.style.setProperty('--glass-scale-x',String(swell*(1+Math.abs(m.x.value)/Math.max(1,width)*.5)))
      el.style.setProperty('--glass-scale-y',String(swell*(1+Math.abs(m.y.value)/Math.max(1,height)*.5)))
    }
    const render=(now:number)=>{
      const dt=last?(now-last)/1000:1/60;last=now
      for(const [el,motion] of motions) {
        motion.tick(dt);paint(el,motion)
        if(!motion.running && !motion.held) {el.classList.remove('glass-moving');motions.delete(el)}
      }
      frame=motions.size?requestAnimationFrame(render):0
      if(!frame)last=0
    }
    const down=(e:PointerEvent)=>{
      if(e.button!==0 || !(e.target instanceof Element)) return
      const el=e.target.closest<HTMLElement>('.glass-control')
      if(!el || el.matches(':disabled,[aria-disabled="true"]') || e.target.closest(':disabled,[aria-disabled="true"]')) return
      const rect=el.getBoundingClientRect(), motion=motions.get(el)??new GlassPressMotion()
      pointers.set(e.pointerId,{element:el,x:e.clientX,y:e.clientY,side:Math.min(rect.width,rect.height)})
      motion.press();motions.set(el,motion);el.classList.add('glass-moving');haptic()
      if(reduced()){motion.finish();paint(el,motion)}else if(!frame)frame=requestAnimationFrame(render)
    }
    const move=(e:PointerEvent)=>{
      const pointer=pointers.get(e.pointerId)
      if(pointer && !reduced())motions.get(pointer.element)?.drag(e.clientX-pointer.x,e.clientY-pointer.y,pointer.side)
    }
    const up=(e:PointerEvent)=>{
      const pointer=pointers.get(e.pointerId)
      if(!pointer)return
      pointers.delete(e.pointerId)
      const motion=motions.get(pointer.element)
      motion?.release()
      if(reduced() && motion){motion.finish();paint(pointer.element,motion);pointer.element.classList.remove('glass-moving');motions.delete(pointer.element)}
      else if(!frame)frame=requestAnimationFrame(render)
    }
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true)
    document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true)
    return()=>{
      observer.disconnect();cancelAnimationFrame(frame)
      for(const el of [...enhanced.keys()])clear(el)
      document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true)
      document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true)
    }
  },[style])
  return null
}
