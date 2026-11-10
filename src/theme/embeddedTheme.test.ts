import { describe, expect, it } from 'vitest'
import { THEME_PRESETS, themeSnapshot } from './themes'
describe('full app theme snapshot', () => {
  it('publishes both palettes in site Material token form', () => {
    const snapshot = themeSnapshot('ocean', true)
    expect(snapshot.type).toBe('sleepy:theme')
    expect(snapshot.mode).toBe('dark')
    expect(snapshot.schemes.light['primary']).toBe(THEME_PRESETS.ocean.light.primary)
    expect(snapshot.schemes.dark['surface-container-low']).toBe(THEME_PRESETS.ocean.dark.surfaceContainerLow)
    expect(snapshot.schemes.dark['on-primary']).toBe(THEME_PRESETS.ocean.dark.onPrimary)
  })
})
