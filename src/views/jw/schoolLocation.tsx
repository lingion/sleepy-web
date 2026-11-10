import { useRef, useState, useEffect } from 'react'
import { gunzipSync } from 'fflate'
import { useTranslation } from 'react-i18next'
import { SchoolDivider, SchoolRow } from './SchoolRows'
import boundariesUrl from './schoolCityBoundaries.bin.gz?url'
import { SCHOOLS, type SchoolInfo } from './schools'

type Area = { name: string; polygons: number[][][] }
/** Android SCB1 asset, either raw gzip or already decoded by the HTTP stack. */
export function parseCityBoundaries(bytes: Uint8Array): Area[] {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0, total = 0
  const int = () => { const n = view.getInt32(offset); offset += 4; return n }
  const count = (min: number, max: number) => { const n = int(); if (n < min || n > max) throw Error('城市边界数据无效'); return n }
  if (int() !== 0x53434231) throw Error('城市边界格式无效')
  const areas: Area[] = []
  for (let i = count(1, 10000); i > 0; i--) {
    const length = count(1, 256)
    if (offset + length > bytes.length) throw Error('城市边界数据不完整')
    const name = new TextDecoder().decode(bytes.subarray(offset, offset + length)); offset += length
    const polygons: number[][][] = []
    for (let p = count(1, 10000); p > 0; p--) {
      const rings: number[][] = []
      for (let r = count(1, 10000); r > 0; r--) {
        const n = count(3, 1000000); total += n
        if (total > 2000000) throw Error('城市边界过大')
        const points: number[] = []
        for (let j = 0; j < n; j++) { const x = int(), y = int(); if (Math.abs(x) > 1800000 || Math.abs(y) > 900000) throw Error('坐标无效'); points.push(x, y) }
        rings.push(points)
      }
      polygons.push(rings)
    }
    areas.push({name, polygons})
  }
  if (offset !== bytes.length) throw Error('城市边界存在多余数据')
  return areas
}
function contains(points: number[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const ax = points[j], ay = points[j+1], bx = points[i], by = points[i+1]
    const cross = (x-ax)*(by-ay)-(y-ay)*(bx-ax)
    if (Math.abs(cross)<1e-6 && x>=Math.min(ax,bx) && x<=Math.max(ax,bx) && y>=Math.min(ay,by) && y<=Math.max(ay,by)) return true
    if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside
  }
  return inside
}
export function cityAt(areas: Area[], lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return null
  return areas.find(a => a.name !== '台湾省' && a.polygons.some(r => contains(r[0],lon*10000,lat*10000) && !r.slice(1).some(h => contains(h,lon*10000,lat*10000))))?.name ?? null
}
export function cityForFix(areas: Area[], coords: Pick<GeolocationCoordinates,'latitude'|'longitude'|'accuracy'>): string | null {
  const {latitude:lat,longitude:lon,accuracy} = coords
  if (!Number.isFinite(accuracy) || accuracy<=0 || accuracy>10000) return null
  const city = cityAt(areas,lat,lon)
  const radius = accuracy/111320, longitudeRadius = radius/Math.max(0.01,Math.cos(lat*Math.PI/180))
  for (let i=0;i<8;i++) if (cityAt(areas,lat+radius*Math.sin(i*Math.PI/4),lon+longitudeRadius*Math.cos(i*Math.PI/4))!==city) return null
  return city
}
export function normalizeCity(city: string) { const s=city.trim().replace(/市$/, ''); return s==='昆山'?'苏州':s==='临夏州'?'临夏回族自治州':s }
export function schoolsInCity(city: string) { return SCHOOLS.filter(s => s.cities?.some(c=>normalizeCity(c)===normalizeCity(city))) }
let cachedAreas: Area[] | undefined
export function CityRecommendations({onPick}:{onPick:(s:SchoolInfo)=>void}) {
  const {t}=useTranslation()
  const [city,setCity]=useState(''), [status,setStatus]=useState(''), [loading,setLoading]=useState(false), [expanded,setExpanded]=useState(false)
  const [attempted,setAttempted]=useState(false)
  const alive=useRef(true), generation=useRef(0)
  useEffect(()=>{ alive.current=true; return ()=>{alive.current=false;generation.current++} },[])
  const schools=schoolsInCity(city)
  function locate() {
    const id=++generation.current
    const active=()=>alive.current&&id===generation.current
    setAttempted(true)
    if (!navigator.geolocation) {setStatus(t('school_location_unavailable')); return}
    setCity('');setExpanded(false);setLoading(true);setStatus(t('school_location_loading'))
    navigator.geolocation.getCurrentPosition(async position=>{
      try {
        if (!active()) return
        if (Date.now()-position.timestamp>30000) throw Error(t('school_location_no_fix'))
        if (!cachedAreas) { const response=await fetch(boundariesUrl,{credentials:'omit'}); if(!response.ok)throw Error(t('school_location_unavailable')); cachedAreas=parseCityBoundaries(new Uint8Array(await response.arrayBuffer())) }
        if (!active()) return
        const found=cityForFix(cachedAreas,position.coords)
        if (!found) throw Error(t('school_location_accuracy_insufficient'))
        setCity(found);setStatus(found);setExpanded(false)
      } catch(e) {if(active())setStatus(e instanceof Error?e.message:t('school_location_unavailable'))}
      finally {if(active())setLoading(false)}
    },error=>{if(active()){setStatus(t(error.code===1?'school_location_denied':'school_location_no_fix'));setLoading(false)}},{enableHighAccuracy:false,maximumAge:30000,timeout:12000})
  }
  return <section className="jw-possible-schools">
    <div className="jw-possible-schools-header">
      <div className="jw-possible-schools-copy">
        <h2 className="m3-title-medium">{t('possible_schools')}</h2>
        <p role="status" className="m3-body-small">{status || t('school_location_hint')}{city ? ` · ${schools.length}` : ''}</p>
      </div>
      <button type="button" className="m3-button-text" disabled={loading} onClick={locate}>
        {loading?t('loading'):t(attempted?'school_location_retry':'school_location_locate')}
      </button>
    </div>
    {city && <p className="jw-recommendation-hint m3-body-small">{t(schools.length?'school_location_city_hint':'school_location_no_matches')}</p>}
    <div className="jw-recommended-list" role="listbox" aria-label={t('possible_schools')} data-expanded={expanded}>
      {(expanded?schools:schools.slice(0,5)).map(s=><div key={s.catalogId||`${s.sortKey}_${s.name}`}><SchoolRow school={s} onPick={()=>onPick(s)} /><SchoolDivider /></div>)}
    </div>
    {schools.length>5&&<button type="button" className="m3-button-text" onClick={()=>setExpanded(v=>!v)}>{t(expanded?'school_location_collapse':'school_location_show_all')}</button>}
  </section>
}
