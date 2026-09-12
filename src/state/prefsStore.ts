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
    const prefs = clampPrefs({ ...get().prefs, ...patch })
    set({ prefs })
    syncSideEffects(prefs)
    await savePrefs(prefs)
  },
}))

/** update() 值域校验 — AppPrefs.kt setter require 同构 (audit 偏好默认值: 盲合并零校验) */
function clampPrefs(p: Prefs): Prefs {
  const cl = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  return {
    ...p,
    gridScale: cl(p.gridScale, 0.7, 1.3),
    weekScale: cl(p.weekScale, 0.7, 1.3),
    gridCornerRatio: cl(p.gridCornerRatio, 0, 2),
    conflictStackInset: cl(p.conflictStackInset, 4, 20),
    conflictRailInset: cl(p.conflictRailInset, 4, 20),
    conflictFoldSize: cl(p.conflictFoldSize, 8, 28),
    visibleDays: p.visibleDays.filter((d) => d >= 1 && d <= 7),
  }
}

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

// themeMode=system 实时跟随 — resolveIsDark 仅 load/update 时读一次 matchMedia, 无监听
// 则系统深浅切换后不刷新 (audit 偏好默认值 medium)。模块级注册一次, 进程生命周期同。
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', () => {
    const prefs = usePrefsStore.getState().prefs
    if (prefs.themeMode === 'system') {
      syncSideEffects(prefs)
      usePrefsStore.setState({ prefs: { ...prefs } })
    }
  })
}
