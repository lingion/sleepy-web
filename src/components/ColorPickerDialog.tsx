import './ColorPickerDialog.css'
import { useRef,useState,type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { parseHex,rgbToHex } from '../domain/courseColor'
import { AlertDialog } from './AlertDialog'
import { DialogActionButtons } from './DialogActionButtons'
import { useGlassLens } from './glass/useGlassLens'

type RGB=[number,number,number]
export function rgbToHsv([red,green,blue]:RGB):RGB {
 const r=red/255,g=green/255,b=blue/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min
 let h=0
 if(d) {h=(max===r ? ((g-b)/d)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4)*60;if(h<0)h+=360}
 return [h,max ? d/max : 0,max]
}
export function hsvToRgb(h:number,s:number,v:number):RGB {
 h=((h%360)+360)%360
 const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c
 const rgb=h<60 ? [c,x,0] : h<120 ? [x,c,0] : h<180 ? [0,c,x] : h<240 ? [0,x,c] : h<300 ? [x,0,c] : [c,0,x]
 return rgb.map(n=>Math.round(Math.min(1,Math.max(0,n+m))*255)) as RGB
}
const clamp=(n:number)=>Math.max(0,Math.min(1,n))
function point(event:PointerEvent<HTMLElement>) {const r=event.currentTarget.getBoundingClientRect();return {x:clamp((event.clientX-r.left)/Math.max(1,r.width)),y:clamp((event.clientY-r.top)/Math.max(1,r.height))}}

/** Android ColorPickerDialog.kt: SV drag, 48px hue slider and the opening hue ghost. */
export function ColorPickerDialog({initialHex,onConfirm,onDismiss}:{initialHex:string;onConfirm:(hex:string)=>void;onDismiss:()=>void}) {
 const {t}=useTranslation()
 const [initial]=useState(()=>rgbToHsv(parseHex(initialHex) ?? [103,80,164]))
 const [[hue,saturation,value],setHsv]=useState<RGB>(initial)
 const svPointer=useRef<number|null>(null),huePointer=useRef<number|null>(null)
 const hueTrack=useRef<HTMLDivElement>(null),lens=useGlassLens(hueTrack)
 const currentHex=`#FF${rgbToHex(hsvToRgb(hue,saturation,value)).slice(1).toUpperCase()}`
 const changeSV=(event:PointerEvent<HTMLElement>)=>{const p=point(event);setHsv(([h])=>[h,p.x,1-p.y])}
 const changeHue=(event:PointerEvent<HTMLElement>)=>{const p=point(event);setHsv(([,s,v])=>[p.x*360,s,v])}
 const finishHue=()=>{huePointer.current=null;lens.release()}
 return <AlertDialog title={t('course_color')} onDismiss={onDismiss}>
  <div className="color-picker">
   <div className="color-sv" role="group" aria-label={t('color_sv','饱和度和明度')} style={{backgroundColor:rgbToHex(hsvToRgb(hue,1,1))}}
    onPointerDown={event=>{if(event.button!==0)return;svPointer.current=event.pointerId;event.currentTarget.setPointerCapture?.(event.pointerId);changeSV(event)}}
    onPointerMove={event=>{if(svPointer.current===event.pointerId)changeSV(event)}}
    onPointerUp={()=>{svPointer.current=null}} onPointerCancel={()=>{svPointer.current=null}}>
    <span className="color-sv-white"/><span className="color-sv-black"/>
    <span aria-hidden className="color-sv-marker" style={{left:`${saturation*100}%`,top:`${(1-value)*100}%`}}/>
    <input className="color-picker-keyboard" type="range" min={0} max={1} step={.01} value={saturation} aria-label={t('color_saturation','饱和度')} onChange={event=>setHsv(([h,,v])=>[h,Number(event.target.value),v])}/>
    <input className="color-picker-keyboard" type="range" min={0} max={1} step={.01} value={value} aria-label={t('color_value','明度')} onChange={event=>setHsv(([h,s])=>[h,s,Number(event.target.value)])}/>
   </div>
   <div ref={hueTrack} className="color-hue" data-glass-motion="off" role="slider" tabIndex={0} aria-label={t('color_hue','色相')} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hue)}
    onPointerDown={event=>{if(event.button!==0)return;huePointer.current=event.pointerId;event.currentTarget.setPointerCapture?.(event.pointerId);lens.press(event.clientX,event.clientY);changeHue(event)}}
    onPointerMove={event=>{if(huePointer.current===event.pointerId){changeHue(event);lens.move(event.clientX,event.clientY)}}}
    onPointerUp={finishHue} onPointerCancel={finishHue}
    onKeyDown={event=>{
     const next=event.key==='Home' ? 0 : event.key==='End' ? 360 : ['ArrowRight','ArrowUp','PageUp'].includes(event.key) ? Math.min(360,hue+(event.key==='PageUp' ? 10 : 1)) : ['ArrowLeft','ArrowDown','PageDown'].includes(event.key) ? Math.max(0,hue-(event.key==='PageDown' ? 10 : 1)) : null
     if(next!==null){event.preventDefault();setHsv(([,s,v])=>[next,s,v])}
    }}>
    {Math.abs(hue-initial[0])>.5 && <span aria-hidden data-hue-ghost className="color-hue-ghost" style={{left:`${initial[0]/360*100}%`}}/>}
    <span aria-hidden className="color-hue-thumb" style={{left:`${hue/360*100}%`,backgroundColor:rgbToHex(hsvToRgb(hue,1,1))}}/>
   </div>
   <div className="color-picker-preview"><span aria-hidden style={{backgroundColor:rgbToHex(hsvToRgb(hue,saturation,value))}}/><output>{currentHex}</output></div>
   <DialogActionButtons confirmText={t('ok')} onConfirm={()=>onConfirm(currentHex)} dismissText={t('cancel')} onDismiss={onDismiss}/>
  </div>
 </AlertDialog>
}
