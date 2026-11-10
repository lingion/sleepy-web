import { beforeEach, describe, expect, it } from 'vitest'
import { scopedStorage } from './storage'
import { DEMO_STORAGE_PREFIX, parseRuntimeMode } from './runtimeMode'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('demo query and preference isolation', () => {
  it('requires explicit flags and accepts only the supported theme values', () => {
    expect(parseRuntimeMode('?demo=1&embed=1&theme=dark')).toEqual({ demo: true, embed: true, theme: 'dark' })
    expect(parseRuntimeMode('?demo=true&embed=0&theme=invalid')).toEqual({ demo: false, embed: false, theme: undefined })
    expect(parseRuntimeMode('?theme=light').theme).toBe('light')
  })

  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    it(`${kind}: reads, writes, enumeration and clearing never touch real preferences`, () => {
      const native = window[kind]
      native.setItem('prefs', 'real')
      native.setItem('sleepy-public-access', 'real-session')
      const demo = scopedStorage(() => native, DEMO_STORAGE_PREFIX)
      expect(demo.getItem('prefs')).toBeNull()
      expect(demo.length).toBe(0)
      demo.setItem('prefs', 'demo')
      demo.setItem('other', 'value')
      expect(demo.length).toBe(2)
      expect([demo.key(0), demo.key(1)].sort()).toEqual(['other', 'prefs'])
      expect(demo.key(2)).toBeNull()
      expect(demo.getItem('prefs')).toBe('demo')
      expect(native.getItem('prefs')).toBe('real')
      demo.removeItem('other')
      demo.clear()
      expect(native.getItem('prefs')).toBe('real')
      expect(native.getItem('sleepy-public-access')).toBe('real-session')
      expect(demo.length).toBe(0)
    })
  }

  it('keeps the existing storage keys in normal mode', () => {
    const normal = scopedStorage(() => window.localStorage, '')
    normal.setItem('sleepy_reminder_master', 'true')
    expect(window.localStorage.getItem('sleepy_reminder_master')).toBe('true')
  })
})
