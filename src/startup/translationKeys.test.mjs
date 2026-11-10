import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { splitStartupTranslations } from './translationKeys.mjs'

test('keeps indirect startup strings and static children while deferring page-only and type-only keys', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleepy-translation-keys-'))
  const write = (name, value) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), value) }
  try {
    write('src/main.tsx', 'import "./view"; import type { T } from "./types"; import "./i18n"; const key = true ? "label_a" : "label_b"; t(key); import("./editor")')
    write('src/view.tsx', 't("static_view")')
    write('src/types.ts', 'const unused = "type_only"; export type T = string')
    write('src/editor.tsx', 't("editor_only")')
    write('src/i18n/index.ts', 'const all = "editor_only"')
    const dictionary = { label_a:'A', label_b:'B', static_view:'Static', type_only:'Type', editor_only:'Editor', notif_new:'Notification' }
    const { startup, pages } = splitStartupTranslations(root, dictionary)
    assert.deepEqual(startup, { label_a:'A', label_b:'B', static_view:'Static', notif_new:'Notification' })
    assert.deepEqual(pages, { type_only:'Type', editor_only:'Editor' })
    assert.deepEqual({ ...startup, ...pages }, dictionary)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
