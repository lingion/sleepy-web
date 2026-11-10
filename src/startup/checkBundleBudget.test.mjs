import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { failures, inspectBuild, inspectStartupSources } from './checkBundleBudget.mjs'

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleepy-startup-budget-'))
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), content)
  }
  try { run(root, write) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

test('counts real static module/CSS dependencies once and ignores stale outputs and deferred editors', () => fixture((root, write) => {
  write('index.html', '<script type="module" src="./assets/index-a.js"></script><link rel="modulepreload" href="./assets/shared-a.js"><link rel="stylesheet" href="./assets/index-a.css">')
  write('assets/index-a.js', 'import "./shared-a.js"; import("./ImportView-a.js")')
  write('assets/shared-a.js', 'export const ready = true')
  write('assets/index-a.css', 'body { color: black }')
  write('assets/ImportView-a.js', 'throw Error("deferred")')
  write('assets/index-stale.js', 'stale'.repeat(100_000))
  const report = inspectBuild(root)
  assert.deepEqual(report.files.map(file => file.file).sort(), ['assets/index-a.css', 'assets/index-a.js', 'assets/shared-a.js'])
  assert.deepEqual(failures(report), [])
}))

test('rejects a static editor and a late default-route waterfall', () => fixture((root, write) => {
  write('index.html', '<script type="module" src="/sleepy-web/assets/index-a.js"></script>')
  write('assets/index-a.js', 'import "./ImportView-a.js"; import("./ScheduleView-a.js")')
  write('assets/ImportView-a.js', 'export const directory = true')
  write('assets/ScheduleView-a.js', 'export const schedule = true')
  const errors = failures(inspectBuild(root))
  assert.ok(errors.some(error => error.includes('Critical chunks')))
  assert.ok(errors.some(error => error.includes('ImportView-a.js')))
}))

test('rejects an inlined parser by its source edge, including re-exports, while ignoring type-only imports', () => fixture((root, write) => {
  write('src/main.tsx', 'import { parse } from "./barrel"; import type { Result } from "./domain/import/typeOnly"')
  write('src/views/ScheduleView.tsx', 'export const ScheduleView = null')
  write('src/barrel.ts', 'export { parse } from "./domain/import/renamedParser"')
  write('src/domain/import/renamedParser.ts', 'export const parse = () => null')
  write('src/domain/import/typeOnly.ts', 'export type Result = string')
  assert.deepEqual(inspectStartupSources(root), ['src/domain/import/renamedParser.ts'])
}))

test('rejects a compressed initial graph over the byte budget', () => {
  const report = { scheduleZhCNGzip: 300_001, lateCriticalChunks: [], forbiddenChunks: [] }
  assert.match(failures(report)[0], /300001 exceeds 300000/)
})

test('rejects static optics but allows a conditionally loaded optical runtime', () => fixture((root, write) => {
  write('index.html', '<script type="module" src="./assets/index-a.js"></script>')
  write('assets/index-a.js', 'import "./optics-a.js"')
  write('assets/optics-a.js', 'export const ready = true')
  assert.ok(failures(inspectBuild(root)).some(error => error.includes('optics-a.js')))
  write('assets/index-a.js', 'export const prepare = () => import("./optics-a.js")')
  assert.deepEqual(failures(inspectBuild(root)), [])
}))

test('finds optical implementation behind a barrel while allowing types and a conditional import', () => fixture((root, write) => {
  write('src/main.tsx', 'import { install } from "./runtime"; import type { Lens } from "./components/glass/opticalMath"')
  write('src/views/ScheduleView.tsx', 'export const ScheduleView = null')
  write('src/runtime.ts', 'export { install } from "./components/glass/optics"')
  write('src/components/glass/optics.ts', 'export const install = () => null')
  write('src/components/glass/opticalMath.ts', 'export type Lens = string')
  assert.deepEqual(inspectStartupSources(root), ['src/components/glass/optics.ts'])
  write('src/runtime.ts', 'export const install = () => import("./components/glass/optics")')
  assert.deepEqual(inspectStartupSources(root), [])
}))

test('checks the independent data bootstrap for an inlined optical dependency', () => fixture((root, write) => {
  write('src/main.tsx', 'export const main = true')
  write('src/views/ScheduleView.tsx', 'export const schedule = true')
  write('src/startup/data.ts', 'import { maps } from "../components/glass/opticalMaps"')
  write('src/components/glass/opticalMaps.ts', 'export const maps = true')
  assert.deepEqual(inspectStartupSources(root), ['src/components/glass/opticalMaps.ts'])
  write('src/startup/data.ts', 'export const prepare = () => import("../components/glass/opticalMaps")')
  assert.deepEqual(inspectStartupSources(root), [])
}))

test('keeps the full icon catalog out of the initial timetable even behind a barrel', () => fixture((root, write) => {
  write('src/main.tsx', 'import { IconPerson } from "./entryIcons"')
  write('src/views/ScheduleView.tsx', 'export const ScheduleView = null')
  write('src/entryIcons.ts', 'export { IconPerson } from "./components/icons"')
  write('src/components/icons.tsx', 'export const IconPerson = () => null')
  assert.deepEqual(inspectStartupSources(root), ['src/components/icons.tsx'])
  write('src/entryIcons.ts', 'export { IconPerson } from "./components/startupIcons"')
  write('src/components/startupIcons.tsx', 'export const IconPerson = () => null')
  assert.deepEqual(inspectStartupSources(root), [])
}))
