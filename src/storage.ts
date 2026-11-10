import { DEMO_STORAGE_PREFIX, runtimeMode } from './runtimeMode'

/** Explicit facade: no global Storage patch, and clear/key/length stay in this namespace. */
export function scopedStorage(resolve: () => Storage, prefix: string): Storage {
  const keys = () => {
    const storage = resolve()
    const result: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key !== null && key.startsWith(prefix)) result.push(key.slice(prefix.length))
    }
    return result
  }
  return {
    get length() { return keys().length },
    key: (index) => keys()[index] ?? null,
    getItem: (key) => resolve().getItem(prefix + key),
    setItem: (key, value) => resolve().setItem(prefix + key, value),
    removeItem: (key) => resolve().removeItem(prefix + key),
    clear: () => { for (const key of keys()) resolve().removeItem(prefix + key) },
  }
}

const prefix = runtimeMode.demo ? DEMO_STORAGE_PREFIX : ''
export const localPreferences = scopedStorage(() => window.localStorage, prefix)
export const sessionPreferences = scopedStorage(() => window.sessionStorage, prefix)
