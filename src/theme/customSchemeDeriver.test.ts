/**
 * customSchemeDeriver 单测 — 与 CustomSchemeDeriver.kt 语义逐条对齐。
 */

import { describe, expect, it } from 'vitest'
import {
  deriveCustomScheme,
  hexAtHue,
  normalizeHue,
  parseHex,
  rgbToHsv,
  hsvToRgb255,
  surfacePreviewHex,
} from './customSchemeDeriver'
import { THEME_PRESETS } from './themes'
import type { CustomTheme } from '../data/customThemeStore'

const base: CustomTheme = {
  id: 't1',
  name: '测试',
  primary: '#FF0000', // 红相 0°
  secondary: '#00FF00', // 绿相 120°
  tertiary: '#0000FF', // 蓝相 240°
  surfaceHue: 200,
  surfaceChroma: 8,
  createdAt: 0,
}

function hueOfHex(hex: string): number | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [h, s] = rgbToHsv(...rgb)
  return s < 1e-4 ? null : h
}

describe('rgbToHsv / hsvToRgb255', () => {
  it('原色色相正确', () => {
    expect(rgbToHsv(1, 0, 0)[0]).toBeCloseTo(0)
    expect(rgbToHsv(0, 1, 0)[0]).toBeCloseTo(120)
    expect(rgbToHsv(0, 0, 1)[0]).toBeCloseTo(240)
    expect(rgbToHsv(1, 1, 1)[1]).toBe(0) // 白 → s=0
  })

  it('往返误差 ≤ 1/255', () => {
    const hueDist = (a: number, b: number) => {
      const d = Math.abs(a - b) % 360
      return Math.min(d, 360 - d)
    }
    for (const [h, s, v] of [[0, 0.7, 0.55], [137, 0.4, 0.5], [275, 0.9, 1], [359, 0.1, 0.2]] as const) {
      const hex = hexAtHue(h, s, v)
      const rgb = parseHex(hex)!
      const [h2, s2, v2] = rgbToHsv(...rgb)
      expect(hueDist(h2, h)).toBeLessThan(1.5)
      expect(Math.abs(s2 - s)).toBeLessThan(0.01)
      expect(Math.abs(v2 - v)).toBeLessThan(0.01)
    }
  })

  it('越界输入收敛不抛', () => {
    expect(hsvToRgb255(-30, 2, -1)).toEqual([0, 0, 0])
    expect(() => hsvToRgb255(NaN, 0.5, 0.5)).not.toThrow()
  })
})

describe('normalizeHue', () => {
  it('负值/超界/NaN 收敛到 [0,360)', () => {
    expect(normalizeHue(-40)).toBeCloseTo(320)
    expect(normalizeHue(400)).toBeCloseTo(40)
    expect(normalizeHue(NaN)).toBe(0)
    expect(normalizeHue(Infinity)).toBe(0)
  })
})

describe('parseHex', () => {
  it('6/8 位解析, 非法返回 null', () => {
    expect(parseHex('#FF8000')).toEqual([1, 128 / 255, 0])
    expect(parseHex('#80FF8000')).toEqual([1, 128 / 255, 0]) // AARRGGBB 丢 alpha
    expect(parseHex('red')).toBeNull()
    expect(parseHex('#GGGGGG')).toBeNull()
    expect(parseHex('#FFF')).toBeNull()
  })
})

describe('deriveCustomScheme', () => {
  const light = deriveCustomScheme(base, false)
  const dark = deriveCustomScheme(base, true)
  const tpl = THEME_PRESETS.default

  it('primary 族换到种子色相 (红 0°)', () => {
    expect(hueOfHex(light.primary)).toBeCloseTo(0, 0)
    expect(hueOfHex(light.primaryContainer)).toBeCloseTo(0, 0)
    expect(hueOfHex(dark.primary)).toBeCloseTo(0, 0)
  })

  it('secondary/tertiary 族各自换相', () => {
    expect(hueOfHex(light.secondary)).toBeCloseTo(120, 0)
    expect(hueOfHex(light.tertiary)).toBeCloseTo(240, 0)
  })

  it('S/V 结构照抄模板 — 派生 primary 与模板 primary 明度一致', () => {
    const [, , vTpl] = rgbToHsv(...parseHex(tpl.light.primary)!)
    const [, , vDerived] = rgbToHsv(...parseHex(light.primary)!)
    expect(Math.abs(vTpl - vDerived)).toBeLessThan(0.01)
  })

  it('表面族用 surfaceHue + 低 chroma, 明度照抄模板', () => {
    const hueDist = (a: number, b: number) => {
      const d = Math.abs(a - b) % 360
      return Math.min(d, 360 - d)
    }
    for (const role of ['background', 'surface', 'surfaceVariant', 'outline', 'surfaceContainerHigh'] as const) {
      // 8bit 量化 + 低 chroma 对量化最敏感, 允许 ≤2.5° 色相漂移
      expect(hueDist(hueOfHex(light[role])!, 200)).toBeLessThan(2.5)
      const [, s] = rgbToHsv(...parseHex(light[role])!)
      expect(s).toBeLessThanOrEqual(0.08 + 0.01)
      const [, , vTpl] = rgbToHsv(...parseHex(tpl.light[role])!)
      const [, , v] = rgbToHsv(...parseHex(light[role])!)
      expect(Math.abs(v - vTpl)).toBeLessThan(0.01)
    }
  })

  it('error 族与 scrim 照抄模板', () => {
    expect(light.error).toBe(tpl.light.error)
    expect(light.onErrorContainer).toBe(tpl.light.onErrorContainer)
    expect(dark.error).toBe(tpl.dark.error)
    expect(light.scrim).toBe(tpl.light.scrim)
  })

  it('on* 文字色按底色亮度自适应', () => {
    // 红 (lum≈0.299) → 白字; 亮黄 primary → 黑字
    const red = deriveCustomScheme({ ...base, primary: '#FF0000' }, false)
    expect(red.onPrimary).toBe('#FFFFFF')
    const yellow = deriveCustomScheme({ ...base, primary: '#FFFF00' }, false)
    expect(yellow.onPrimary).toBe('#000000')
  })

  it('无色相种子 → 模板同角色色相兜底', () => {
    const gray = deriveCustomScheme({ ...base, primary: '#808080' }, false)
    const hueTpl = hueOfHex(tpl.light.primary)!
    expect(hueOfHex(gray.primary)).toBeCloseTo(hueTpl, 0)
  })

  it('坏 hex 种子不抛, 回落模板', () => {
    const broken = deriveCustomScheme({ ...base, primary: 'oops', secondary: '#ZZ' }, false)
    expect(broken.primary).toBe(tpl.light.primary)
  })

  it('surfaceChroma 超 48 钳幅', () => {
    const wild = deriveCustomScheme({ ...base, surfaceChroma: 200 }, false)
    const [, s] = rgbToHsv(...parseHex(wild.surface)!)
    expect(s).toBeLessThanOrEqual(0.48 + 0.01)
  })

  it('30 角色全非空 hex', () => {
    for (const scheme of [light, dark]) {
      for (const [k, v] of Object.entries(scheme)) {
        expect(v, k).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })
})

describe('hexAtHue / surfacePreviewHex', () => {
  it('输出大写 #RRGGBB', () => {
    expect(hexAtHue(0, 1, 1)).toBe('#FF0000')
    expect(surfacePreviewHex(265, 8)).toMatch(/^#[0-9A-F]{6}$/)
  })
})
