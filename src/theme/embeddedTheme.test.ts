import { describe, expect, it } from 'vitest'
import { THEME_PRESETS, applyTheme, themeSnapshot } from './themes'
describe('full app theme snapshot', () => {
  it('publishes both palettes in site Material token form', () => {
    const snapshot = themeSnapshot('ocean', true)
    expect(snapshot.type).toBe('sleepy:theme')
    expect(snapshot.mode).toBe('dark')
    expect(snapshot.schemes.light['primary']).toBe(THEME_PRESETS.ocean.light.primary)
    expect(snapshot.schemes.dark['surface-container-low']).toBe(THEME_PRESETS.ocean.dark.surfaceContainerLow)
    expect(snapshot.schemes.dark['on-primary']).toBe(THEME_PRESETS.ocean.dark.onPrimary)
  })
  it('exports the native M3 surfaceBright token for glass menus and alerts in every palette', () => {
    for(const key of Object.keys(THEME_PRESETS)) for(const dark of [false,true]) {
      applyTheme(key,dark)
      const expected=dark?'#3B383E':'#FEF7FF'
      expect(document.documentElement.style.getPropertyValue('--md-surface-bright')).toBe(expected)
      expect(themeSnapshot(key,dark).schemes[dark?'dark':'light']['surface-bright']).toBe(expected)
    }
  })
})
