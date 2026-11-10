import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

/** The default route's literal keys, including strings selected indirectly by helpers. */
export function startupTranslationKeys(projectRoot, dictionary) {
  const seen = new Set(), keys = new Set()
  function visit(file) {
    if (seen.has(file) || file.includes(`${path.sep}i18n${path.sep}`)) return
    seen.add(file)
    if (!/\.[tj]sx?$/.test(file)) return
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    function literals(node) {
      if (ts.isStringLiteralLike(node) && Object.hasOwn(dictionary, node.text)) keys.add(node.text)
      if (ts.isCallExpression(node) && (ts.isIdentifier(node.expression) ? node.expression.text === 't' : ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't')) {
        const key = node.arguments[0]
        const prefix = key && ts.isTemplateExpression(key) ? key.head.text
          : key && ts.isBinaryExpression(key) && ts.isStringLiteralLike(key.left) ? key.left.text : undefined
        if (prefix !== undefined) for (const name of Object.keys(dictionary)) if (name.startsWith(prefix)) keys.add(name)
      }
      ts.forEachChild(node, literals)
    }
    literals(source)
    for (const statement of source.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue
      if (statement.isTypeOnly || statement.importClause?.isTypeOnly) continue
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      const specifier = statement.moduleSpecifier.text
      if (!specifier.startsWith('.')) continue
      const bindings = statement.importClause?.namedBindings ?? statement.exportClause
      if (bindings && ts.isNamedImports(bindings) && !statement.importClause?.name && bindings.elements.every(item => item.isTypeOnly)) continue
      if (bindings && ts.isNamedExports(bindings) && bindings.elements.every(item => item.isTypeOnly)) continue
      const base = path.resolve(path.dirname(file), specifier)
      const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (resolved) visit(resolved)
    }
  }
  visit(path.join(projectRoot, 'src/main.tsx'))
  // These families also support notifications and indirect key selection while
  // the timetable is open, before any secondary page has been requested.
  for (const key of Object.keys(dictionary)) {
    if (/^(?:notif_|schedule_|sample_|tab_|agenda_)/.test(key)) keys.add(key)
  }
  return [...keys].sort()
}

export function splitStartupTranslations(projectRoot, dictionary) {
  const keys = new Set(startupTranslationKeys(projectRoot, dictionary))
  return {
    startup: Object.fromEntries(Object.entries(dictionary).filter(([key]) => keys.has(key))),
    pages: Object.fromEntries(Object.entries(dictionary).filter(([key]) => !keys.has(key))),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const dictionary = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/zh-CN.json'), 'utf8'))
  const split = splitStartupTranslations(root, dictionary)
  for (const [group, values] of Object.entries(split)) {
    fs.writeFileSync(path.join(root, `src/i18n/zh-CN.${group}.json`), JSON.stringify(values, null, 2) + '\n')
  }
  console.log(JSON.stringify(Object.fromEntries(Object.entries(split).map(([group, values]) => [group, { keys: Object.keys(values).length, bytes: Buffer.byteLength(JSON.stringify(values)) }]))))
}
