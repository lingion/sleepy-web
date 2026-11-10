import {useEffect,useRef,type RefObject} from 'react'
import {GlassPressMotion} from './physics'

/** Move the complete lens, independently of its selected position on the track. */
export function useGlassLens(track:RefObject<HTMLElement|null>) {
  const motion=useRef(new GlassPressMotion()),origin=useRef({x:0,y:0,side:32})
  const frame=useRef(0),previous=useRef(0)
  const render=(now:number)=>{
    const el=track.current
    if(!el) return
    const dt=previous.current ? (now-previous.current)/1000 : 1/60
    previous.current=now
    motion.current.tick(dt)
    el.style.setProperty('--lens-x',`${motion.current.x.value}px`)
    el.style.setProperty('--lens-y',`${motion.current.y.value}px`)
    el.style.setProperty('--lens-lift',String(Math.max(0,Math.min(1.08,motion.current.lift.value))))
    if(motion.current.running) frame.current=requestAnimationFrame(render)
    else {frame.current=0;previous.current=0}
  }
  const press=(x:number,y:number)=>{
    if(document.documentElement.dataset.uiStyle!=='liquid_glass' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    origin.current={x,y,side:track.current?.getBoundingClientRect().height ?? 32}
    motion.current.press()
    if(!frame.current) frame.current=requestAnimationFrame(render)
  }
  const move=(x:number,y:number)=>{
    motion.current.drag(x-origin.current.x,y-origin.current.y,origin.current.side)
    if(motion.current.held && !frame.current) frame.current=requestAnimationFrame(render)
  }
  const release=()=>{
    if(!motion.current.held) return
    motion.current.release()
    if(!frame.current) frame.current=requestAnimationFrame(render)
  }
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[])
  return {press,move,release}
}
