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
