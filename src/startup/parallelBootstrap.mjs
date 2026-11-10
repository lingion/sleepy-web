import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

/** Discover the data bootstrap in HTML, alongside the renderer's static graph. */
export function parallelBootstrap() {
  let config, reference, databaseReference
  return {
    name: 'sleepy-parallel-bootstrap',
    apply: 'build',
    configResolved(value) { config = value },
    buildStart() {
      databaseReference = this.emitFile({ type: 'chunk', id: path.resolve(config.root, 'src/startup/database.ts'), name: 'startup-database', preserveSignature: 'strict' })
      reference = this.emitFile({ type: 'chunk', id: path.resolve(config.root, 'src/startup/data.ts'), name: 'startup-data', preserveSignature: 'strict' })
    },
    generateBundle: { order: 'post', handler(_options, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') this.error('Startup bootstrap requires index.html')
      const file = this.getFileName(reference)
      const databaseFile = this.getFileName(databaseReference)
      const prefix = config.base === './' || config.base === '' ? './' : config.base
      const tag = [databaseFile, file].map(name => `<script type="module" crossorigin src="${prefix}${name}"></script>`).join('\n    ')
      const source = String(html.source)
      if (!/<script\b[^>]*type="module"/.test(source)) this.error('Renderer module missing from index.html')
      html.source = source.replace(/<script\b[^>]*type="module"/, `${tag}\n    $&`)
      const files = new Set()
      const collect = name => {
        if (files.has(name)) return
        files.add(name)
        const chunk = bundle[name]
        if (chunk?.type === 'chunk') chunk.imports.forEach(collect)
      }
      collect(file)
      const modules = [...files].flatMap(name => Object.keys(bundle[name]?.modules ?? {}))
      if (modules.some(id => /\/node_modules\/react-dom\/|\/src\/(?:App\.tsx|views\/)/.test(id))) {
        this.error('Data bootstrap depends on the renderer; early initialization cannot run independently')
      }
      const hash = value => createHash('sha256').update(value).digest('hex')
      const dataFiles = [...files]
      files.clear()
      collect(databaseFile)
      const databaseModules = [...files].flatMap(name => Object.keys(bundle[name]?.modules ?? {}))
      if (databaseModules.some(id => /\/node_modules\/(?:react|react-dom|i18next)\/|\/src\/(?:i18n\/|state\/prefsStore\.ts|App\.tsx|views\/)/.test(id))) {
        this.error('Database bootstrap includes language or renderer dependencies')
      }
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(chunk => ({
        file: chunk.fileName, sha256: hash(chunk.code), bytes: Buffer.byteLength(chunk.code), gzip: gzipSync(chunk.code).length, imports: chunk.imports,
      }))
      this.emitFile({ type: 'asset', fileName: 'startup-manifest.json', source: JSON.stringify({
        databaseEntry: databaseFile, databaseStaticClosure: [...files], dataEntry: file, earlyStaticClosure: dataFiles, htmlSha256: hash(html.source), chunks,
        databaseModules: databaseModules.map(id => path.relative(config.root, id)),
        earlyModules: modules.map(id => path.relative(config.root, id)),
        glassModules: Object.values(bundle).filter(item => item.type === 'chunk').flatMap(chunk => Object.entries(chunk.modules)
          .filter(([id]) => /\/components\/glass\/(?:opaqueBackdrop|optics|useGlassLens)\.ts$/.test(id))
          .map(([id, module]) => ({ source: path.relative(config.root, id), file: chunk.fileName, renderedLength: module.renderedLength,
            transformedSha256: hash(this.getModuleInfo(id).code) }))),
      }, null, 2) + '\n' })
    } },
  }
}
