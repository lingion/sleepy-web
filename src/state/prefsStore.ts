/**
 * 偏好 store — AppPrefs.kt 22 keys 对应的 Web 状态层
 * Dexie 持久化 + Zustand 内存镜像; setPrefs 即写穿。
 */

import { create } from 'zustand'
import { loadPrefs, savePrefs } from '../data/db'
import { DEFAULT_PREFS } from '../data/types'
import type { Prefs } from '../data/types'
import { changeLang } from '../i18n'
import { applyTheme } from '../theme/themes'

interface PrefsState {
  prefs: Prefs
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Prefs>) => Promise<void>
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: { ...DEFAULT_PREFS },
  loaded: false,

  load: async () => {
    const prefs = await loadPrefs()
    set({ prefs, loaded: true })
    syncSideEffects(prefs)
  },

  update: async (patch) => {
    const prefs = { ...get().prefs, ...patch }
    set({ prefs })
    syncSideEffects(prefs)
    await savePrefs(prefs)
  },
}))

/** 副作用: 主题/语言即时应用 (Android side-effect 同) */
function syncSideEffects(prefs: Prefs): void {
  const isDark = resolveIsDark(prefs)
  applyTheme(prefs.theme, isDark)
  changeLang(prefs.lang)
}

export function resolveIsDark(prefs: Prefs): boolean {
  if (prefs.themeMode === 'dark') return true
  if (prefs.themeMode === 'light') return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}
