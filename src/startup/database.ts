import { db, loadPrefs } from '../data/db'
import type { Prefs } from '../data/types'
import { publicAccessGranted, publicAccessRequired } from '../publicAccess'

let pending: Promise<void> | undefined
let preferences: Promise<Prefs> | undefined
/** Disk work only: no React, translations, colors or renderer in this graph. */
export function openStartupDatabase(): Promise<void> {
  return pending ??= Promise.resolve(db.open()).then(() => undefined)
}

/** The early entry and later language/store preparation join one disk read. */
export function loadStartupPrefs(): Promise<Prefs> {
  return preferences ??= openStartupDatabase().then(() => loadPrefs())
}
if (!publicAccessRequired() || publicAccessGranted()) void loadStartupPrefs().catch(() => {})
