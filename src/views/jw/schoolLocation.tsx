import { useRef, useState, useEffect } from 'react'
import { gunzipSync } from 'fflate'
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
  const [city,setCity]=useState(''), [status,setStatus]=useState('点击定位，查找同城学校'), [loading,setLoading]=useState(false), [expanded,setExpanded]=useState(false)
  const alive=useRef(true), generation=useRef(0)
  useEffect(()=>{ alive.current=true; return ()=>{alive.current=false;generation.current++} },[])
  const schools=schoolsInCity(city)
  function locate() {
    const id=++generation.current
    const active=()=>alive.current&&id===generation.current
    if (!navigator.geolocation) {setStatus('当前浏览器不支持定位，请搜索学校'); return}
    setLoading(true);setStatus('正在定位城市')
    navigator.geolocation.getCurrentPosition(async position=>{
      try {
        if (!active()) return
        if (Date.now()-position.timestamp>30000) throw Error('定位结果已过期，请重试')
        if (!cachedAreas) { const response=await fetch(boundariesUrl,{credentials:'omit'}); if(!response.ok)throw Error('城市边界读取失败'); cachedAreas=parseCityBoundaries(new Uint8Array(await response.arrayBuffer())) }
        if (!active()) return
        const found=cityForFix(cachedAreas,position.coords)
        if (!found) throw Error('定位精度不足或暂无城市边界，请搜索学校')
        setCity(found);setStatus(found);setExpanded(false)
      } catch(e) {if(active())setStatus(e instanceof Error?e.message:'定位失败，请搜索学校')}
      finally {if(active())setLoading(false)}
    },error=>{if(active()){setStatus(error.code===1?'定位权限被拒绝，请在浏览器设置中允许或搜索学校':'未获取到定位，请重试或搜索学校');setLoading(false)}},{enableHighAccuracy:false,maximumAge:30000,timeout:12000})
  }
  return <div className="m3-card" style={{padding:12,border:'1px solid var(--md-outline-variant)'}}>
    <div className="m3-title-small">可能的学校</div><p role="status">{status}{city ? `，${schools.length} 所学校` : ''}</p>
    <button type="button" className="m3-btn-regular" disabled={loading} onClick={locate}>{loading?'定位中':'定位城市'}</button>
    {(expanded?schools:schools.slice(0,3)).map(s=><button type="button" className="m3-btn-regular" key={s.catalogId||`${s.sortKey}_${s.name}`} onClick={()=>onPick(s)}>{s.name}</button>)}
    {schools.length>3&&<button type="button" className="m3-btn-regular" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开全部'}</button>}
  </div>
}
