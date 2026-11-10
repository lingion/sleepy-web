// Run: node src/components/glass/sampling-equivalence.bench.mjs
// Checks scalar sampling and PNG-map quantization; this is not a frame benchmark.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const base = '2e716653182995511ee16ecde40869d42a22bd21'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const scratch = mkdtempSync('/tmp/sleepy-glass-sampling-')
mkdirSync(resolve(scratch, 'before'))
for (const file of ['opticalMath.ts', 'opticalMaps.ts', 'styles.ts']) {
  writeFileSync(resolve(scratch, 'before', file), execFileSync('git', ['show', `${base}:src/components/glass/${file}`], {cwd: root}))
}
const entry = "export * from './opticalMath'; export * from './opticalMaps'; export * from './styles'"
for (const [name, dir] of [['before', resolve(scratch, 'before')], ['after', resolve(root, 'src/components/glass')]]) {
  await build({stdin: {contents: entry, resolveDir: dir, sourcefile: 'sampling.ts'}, bundle: true, platform: 'node', format: 'esm', outfile: resolve(scratch, `${name}.mjs`)})
}
const [before, after] = await Promise.all(['before', 'after'].map(name => import(pathToFileURL(resolve(scratch, `${name}.mjs`)))))
const measurements = []
for (const role of ['lens', 'lensContent']) for (const padding of ['default', 'zero']) {
  let clippedBaseComponents = 0, samples = 0, outOfRange = 0
  let maxAnalyticLinearErrorDp = 0, maxDecodedVsScaledAnalyticDp = 0, maxDecodedVsPerFrameScaledMapsDp = 0, maxBeforeAfterByteDelta = 0
  for (const [width, height] of [[37, 24], [80, 40], [103, 51], [150, 65]]) {
    const style = after.liquidGlassStyle(role), pad = padding === 'zero' ? 0 : after.opticalSamplingPadding(style)
    const shape = {width, height, borderRadius: 999, pixelSize: .5, samplingPadding: pad}
    const maps = after.renderOpticalMaps(shape, style), original = before.renderOpticalMaps(shape, style)
    for (const amount of [0, .01, .1, .25, .5, .75, 1]) {
      const scaled = after.scaleGlassStyle(style, amount), direct = after.renderOpticalMaps(shape, scaled)
      const halfMinor = Math.min(width, height) / 2
      const shiftAmount = style.refraction > 0 ? Math.min(style.refraction * amount, halfMinor) / Math.min(style.refraction, halfMinor) : amount
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const point = [x + .5, y + .5], i = (y * width + x) * 4
        if (maps.masks[i] === 0) continue
        const full = after.sampleGlassOptics(shape, point, style), target = after.sampleGlassOptics(shape, point, scaled)
        for (let channel = 0; channel < 3; channel++) for (let axis = 0; axis < 2; axis++) {
          const raw = full.shift[axis] + (1 - channel) * full.part[axis]
          const linear = amount * raw + (shiftAmount - amount) * full.shift[axis]
          const expectedRaw = target.shift[axis] + (1 - channel) * target.part[axis]
          const clamp = offset => Math.max(-pad + .25, Math.min((axis === 0 ? width : height) + pad - .25, point[axis] + offset)) - point[axis]
          maxAnalyticLinearErrorDp = Math.max(maxAnalyticLinearErrorDp, Math.abs(linear - expectedRaw))
          if (Math.abs(raw - clamp(raw)) > 1e-12) clippedBaseComponents++
          const decode = c => (maps.displacement[c][i + axis] - 128) / 254 * maps.displacementScale
          const decoded = amount * decode(channel) + (shiftAmount - amount) * decode(1)
          const perFrame = (direct.displacement[channel][i + axis] - 128) / 254 * direct.displacementScale
          if (Math.abs(decoded) > maps.displacementScale / 2 + 1e-12) outOfRange++
          maxDecodedVsScaledAnalyticDp = Math.max(maxDecodedVsScaledAnalyticDp, Math.abs(decoded - clamp(expectedRaw)))
          maxDecodedVsPerFrameScaledMapsDp = Math.max(maxDecodedVsPerFrameScaledMapsDp, Math.abs(decoded - perFrame))
          maxBeforeAfterByteDelta = Math.max(maxBeforeAfterByteDelta, Math.abs(maps.displacement[channel][i + axis] - original.displacement[channel][i + axis]))
          samples++
        }
      }
    }
  }
  assert.equal(maxBeforeAfterByteDelta, 0)
  assert.equal(outOfRange, 0)
  assert.ok(maxAnalyticLinearErrorDp < 1e-12)
  if (padding === 'default') {
    assert.equal(clippedBaseComponents, 0)
    assert.ok(maxDecodedVsScaledAnalyticDp < (role === 'lens' ? .030 : .063))
  }
  measurements.push({role, padding, samples, clippedBaseComponents, maxAnalyticLinearErrorDp, maxDecodedVsScaledAnalyticDp, maxDecodedVsPerFrameScaledMapsDp, maxBeforeAfterByteDelta, outOfRange})
}
const result = {base, note: 'Fixed exact shapes isolate quantization and clipping from the pre-existing two-dp map cache buckets.', measurements}
writeFileSync(resolve(scratch, 'results.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
console.log(`Results: ${resolve(scratch, 'results.json')}`)
