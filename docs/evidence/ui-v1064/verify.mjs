import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const origin=process.env.UI_ORIGIN ?? 'http://127.0.0.1:5198/sleepy-web/'
const output=process.env.UI_EVIDENCE_DIR ?? '/tmp/sleepy-ui-v1064-evidence'
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/Applications/Chromium.app/Contents/MacOS/Chromium',headless:true})
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true})
const page=await context.newPage();page.setDefaultTimeout(8000)
const results={source:'Android v1.0.64 77b878fd5c8903a3f201ea938b3b152de4c4fbc0',webCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),verifiedAt:new Date().toISOString(),browser:await browser.version(),origin,errors:[],toolbar:[]}
page.on('pageerror',error=>results.errors.push(error.message))
const shot=name=>page.screenshot({path:`${output}/${name}.png`})
const prefs=patch=>page.evaluate(async patch=>{
 const name=performance.getEntriesByType('resource').find(r=>r.name.includes('/src/state/prefsStore.ts'))?.name
 const {usePrefsStore}=await import(name ?? new URL('src/state/prefsStore.ts',location.href).href)
 await usePrefsStore.getState().update(patch)
},patch)
const lensMeasure=track=>track.evaluate(element=>{
 const lens=element.querySelector('.navigation-lens,.segment-lens,.switch-thumb')
 const r=element.getBoundingClientRect(),l=lens.getBoundingClientRect()
 return {x:parseFloat(element.style.getPropertyValue('--lens-x')||0),y:parseFloat(element.style.getPropertyValue('--lens-y')||0),top:l.top-r.top,bottom:l.bottom-r.bottom,edge:getComputedStyle(lens,'::after').backgroundImage}
})
const holdLens=async (track,screenshot)=>{
 await track.scrollIntoViewIfNeeded();const r=await track.boundingBox()
 await page.mouse.move(r.x+r.width/8,r.y+r.height/2);await page.mouse.down()
 await page.waitForFunction(el=>Number(el.style.getPropertyValue('--lens-lift'))>.97,await track.elementHandle())
 const held=await lensMeasure(track);assert(held.top<0 && held.bottom>0,JSON.stringify(held))
 await page.mouse.move(r.x+r.width/8+12,r.y+r.height/2-8)
 await page.waitForFunction(el=>parseFloat(el.style.getPropertyValue('--lens-x'))>1 && parseFloat(el.style.getPropertyValue('--lens-y'))< -1,await track.elementHandle())
 const drag=await lensMeasure(track);if(screenshot)await shot(screenshot);await page.mouse.up()
 await page.waitForFunction(el=>Number(el.style.getPropertyValue('--lens-lift'))===0,await track.elementHandle())
 return {held,drag}
}
try {
 await page.goto(origin);await page.getByRole('navigation',{name:'主导航'}).waitFor()
 await page.evaluate(async()=>{
  const base=new URL('.',location.href)
  const {db}=await import(new URL('src/data/db.ts',base).href)
  const {DEFAULT_TIME_JSON}=await import(new URL('src/domain/timeTable.ts',base).href)
  await db.timetables.toCollection().modify(t=>{t.isDefault=0})
  await db.timetables.put({id:31,name:'UI验收课表',isDefault:1,startDate:'2026-11-09',maxWeek:20,nodeCount:12,smartConfigJson:'',timeJson:DEFAULT_TIME_JSON,createdAt:1})
  await db.courses.put({id:1001,groupId:'fixture',tableId:31,courseName:'数学分析',teacher:'老师',room:'A201',note:'',alias:'',day:2,startNode:1,step:2,startWeek:1,endWeek:20,type:0,color:'#FFB4D4F3',colorMode:2,ownTime:false,isIrregularNode:false,isIrregularTime:false,startTime:'',endTime:'',credit:0,level:0})
  const {undoManager}=await import(performance.getEntriesByType('resource').find(r=>r.name.includes('/src/data/undoStore.ts'))?.name ?? new URL('src/data/undoStore.ts',base).href)
  await undoManager.capture('browser fixture');await db.courses.update(1001,{room:'A202'})
  await undoManager.capture('browser fixture');await db.courses.update(1001,{room:'A203'});await undoManager.undo()
 })
 await prefs({startView:'cards',navDock:true,uiStyle:'classic',visibleDays:[1,2,3,4,5,6,7],gridLongBreakSpacing:true,themeMode:'light'})
 await page.locator('[data-schedule-week="1"] [data-course-id="1001"]').waitFor()
 await page.getByRole('button',{name:'撤回',exact:true}).waitFor()
 for(const style of ['classic','liquid_glass']) {
  await prefs({uiStyle:style})
  for(const width of [280,320,360,390,768]) {
   await page.setViewportSize({width,height:844})
   await page.waitForFunction(()=>document.querySelector('.schedule-toolbar')?.clientWidth===innerWidth)
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   const record=await page.locator('.schedule-toolbar').evaluate(root=>{
    const r=e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width}}
    return {style:document.documentElement.dataset.uiStyle,width:innerWidth,grouped:root.dataset.grouped,start:r(root.children[0]),center:r(root.children[1]),end:r(root.children[2]),text:root.querySelector('[data-week-text]').textContent,overflow:document.documentElement.scrollWidth-innerWidth,undoOverflow:getComputedStyle(root.querySelector('[aria-label="撤回"]').parentElement).overflow}
   })
   assert(Math.abs((record.center.left+record.center.right)/2-width/2)<.6,JSON.stringify(record))
   assert(record.start.right<=record.center.left+.6 && record.center.right<=record.end.left+.6,JSON.stringify(record))
   assert(record.start.left>=-.5 && record.end.right<=width+.5 && record.overflow<=.5,JSON.stringify(record))
   assert.match(record.text,/第.*1.*周/);assert.equal(record.undoOverflow,'visible')
   results.toolbar.push(record)
   if(width===768 && style==='classic') {
    results.classicIcon=await page.locator('.schedule-icon-button').first().evaluate(el=>({target:el.offsetWidth,disc:parseFloat(getComputedStyle(el,'::before').width),fill:getComputedStyle(el,'::before').backgroundColor}))
    assert.equal(results.classicIcon.target,48);assert.equal(results.classicIcon.disc,32);assert.notEqual(results.classicIcon.fill,'rgba(0, 0, 0, 0)')
   }
   const dayLines=await page.locator('[data-schedule-week="1"] [data-day-header] > span:first-child').evaluateAll(elements=>elements.map(el=>({text:el.textContent,height:el.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(el).lineHeight)})))
   assert.equal(dayLines.length,7);assert(dayLines.every(line=>line.height<=line.lineHeight+.5),JSON.stringify(dayLines))
   if(width===320)await shot(`${style}-320-undo`)
  }
 }
 await page.setViewportSize({width:390,height:844});await prefs({uiStyle:'classic'})
 const card=page.locator('[data-schedule-week="1"] [data-course-id="1001"]')
 const rect=await card.boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2
 const snapshot=()=>page.evaluate(async()=>{
  const dbUrl=performance.getEntriesByType('resource').find(r=>r.name.includes('/src/data/db.ts')).name
  const undoUrl=performance.getEntriesByType('resource').find(r=>r.name.includes('/src/data/undoStore.ts')).name
  const {db}=await import(dbUrl),{useUndoStore}=await import(undoUrl),state=useUndoStore.getState()
  return {courses:await db.courses.toArray(),tables:await db.timetables.toArray(),undo:state.undoStack.length,redo:state.redoStack.length}
 })
 const baseline=await snapshot()
 await page.mouse.move(x,y);await page.mouse.down();await page.getByTestId('floating-course').waitFor()
 await page.mouse.move(x+9,y+1);await page.mouse.up();await page.getByTestId('floating-course').waitFor({state:'hidden'})
 assert.deepEqual(await snapshot(),baseline);results.inPlace={databaseUnchanged:true,undoUnchanged:true}
 const cdp=await context.newCDPSession(page)
 await page.evaluate(()=>{window.uiTouchCancels=0;document.addEventListener('pointercancel',()=>window.uiTouchCancels++)})
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
 await page.getByTestId('floating-course').waitFor()
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+2,y:y+65}]})
 await page.locator('.course-drop-preview').waitFor()
 await shot('classic-floating-course')
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await page.getByRole('dialog',{name:'挪动本次课程'}).waitFor()
 results.touch={pointerCancels:await page.evaluate(()=>window.uiTouchCancels),confirmation:await page.getByRole('dialog').innerText()}
 assert.equal(results.touch.pointerCancels,0)
 await page.getByRole('button',{name:'返回修改'}).click();await page.getByRole('button',{name:'完成',exact:true}).click()
 await page.mouse.move(x,y);await page.mouse.down();await page.getByTestId('floating-course').waitFor();await page.mouse.up()
 await page.getByRole('button',{name:'调整本次',exact:true}).click()
 await page.getByLabel('教室或地点').waitFor();await page.getByRole('button',{name:'取消',exact:true}).click()
 results.explicitAdjust={openedFormDirectly:true}
 await page.mouse.move(x,y);await page.mouse.down();await page.getByTestId('floating-course').waitFor();await page.mouse.up()
 const handle=page.getByRole('button',{name:'调整结束节次'}),h=await handle.boundingBox()
 const third=await page.locator('[data-grid-week="1"]').evaluate(el=>{const r=el.getBoundingClientRect(),row=JSON.parse(el.dataset.gridRows).find(row=>row.node===3);return{y:r.top+row.y+2}})
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2,third.y);await page.mouse.up()
 await page.getByRole('button',{name:'确认调整',exact:true}).click();await page.getByRole('dialog',{name:'调整持续节次'}).waitFor()
 results.resize=await page.getByRole('dialog').innerText();assert.match(results.resize,/1–3/)
 await page.getByRole('button',{name:'返回修改'}).click();await page.getByRole('button',{name:'完成',exact:true}).click()
 await page.mouse.move(x,y);await page.mouse.down();await page.getByTestId('floating-course').waitFor();await page.mouse.move(386,y+10)
 await page.waitForFunction(()=>document.querySelector('[data-week-text]')?.textContent.includes('2'))
 await page.mouse.move(300,y+10);await page.mouse.up();await page.getByRole('dialog',{name:'挪动本次课程'}).waitFor()
 results.crossWeek=await page.evaluate(async()=>{const start=performance.now(),before=document.querySelector('[data-week-text]').textContent;await new Promise(resolve=>{const tick=()=>performance.now()-start>1300 ? resolve() : requestAnimationFrame(tick);requestAnimationFrame(tick)});return{before,after:document.querySelector('[data-week-text]').textContent}})
 assert.equal(results.crossWeek.before,results.crossWeek.after)
 await page.getByRole('button',{name:'返回修改'}).click();await page.getByRole('button',{name:'完成',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('[data-week-text]')?.textContent.includes('1'))
 await prefs({uiStyle:'liquid_glass'})
 const icon=page.locator('.schedule-toolbar [data-glass-icon]').first()
 await page.setViewportSize({width:768,height:844})
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const iconMeasure=()=>icon.evaluate(el=>{const r=el.getBoundingClientRect(),disc=getComputedStyle(el,'::before');return{x:r.x,y:r.y,width:r.width,height:r.height,discWidth:parseFloat(disc.width),discHeight:parseFloat(disc.height),xMotion:parseFloat(el.style.getPropertyValue('--glass-x')||0),yMotion:parseFloat(el.style.getPropertyValue('--glass-y')||0)}})
 const iconRest=await iconMeasure(),ir=await icon.boundingBox()
 assert.equal(iconRest.width,48);assert.equal(iconRest.discWidth,36);assert.equal(iconRest.discHeight,36)
 await page.mouse.move(ir.x+24,ir.y+24);await page.mouse.down();await page.mouse.move(ir.x+36,ir.y+15)
 await page.waitForFunction(el=>parseFloat(el.style.getPropertyValue('--glass-x'))>1 && parseFloat(el.style.getPropertyValue('--glass-y'))< -1,await icon.elementHandle())
 const iconHeld=await iconMeasure();assert.equal(iconHeld.x,iconRest.x);assert.equal(iconHeld.y,iconRest.y)
 results.icon={rest:iconRest,held:iconHeld}
 // Release away from the target so the optical check does not open its action.
 await page.mouse.move(700,400);await page.mouse.up()
 await page.waitForFunction(el=>!el.classList.contains('glass-moving'),await icon.elementHandle())
 await page.setViewportSize({width:390,height:844})
 results.navigation=await holdLens(page.locator('.navigation-track'),'glass-navigation-held')
 const grid=page.locator('[data-grid-week="1"]')
 const blank=await grid.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+Number(el.dataset.gridTime)+Number(el.dataset.gridGap)+4.5*(Number(el.dataset.gridCol)+Number(el.dataset.gridGap)),y:r.y+120}})
 await page.mouse.move(blank.x,blank.y);await page.mouse.down();await page.getByTestId('quick-add-capsule').waitFor();await page.mouse.up()
 await page.getByRole('button',{name:'添加选中时段课程'}).click();await page.getByRole('heading',{name:'添加本次课程'}).waitFor()
 await page.getByLabel(/备注/).fill('第一行\n第二行')
 results.switch=await holdLens(page.getByRole('switch',{name:'自定义颜色'}))
 await shot('glass-quick-form-final')
 await page.getByRole('button',{name:'更多设置'}).click()
 assert.equal(await page.getByLabel(/备注/).inputValue(),'第一行\n第二行')
 results.segment=await holdLens(page.locator('.segmented-track').first())
 await page.getByRole('button',{name:/改组色|Change group color/}).click()
 const picker=page.getByRole('dialog',{name:'颜色'});await picker.waitFor()
 const panel=picker.getByRole('group',{name:'饱和度和明度'}),p=await panel.boundingBox()
 const before=await picker.locator('output').innerText()
 await page.mouse.move(p.x+p.width*.9,p.y+p.height*.1);await page.mouse.down();await page.mouse.move(p.x+p.width*.25,p.y+p.height*.75);await page.mouse.up()
 const sv=await picker.locator('output').innerText();assert.notEqual(before,sv)
 const hue=picker.getByRole('slider',{name:'色相'}),hr=await hue.boundingBox()
 await page.mouse.move(hr.x+hr.width*.25,hr.y+hr.height/2);await page.mouse.down();await page.mouse.move(hr.x+hr.width*.75,hr.y+hr.height/2);await page.mouse.up()
 await picker.locator('[data-hue-ghost]').waitFor();const after=await picker.locator('output').innerText();assert.notEqual(sv,after)
 await page.setViewportSize({width:280,height:844})
 const bounds=await picker.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=280.5,JSON.stringify(bounds))
 results.picker={before,sv,after,bounds};await shot('glass-picker-280')
 await picker.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'返回',exact:true}).click()
 await page.setViewportSize({width:390,height:844});await prefs({periodHeaderLayout:'legacy',periodHeaderHideTime:true})
 await page.locator('[data-schedule-week="1"] [data-period-header-hide-time]').first().waitFor()
 results.headerHidden=await page.locator('[data-schedule-week="1"] [data-period-header-hide-time]').count();assert(results.headerHidden>0)
 await prefs({periodHeaderLayout:'three_line',periodHeaderHideTime:true,themeMode:'dark'})
 await page.locator('[data-schedule-week="1"] [data-period-header-line="start"]').first().waitFor()
 results.threeLineTimes=await page.locator('[data-schedule-week="1"] [data-period-header-line="start"]').count();assert(results.threeLineTimes>0)
 await shot('glass-dark-three-line')
 await page.getByRole('button',{name:'周视图',exact:true}).click()
 const summary=page.locator('[data-schedule-week="1"] [role="button"][data-course-id="1001"]').first()
 await summary.click();await page.getByRole('dialog',{name:'课程详情'}).waitFor()
 await page.mouse.click(5,100)
 await page.getByRole('dialog',{name:'课程详情'}).waitFor({state:'hidden'})
 const sr=await summary.boundingBox();await page.mouse.move(sr.x+sr.width/2,sr.y+sr.height/2);await page.mouse.down()
 await page.getByRole('dialog',{name:'调整本次课程'}).waitFor();await page.mouse.up()
 await shot('glass-week-summary-menu')
 assert.equal(await page.getByLabel('教室或地点').count(),0)
 await page.getByRole('button',{name:'调整本次',exact:true}).click();await page.getByLabel('教室或地点').waitFor()
 await page.getByRole('button',{name:'取消',exact:true}).click()
 results.weekSummary={clickDetails:true,longPressOccurrence:true}
 assert.deepEqual(await snapshot(),baseline);results.cancellations={databaseUnchanged:true,undoUnchanged:true}
 assert.deepEqual(results.errors,[])
 results.passed=true
} catch(error) {results.failure=error.stack;await shot('verification-failure').catch(()=>{});throw error}
finally {await writeFile(`${output}/verification.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await context.close();await browser.close()}
