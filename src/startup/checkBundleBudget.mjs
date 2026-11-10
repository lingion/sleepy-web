/** Run after building: node src/startup/checkBundleBudget.mjs <outDir> [baselineDir] */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'

export const budget = { initialGzip: 300_000, lateCriticalChunks: 0 }
const critical = /^(?:ScheduleView|zh-CN|sampleTable)-.*\.js$/
const forbiddenChunk = /^(?:AddCourseView|ImportView|ExportView|EditTableView|JwImportView|OccurrenceActionsHost|CourseDetailSheet|scheduleParser|scheduleExporter|icsRangeExporter|sleepyNativeExporter|schools|optics|opticalSvg|opticalMaps|opticalMath|opaqueBackdrop)-/
const forbiddenSource = /(?:\/views\/(?:AddCourseView|ImportView|ExportView|EditTableView|jw\/JwImportView)\.tsx$|\/domain\/import\/|\/domain\/jw\/|\/components\/(?:CourseDetailSheet|schedule\/useOccurrenceActions)\.tsx$|\/components\/glass\/(?:optics|opticalSvg|opticalMaps|opticalMath|opaqueBackdrop|styles)\.ts$|\/schools[^/]*\.(?:json|ts)$)/

function imports(file, code) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
  const staticImports = [], dynamicImports = []
  for (const statement of source.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (statement.isTypeOnly || statement.importClause?.isTypeOnly) continue
    const bindings = statement.importClause?.namedBindings ?? statement.exportClause
    if (bindings && ts.isNamedImports(bindings) && !statement.importClause?.name && bindings.elements.every(item => item.isTypeOnly)) continue
    if (bindings && ts.isNamedExports(bindings) && bindings.elements.every(item => item.isTypeOnly)) continue
    staticImports.push(statement.moduleSpecifier.text)
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) dynamicImports.push(node.arguments[0].text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { staticImports, dynamicImports }
}

/** Read the HTML and actual import graph, so stale files in outDir never count. */
export function inspectBuild(outDir) {
  const root = path.resolve(outDir)
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>/g)].map(match => match[0])
  const roots = tags.flatMap(tag => {
    if (!/type="module"|rel="(?:stylesheet|modulepreload)"/.test(tag)) return []
    const url = /(?:src|href)="([^"]+)"/.exec(tag)?.[1]
    // Both root and GitHub Pages mounts resolve to the same local assets.
    const asset = url?.match(/(?:^|\/)assets\/([^?#]+)/)?.[1]
    return asset ? [`assets/${asset}`] : []
  })
  if (!roots.some(file => file.endsWith('.js'))) throw Error('No module entry found in built index.html')
  const files = new Map(), dynamic = new Set()
  function add(file) {
    if (files.has(file)) return
    const code = fs.readFileSync(path.join(root, file), 'utf8')
    files.set(file, { file, bytes: Buffer.byteLength(code), gzip: gzipSync(code).length })
    if (!file.endsWith('.js')) return
    const { staticImports, dynamicImports } = imports(file, code)
    for (const specifier of dynamicImports) if (specifier.startsWith('.')) dynamic.add(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)))
    for (const specifier of staticImports) {
      if (!specifier.startsWith('.')) throw Error(`Unresolved built import: ${file}: ${specifier}`)
      add(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)))
    }
  }
  roots.forEach(add)
  const initialFiles = [...files.values()]
  const lateCriticalChunks = [...dynamic].filter(file => critical.test(path.posix.basename(file)) && !files.has(file))
  lateCriticalChunks.forEach(add)
  return {
    outDir: root,
    initialGzip: initialFiles.reduce((sum, file) => sum + file.gzip, 0),
    scheduleZhCNGzip: [...files.values()].reduce((sum, file) => sum + file.gzip, 0),
    lateCriticalChunks,
    forbiddenChunks: [...files.keys()].filter(file => forbiddenChunk.test(path.posix.basename(file))),
    files: [...files.values()],
  }
}

/** Check source edges as well: a renamed or inlined parser cannot evade the budget. */
export function inspectStartupSources(projectRoot) {
  const src = path.join(projectRoot, 'src'), seen = new Set()
  function add(file) {
    if (seen.has(file)) return
    seen.add(file)
    if (!/\.[tj]sx?$/.test(file)) return
    const { staticImports } = imports(file, fs.readFileSync(file, 'utf8'))
    for (const specifier of staticImports) {
      if (!specifier.startsWith('.')) continue
      const base = path.resolve(path.dirname(file), specifier)
      const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (resolved) add(resolved)
    }
  }
  add(path.join(src, 'main.tsx'))
  add(path.join(src, 'views/ScheduleView.tsx'))
  // This entry is emitted directly into HTML and is independent of main.tsx.
  const dataEntry = path.join(src, 'startup/data.ts')
  if (fs.existsSync(dataEntry)) add(dataEntry)
  return [...seen].filter(file => forbiddenSource.test(file)).map(file => path.relative(projectRoot, file))
}

export function failures(report, blockedSources = []) {
  return [
    ...(report.scheduleZhCNGzip > budget.initialGzip ? [`Initial schedule and CSS gzip ${report.scheduleZhCNGzip} exceeds ${budget.initialGzip} bytes`] : []),
    ...(report.lateCriticalChunks.length ? [`Critical chunks still load after entry execution: ${report.lateCriticalChunks.join(', ')}`] : []),
    ...report.forbiddenChunks.map(file => `Deferred implementation in the built initial graph: ${file}`),
    ...blockedSources.map(file => `Deferred implementation in the source static graph: ${file}`),
  ]
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw Error('Usage: node src/startup/checkBundleBudget.mjs <outDir> [baselineDir]')
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const report = inspectBuild(process.argv[2])
  report.budget = budget
  report.blockedSources = inspectStartupSources(projectRoot)
  report.failures = failures(report, report.blockedSources)
  if (process.argv[3]) {
    const baseline = inspectBuild(process.argv[3])
    report.baselineGzip = baseline.scheduleZhCNGzip
    report.gzipReductionPercent = (1 - report.scheduleZhCNGzip / baseline.scheduleZhCNGzip) * 100
  }
  console.log(JSON.stringify(report, null, 2))
  if (report.failures.length) process.exitCode = 1
}
