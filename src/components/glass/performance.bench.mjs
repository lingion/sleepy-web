// Run from the repository: node src/components/glass/performance.bench.mjs
// Uses Node/jsdom and real PNG encoding. This does not measure browser rendering.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { PNG } from 'pngjs'

const base = '2e716653182995511ee16ecde40869d42a22bd21'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const scratch = mkdtempSync('/tmp/sleepy-glass-cpu-')
const files = ['opticalMaps.ts', 'opticalMath.ts', 'opticalSvg.ts', 'styles.ts', 'optics.ts', 'physics.ts', 'useGlassLens.ts', 'GlassControls.tsx']
mkdirSync(resolve(scratch, 'before'))
symlinkSync(resolve(root, 'node_modules'), resolve(scratch, 'node_modules'), 'dir')
for (const file of files) writeFileSync(resolve(scratch, 'before', file), execFileSync('git', ['show', `${base}:src/components/glass/${file}`], { cwd: root }))
const entry = "export * from './optics'; export {cachedOpticalMaps} from './opticalMaps'; export {useGlassLens,lensGeometry} from './useGlassLens'; export {GlassControlMotion} from './physics'"
for (const [name, dir] of [['before', resolve(scratch, 'before')], ['after', resolve(root, 'src/components/glass')]]) {
  await build({ stdin: { contents: entry, resolveDir: dir, sourcefile: 'bench-entry.ts' }, bundle: true, platform: 'node', format: 'esm', external: ['react'], outfile: resolve(scratch, `${name}.mjs`) })
}
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'HTMLCanvasElement']) globalThis[name] = dom.window[name]
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globalThis.CanvasRenderingContext2D = dom.window.CanvasRenderingContext2D = class {}
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
let encodes = 0
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: data => { this.pixels = data.data } }
}
dom.window.HTMLCanvasElement.prototype.toDataURL = function () {
  encodes++
  return `data:image/png;base64,${PNG.sync.write({ width: this.width, height: this.height, data: Buffer.from(this.pixels) }).toString('base64')}`
}
const versions = await Promise.all(['before', 'after'].map(name => import(pathToFileURL(resolve(scratch, `${name}.mjs`)))))
const { createElement } = await import('react')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const samples = Number(process.env.GLASS_BENCH_SAMPLES || 5)
const sourceHashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, 'src/components/glass', file))).digest('hex')]))
const output = { base, node: process.version, samples, scratch, sourceHashes, units: 'milliseconds', measurements: {} }
async function measure(name, run, cold = false) {
  const times = [[], []], uploads = [[], []], observations = [[], []]
  for (let sample = -1; sample < samples; sample++) for (const index of sample % 2 ? [1, 0] : [0, 1]) {
    const api = cold ? await import(`${pathToFileURL(resolve(scratch, `${index ? 'after' : 'before'}.mjs`))}?${name}-${sample}`) : versions[index]
    const encoded = encodes, started = performance.now()
    const observed = run(api)
    const elapsed = performance.now() - started
    if (sample >= 0) {
      times[index].push(elapsed); uploads[index].push(encodes - encoded)
      if (observed) { const { states, graphDigest, ...counts } = observed; observations[index].push(counts) }
    }
  }
  const before = median(times[0]), after = median(times[1])
  output.measurements[name] = { before, after, speedup: before / after, beforeSamples: times[0], afterSamples: times[1], pngEncodes: uploads.map(median), ...(observations[0].length ? {observations} : {}) }
  console.log(JSON.stringify({ name, before, after, speedup: before / after, pngEncodes: uploads.map(median) }))
}
await measure('coldMaps24', api => {
  for (const role of ['regular', 'tinted', 'pill', 'menu', 'alert', 'lens', 'lensContent', 'lens']) {
    const style = api.liquidGlassStyle(role, { color: [.2, .4, .8, 1], surfaceBright: [1, .98, .97, 1] })
    for (const shape of [{ width: 68, height: 48, borderRadius: 24 }, { width: 150, height: 65, borderRadius: 999 }, { width: 360, height: 62, borderRadius: 31 }]) api.renderOpticalMaps(shape, style)
  }
})
await measure('warmLiftOnly120', api => {
  const element = document.createElement('div'), size = { width: 100, height: 50 }
  Object.defineProperties(element, { offsetWidth: { get: () => size.width }, offsetHeight: { get: () => size.height } })
  element.style.borderRadius = '999px'; document.body.appendChild(element)
  const optics = api.installLensOptics(element, { role: 'lens' })
  for (let frame = 0; frame < 120; frame++) optics.update((1 - Math.cos(frame / 119 * Math.PI * 2)) / 2, size)
  optics.destroy(); element.remove()
})
const sizing = api => {
  const element = document.createElement('div'), size = { width: 80, height: 54 }
  Object.defineProperties(element, { offsetWidth: { get: () => size.width }, offsetHeight: { get: () => size.height } })
  element.style.borderRadius = '999px'; document.body.appendChild(element)
  const optics = api.installLensOptics(element, { role: 'lens' }), motion = new api.GlassControlMotion(0)
  motion.update(2, true, true)
  for (let frame = 0; frame < 60; frame++) {
    if (frame === 30) motion.update(2, false, false)
    motion.tick(1 / 60)
    const g = api.lensGeometry('dock', 360, 62, 4, motion.position.value, motion.lift, motion.stretch)
    size.width = Math.round(g.width); size.height = Math.round(g.height)
    optics.update(motion.lift, size)
  }
  optics.destroy(); element.remove()
}
await measure('coldSizingAndLift60', sizing, true)
await measure('warmSizingAndLift60', sizing)

function hookRun(api, mode, count, animate = false, verify = false) {
  let id = 0, boundsReads = 0, offsetReads = 0, writes = 0
  const frames = new Map(), mounted = [], states = [], callbackTimes = [], hash = createHash('sha256')
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id }
  globalThis.cancelAnimationFrame = key => frames.delete(key)
  document.documentElement.dataset.uiStyle = mode
  for (let n = 0; n < count; n++) {
    const track = document.createElement('div'), host = document.createElement('div'), width = 360 - n * 2
    track.innerHTML = '<span class="navigation-lens"></span><div class="glass-destinations"></div><div class="glass-content-warp"></div>'
    track.getBoundingClientRect = () => { boundsReads++; return { left: 0, top: 0, width, height: 62 } }
    Object.defineProperties(track, { offsetWidth: { get: () => { offsetReads++; return width } }, offsetHeight: { get: () => { offsetReads++; return 62 } } })
    for (const child of track.querySelectorAll('.navigation-lens,.glass-content-warp')) {
      child.style.borderRadius = '999px'
      Object.defineProperties(child, {
        offsetWidth: { get: () => { offsetReads++; return Math.round(parseFloat(track.style.getPropertyValue('--lens-width'))) } },
        offsetHeight: { get: () => { offsetReads++; return Math.round(parseFloat(track.style.getPropertyValue('--lens-height'))) } },
      })
    }
    const set = track.style.setProperty.bind(track.style)
    track.style.setProperty = (...args) => { writes++; return set(...args) }
    document.body.append(track, host)
    let control
    function Harness() { control = api.useGlassLens({ current: track }, { kind: 'dock', index: 0, count: 4, onSelect() {} }); return null }
    const reactRoot = createRoot(host)
    flushSync(() => reactRoot.render(createElement(Harness)))
    mounted.push({ track, host, reactRoot, control })
  }
  const filtersAtMount = document.querySelectorAll('filter').length
  if (animate) {
    const { track, control } = mounted[0]
    control.press(50, 31)
    for (let frame = 0; frame < 120; frame++) {
      if (frame === 15) control.move(250, 15)
      if (frame === 40) control.move(330, 50)
      if (frame === 60) control.release()
      const callbacks = [...frames.values()]; frames.clear()
      callbacks.forEach(callback => {
        const started = performance.now(); callback((frame + 1) * 1000 / 60); callbackTimes.push(performance.now() - started)
      })
      if (verify) {
        states.push(track.style.cssText, track.querySelector('.glass-destinations').style.clipPath)
        for (const filter of document.querySelectorAll('filter')) {
          const content = filter.dataset.opticsRole === 'lensContent'
          hash.update(JSON.stringify(['x', 'y', 'width', 'height', 'data-optics-role'].map(name => filter.getAttribute(name))))
          // Compare the maps actually used by this material. Algebraic SVG
          // rewrites change uniforms and intermediate names; opticalSvg.test.ts
          // independently compares resulting pixels and RGB sampling offsets.
          for (const image of filter.querySelectorAll('feImage')) {
            const result = image.getAttribute('result')
            if (content && !/^map-[xy]-/.test(result) && !['map-shape', 'map-frost'].includes(result)) continue
            hash.update(image.outerHTML)
          }
          for (const result of ['rim-frost', ...(content ? [] : ['end-scale', 'darken', 'undarken'])]) {
            const node = filter.querySelector(`[result="${result}"]`)
            hash.update(JSON.stringify(node ? [...node.attributes].filter(attr => !['in', 'in2'].includes(attr.name)).map(attr => [attr.name, attr.value]) : []))
          }
          hash.update(JSON.stringify([...filter.querySelectorAll('feDisplacementMap')].slice(0, 6).map(node => node.getAttribute('scale'))))
        }
      }
    }
  }
  for (const { track, host, reactRoot } of mounted) { flushSync(() => reactRoot.unmount()); track.remove(); host.remove() }
  const sorted = [...callbackTimes].sort((a, b) => a - b)
  return { boundsReads, offsetReads, writes, filtersAtMount, states, activeMapDigest: hash.digest('hex'), callbacks: sorted.length, callbackP95Ms: sorted[Math.ceil(sorted.length * .95) - 1] ?? 0, callbackTotalMs: callbackTimes.reduce((a, b) => a + b, 0) }
}
await measure('coldClassicMount8', api => hookRun(api, 'classic', 8), true)
await measure('coldGlassMount8', api => hookRun(api, 'liquid_glass', 8), true)
await measure('coldHookDrag120', api => hookRun(api, 'liquid_glass', 1, true), true)
await measure('warmHookDrag120', api => hookRun(api, 'liquid_glass', 1, true))
const checks = versions.map(api => hookRun(api, 'liquid_glass', 1, true, true))
assert.deepEqual(checks[1].states, checks[0].states, 'All 120 motion/geometry/clip states must match the fixed base')
assert.equal(checks[1].activeMapDigest, checks[0].activeMapDigest, 'All 120 active map payloads and unchanged uniforms must match the fixed base')
output.equivalence = checks.map(({ states, ...counts }) => counts)
output.classic = versions.map(api => hookRun(api, 'classic', 1))
console.log(JSON.stringify({ equivalence: output.equivalence, classicFilters: output.classic.map(value => value.filtersAtMount) }))
writeFileSync(resolve(scratch, 'results.json'), JSON.stringify(output, null, 2) + '\n')
console.log(`Results: ${resolve(scratch, 'results.json')}`)
