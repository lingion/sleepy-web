import {describe,it,expect} from 'vitest'
import {lensNormals} from './optics'
describe('lens background sampling map',()=>{
  it('bends opposite edges in opposite directions and keeps an opaque neutral center',()=>{
    const width=80,height=40,data=lensNormals(width,height,18)
    const sample=(x:number,y:number)=>Array.from(data.slice((y*width+x)*4,(y*width+x)*4+4))
    expect(sample(1,20)[0]).toBeGreaterThan(200)
    expect(sample(78,20)[0]).toBeLessThan(55)
    expect(sample(40,1)[1]).toBeGreaterThan(200)
    expect(sample(40,38)[1]).toBeLessThan(55)
    expect(sample(40,20)[0]).toBeGreaterThan(120)
    expect(sample(40,20)[0]).toBeLessThan(135)
    expect(sample(40,20)[3]).toBe(255)
  })
})
