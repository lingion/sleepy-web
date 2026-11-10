import {useEffect,useRef,type RefObject} from 'react'
import {GlassPressMotion,Spring,haptic} from './physics'
import {installLensOptics} from './optics'

interface TrackSelection { index:number; count:number; inset:number; onSelect:(index:number)=>void }
/** A lens follows continuously; committing a destination belongs to physical release. */
export function useGlassLens(track:RefObject<HTMLElement|null>, selection?:TrackSelection) {
  const motion=useRef(new GlassPressMotion()),origin=useRef({x:0,y:0,side:32})
  const position=useRef(new Spring()), jelly=useRef(new Spring())
  const config=useRef(selection);config.current=selection
  const candidate=useRef(selection?.index ?? 0),previousCandidate=useRef(candidate.current)
  const optics=useRef<ReturnType<typeof installLensOptics>>()
  const frame=useRef(0),previous=useRef(0)
  const start=()=>{if(!frame.current)frame.current=requestAnimationFrame(render)}
  const render=(now:number)=>{
    const el=track.current
    if(!el) return
    const dt=previous.current ? (now-previous.current)/1000 : 1/60
    previous.current=now
    motion.current.tick(dt)
    position.current.tick(dt,motion.current.held?1024:246.74,motion.current.held?57.6:26.7)
    const velocity=position.current.velocity
    jelly.current.target=motion.current.held ? .24*Math.min(1,Math.abs(velocity)/2.4) : -.12*Math.min(1,Math.abs(velocity)/2.4)
    jelly.current.tick(dt,100,8)
    const lift=Math.max(0,Math.min(1.08,motion.current.lift.value))
    el.style.setProperty('--lens-x',`${motion.current.x.value}px`)
    el.style.setProperty('--lens-y',`${motion.current.y.value}px`)
    el.style.setProperty('--lens-lift',String(lift))
    el.style.setProperty('--lens-stretch',String(jelly.current.value*lift))
    if(config.current)el.style.setProperty('--lens-position',String(position.current.value))
    optics.current?.update(lift)
    if(motion.current.running || position.current.running || jelly.current.running) frame.current=requestAnimationFrame(render)
    else {frame.current=0;previous.current=0}
  }
  const isGlass=()=>document.documentElement.dataset.uiStyle==='liquid_glass'
  const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const targetAt=(x:number)=>{
    const c=config.current,r=track.current?.getBoundingClientRect()
    if(!c || !r)return
    const pitch=(r.width-2*c.inset)/c.count
    const target=Math.max(0,Math.min(c.count-1,(x-r.left-c.inset)/pitch-.5))
    candidate.current=Math.round(target)
    if(candidate.current!==previousCandidate.current){haptic();previousCandidate.current=candidate.current}
    position.current.target=target
    if(track.current)track.current.dataset.lensIndex=String(candidate.current)
  }
  const press=(x:number,y:number)=>{
    if(!isGlass()) return
    origin.current={x,y,side:track.current?.getBoundingClientRect().height ?? 32}
    motion.current.press();targetAt(x);haptic()
    if(!reduced())start()
  }
  const move=(x:number,y:number)=>{
    if(!motion.current.held)return
    motion.current.drag(x-origin.current.x,y-origin.current.y,origin.current.side)
    targetAt(x)
    if(!reduced())start()
  }
  const release=(cancel=false)=>{
    if(!motion.current.held) return
    motion.current.release()
    if(config.current){position.current.target=cancel?config.current.index:candidate.current;if(!cancel)config.current.onSelect(candidate.current)}
    if(!reduced())start()
  }
  useEffect(()=>{
    const el=track.current
    const lens=el?.matches('.int-range-thumb') ? el : el?.querySelector<HTMLElement>('.navigation-lens,.segment-lens,.switch-thumb,.single-glass-thumb')
    if(lens)optics.current=installLensOptics(lens)
    return()=>{cancelAnimationFrame(frame.current);frame.current=0;previous.current=0;optics.current?.destroy()}
  },[])
  useEffect(()=>{
    if(!selection || motion.current.held)return
    // Layout effects are unnecessary: the CSS fallback already has the initial index.
    if(!frame.current && !previous.current && !track.current?.style.getPropertyValue('--lens-position'))position.current.value=selection.index
    position.current.target=selection.index
    if(isGlass() && !reduced())start()
  },[selection?.index])
  return {press,move,release}
}
