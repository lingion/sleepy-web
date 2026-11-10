import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'fflate'
import { cityAt, cityForFix, parseCityBoundaries, schoolsInCity, normalizeCity } from './schoolLocation'
const asset=readFileSync(`${__dirname}/schoolCityBoundaries.bin.gz`)
const areas=parseCityBoundaries(gunzipSync(asset))
it('边界读取同时支持原始压缩资产和浏览器已解码的HTTP正文',()=>{
  expect(cityAt(parseCityBoundaries(asset),39.9042,116.4074)).toBe('北京市')
  expect(cityAt(parseCityBoundaries(gunzipSync(asset)),39.9042,116.4074)).toBe('北京市')
  expect(()=>parseCityBoundaries(new Uint8Array([31,139,8]))).toThrow()
})
it('真实Android离线边界匹配北京、哈尔滨，境外和非城市不猜最近中心',()=>{
  expect(cityAt(areas,39.9042,116.4074)).toBe('北京市')
  expect(cityAt(areas,45.8038,126.5349)).toBe('哈尔滨市')
  expect(cityAt(areas,37.7749,-122.4194)).toBeNull()
  expect(cityAt(areas,NaN,0)).toBeNull()
})
it('精度不足拒绝，优质定位匹配，同城元数据保留跨城校区',()=>{
  expect(cityForFix(areas,{latitude:39.9042,longitude:116.4074,accuracy:15000})).toBeNull()
  expect(cityForFix(areas,{latitude:39.9042,longitude:116.4074,accuracy:100})).toBe('北京市')
  expect(schoolsInCity('青岛').some(s=>s.name==='哈尔滨工程大学')).toBe(true)
  expect(normalizeCity('昆山市')).toBe('苏州')
})
it('损坏的边界文件拒绝',()=>expect(()=>parseCityBoundaries(new Uint8Array(12))).toThrow())
