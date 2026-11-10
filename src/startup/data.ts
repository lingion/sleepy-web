import { loadStartupPrefs } from './database'
import { seedSampleTable } from '../data/sampleTable'
import { prepareI18n } from '../i18n'
import { publicAccessGranted, publicAccessRequired } from '../publicAccess'
import { usePrefsStore } from '../state/prefsStore'
import { publicScheduleEnabled } from './publicMode'
import { prepareInitialScheduleData } from './scheduleData'

let pending: Promise<void> | undefined

/** Shared by the early module and Bootstrap; no React renderer dependency. */
export function prepareStartupData(): Promise<void> {
  return pending ??= (async () => {
    const preferences = loadStartupPrefs()
    const language = preferences.then(prefs => prepareI18n(prefs.lang))
    const data = publicScheduleEnabled()
      ? import('../publicSchedule').then(module => module.loadPublicSchedule())
      : language.then(() => seedSampleTable())
    await Promise.all([language, data])
    // Theme and course hues depend on the completed seed/public transaction.
    await Promise.all([usePrefsStore.getState().load(await preferences), prepareInitialScheduleData()])
  })()
}

// Begin DB opening while the renderer is still loading/evaluating. The access
// gate remains authoritative, and Bootstrap receives any rejection later.
// No top-level await: data preparation never holds the document load event.
if (!publicAccessRequired() || publicAccessGranted()) {
  void prepareStartupData().catch(() => {})
}
