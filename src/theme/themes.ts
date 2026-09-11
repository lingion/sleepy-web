/**
 * 主题系统 — ThemePresets.kt + Theme.kt 1:1
 * 5 套预设 × light/dark, M3 token 全量 CSS 变量映射。
 * WakeUpColorScheme 字段 → --md-* CSS 变量。
 */

export interface SchemeColors {
  primary: string
  onPrimary: string
  primaryContainer: string
  onPrimaryContainer: string
  secondary: string
  onSecondary: string
  secondaryContainer: string
  onSecondaryContainer: string
  tertiary: string
  onTertiary: string
  tertiaryContainer: string
  onTertiaryContainer: string
  background: string
  onBackground: string
  surface: string
  onSurface: string
  surfaceVariant: string
  onSurfaceVariant: string
  surfaceContainerLowest: string
  surfaceContainerLow: string
  surfaceContainer: string
  surfaceContainerHigh: string
  surfaceContainerHighest: string
  outline: string
  outlineVariant: string
  scrim: string
  error: string
  onError: string
  errorContainer: string
  onErrorContainer: string
}

export interface ThemePreset {
  key: string
  light: SchemeColors
  dark: SchemeColors
}

// 亮色公共 (spring/ocean/peach/slate 共用 M3 error 基线)
const lightError: Pick<SchemeColors, 'error' | 'onError' | 'errorContainer' | 'onErrorContainer'> = {
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
}
const darkError: Pick<SchemeColors, 'error' | 'onError' | 'errorContainer' | 'onErrorContainer'> = {
  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  default: {
    key: 'default',
    light: {
      primary: '#6750A4', onPrimary: '#FFFFFF', primaryContainer: '#EADDFF', onPrimaryContainer: '#21005D',
      secondary: '#625B71', onSecondary: '#FFFFFF', secondaryContainer: '#E8DEF8', onSecondaryContainer: '#1D192B',
      tertiary: '#7D5260', onTertiary: '#FFFFFF', tertiaryContainer: '#FFD8E4', onTertiaryContainer: '#31111D',
      background: '#FEF7FF', onBackground: '#1D1B20', surface: '#FEF7FF', onSurface: '#1D1B20',
      surfaceVariant: '#E7E0EC', onSurfaceVariant: '#49454F',
      surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#F7F2FA', surfaceContainer: '#F3EDF7',
      surfaceContainerHigh: '#ECE6F0', surfaceContainerHighest: '#E6E0E9',
      outline: '#79747E', outlineVariant: '#CAC4D0', scrim: '#000000',
      error: '#B3261E', onError: '#FFFFFF', errorContainer: '#F9DEDC', onErrorContainer: '#410E0B',
    },
    dark: {
      primary: '#D0BCFF', onPrimary: '#381E72', primaryContainer: '#4F378B', onPrimaryContainer: '#EADDFF',
      secondary: '#CCC2DC', onSecondary: '#332D41', secondaryContainer: '#4A4458', onSecondaryContainer: '#E8DEF8',
      tertiary: '#EFB8C8', onTertiary: '#492532', tertiaryContainer: '#633B48', onTertiaryContainer: '#FFD8E4',
      background: '#141218', onBackground: '#E6E0E9', surface: '#141218', onSurface: '#E6E0E9',
      surfaceVariant: '#49454F', onSurfaceVariant: '#CAC4D0',
      surfaceContainerLowest: '#0F0D13', surfaceContainerLow: '#1D1B20', surfaceContainer: '#211F26',
      surfaceContainerHigh: '#2B2930', surfaceContainerHighest: '#36343B',
      outline: '#938F99', outlineVariant: '#49454F', scrim: '#000000',
      error: '#F2B8B5', onError: '#601410', errorContainer: '#8C1D18', onErrorContainer: '#F9DEDC',
    },
  },
  spring: {
    key: 'spring',
    light: {
      primary: '#386A20', onPrimary: '#FFFFFF', primaryContainer: '#B7F397', onPrimaryContainer: '#002200',
      secondary: '#55624C', onSecondary: '#FFFFFF', secondaryContainer: '#D9E7CC', onSecondaryContainer: '#131F0F',
      tertiary: '#386666', onTertiary: '#FFFFFF', tertiaryContainer: '#BCEBEB', onTertiaryContainer: '#002020',
      background: '#FCFDF6', onBackground: '#1A1C18', surface: '#FCFDF6', onSurface: '#1A1C18',
      surfaceVariant: '#DFE4D7', onSurfaceVariant: '#43483E',
      surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#F6F7F0', surfaceContainer: '#F0F1EA',
      surfaceContainerHigh: '#EAEBE5', surfaceContainerHighest: '#E4E5DF',
      outline: '#74796D', outlineVariant: '#C4C8BC', scrim: '#000000',
      ...lightError,
    },
    dark: {
      primary: '#9CD67D', onPrimary: '#0A3900', primaryContainer: '#1E5109', onPrimaryContainer: '#B7F397',
      secondary: '#BDCBB1', onSecondary: '#273420', secondaryContainer: '#3D4B35', onSecondaryContainer: '#D9E7CC',
      tertiary: '#A0CFCF', onTertiary: '#003737', tertiaryContainer: '#1E4E4E', onTertiaryContainer: '#BCEBEB',
      background: '#1A1C18', onBackground: '#E3E3DC', surface: '#1A1C18', onSurface: '#E3E3DC',
      surfaceVariant: '#43483E', onSurfaceVariant: '#C4C8BC',
      surfaceContainerLowest: '#0D0F0C', surfaceContainerLow: '#22241F', surfaceContainer: '#262924',
      surfaceContainerHigh: '#31332E', surfaceContainerHighest: '#3C3E39',
      outline: '#8E9387', outlineVariant: '#43483E', scrim: '#000000',
      ...darkError,
    },
  },
  ocean: {
    key: 'ocean',
    light: {
      primary: '#0061A4', onPrimary: '#FFFFFF', primaryContainer: '#D1E4FF', onPrimaryContainer: '#001D36',
      secondary: '#535F70', onSecondary: '#FFFFFF', secondaryContainer: '#D7E3F7', onSecondaryContainer: '#101C2B',
      tertiary: '#6B5778', onTertiary: '#FFFFFF', tertiaryContainer: '#F2DAFF', onTertiaryContainer: '#251431',
      background: '#FDFCFF', onBackground: '#1A1C1E', surface: '#FDFCFF', onSurface: '#1A1C1E',
      surfaceVariant: '#DFE2EB', onSurfaceVariant: '#43474E',
      surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#F7F8FA', surfaceContainer: '#EEF0F4',
      surfaceContainerHigh: '#E8E9EE', surfaceContainerHighest: '#E2E3E8',
      outline: '#73777F', outlineVariant: '#C3C7CF', scrim: '#000000',
      ...lightError,
    },
    dark: {
      primary: '#9ECAFF', onPrimary: '#003258', primaryContainer: '#00497D', onPrimaryContainer: '#D1E4FF',
      secondary: '#BBC7DB', onSecondary: '#253140', secondaryContainer: '#3B4858', onSecondaryContainer: '#D7E3F7',
      tertiary: '#D6BEE4', onTertiary: '#3B2948', tertiaryContainer: '#523F5F', onTertiaryContainer: '#F2DAFF',
      background: '#1A1C1E', onBackground: '#E3E2E6', surface: '#1A1C1E', onSurface: '#E3E2E6',
      surfaceVariant: '#43474E', onSurfaceVariant: '#C3C7CF',
      surfaceContainerLowest: '#0D0F12', surfaceContainerLow: '#222426', surfaceContainer: '#26282C',
      surfaceContainerHigh: '#313338', surfaceContainerHighest: '#3C3E43',
      outline: '#8D9199', outlineVariant: '#43474E', scrim: '#000000',
      ...darkError,
    },
  },
  peach: {
    key: 'peach',
    light: {
      primary: '#9D4400', onPrimary: '#FFFFFF', primaryContainer: '#FFDBC8', onPrimaryContainer: '#341000',
      secondary: '#765848', onSecondary: '#FFFFFF', secondaryContainer: '#FFDBC8', onSecondaryContainer: '#2B160A',
      tertiary: '#636032', onTertiary: '#FFFFFF', tertiaryContainer: '#E9E4AA', onTertiaryContainer: '#1E1C00',
      background: '#FFFBFF', onBackground: '#201A17', surface: '#FFFBFF', onSurface: '#201A17',
      surfaceVariant: '#F4DED4', onSurfaceVariant: '#52443D',
      surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#FFF4ED', surfaceContainer: '#FCEEE5',
      surfaceContainerHigh: '#F6E8DE', surfaceContainerHighest: '#F0E2D7',
      outline: '#85746C', outlineVariant: '#D7C2B8', scrim: '#000000',
      ...lightError,
    },
    dark: {
      primary: '#FFB689', onPrimary: '#552100', primaryContainer: '#783200', onPrimaryContainer: '#FFDBC8',
      secondary: '#E6C0AB', onSecondary: '#442B1D', secondaryContainer: '#5D4132', onSecondaryContainer: '#FFDBC8',
      tertiary: '#CCC890', onTertiary: '#333208', tertiaryContainer: '#4A481D', onTertiaryContainer: '#E9E4AA',
      background: '#201A17', onBackground: '#ECE0DA', surface: '#201A17', onSurface: '#ECE0DA',
      surfaceVariant: '#52443D', onSurfaceVariant: '#D7C2B8',
      surfaceContainerLowest: '#1A120E', surfaceContainerLow: '#28221E', surfaceContainer: '#2D2622',
      surfaceContainerHigh: '#38312D', surfaceContainerHighest: '#433C37',
      outline: '#A08D84', outlineVariant: '#52443D', scrim: '#000000',
      ...darkError,
    },
  },
  slate: {
    key: 'slate',
    light: {
      primary: '#3F4945', onPrimary: '#FFFFFF', primaryContainer: '#C3D2CD', onPrimaryContainer: '#00201C',
      secondary: '#4F635E', onSecondary: '#FFFFFF', secondaryContainer: '#D2E7E0', onSecondaryContainer: '#0B1D1A',
      tertiary: '#3D6373', onTertiary: '#FFFFFF', tertiaryContainer: '#C0E8FA', onTertiaryContainer: '#001F29',
      background: '#FAFDFB', onBackground: '#191C1B', surface: '#FAFDFB', onSurface: '#191C1B',
      surfaceVariant: '#DBE5E1', onSurfaceVariant: '#3F4945',
      surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#F4F6F4', surfaceContainer: '#EEF1EE',
      surfaceContainerHigh: '#E8EBE9', surfaceContainerHighest: '#E2E5E3',
      outline: '#6F7975', outlineVariant: '#BEC9C4', scrim: '#000000',
      ...lightError,
    },
    dark: {
      primary: '#A7C2BD', onPrimary: '#0E2E29', primaryContainer: '#25403C', onPrimaryContainer: '#C3D2CD',
      secondary: '#B6CBC4', onSecondary: '#213530', secondaryContainer: '#384B47', onSecondaryContainer: '#D2E7E0',
      tertiary: '#A4CCDE', onTertiary: '#073542', tertiaryContainer: '#234B5A', onTertiaryContainer: '#C0E8FA',
      background: '#191C1B', onBackground: '#E0E3E0', surface: '#191C1B', onSurface: '#E0E3E0',
      surfaceVariant: '#3F4945', onSurfaceVariant: '#BEC9C4',
      surfaceContainerLowest: '#0B0F0E', surfaceContainerLow: '#212523', surfaceContainer: '#252927',
      surfaceContainerHigh: '#303432', surfaceContainerHighest: '#3B3F3D',
      outline: '#89938F', outlineVariant: '#3F4945', scrim: '#000000',
      ...darkError,
    },
  },
}

/** SchemeColors → CSS 变量声明块 */
export function schemeToCss(s: SchemeColors): string {
  return Object.entries(s)
    .map(([k, v]) => `--md-${kebab(k)}: ${v};`)
    .join('\n  ')
}

function kebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase()
}

/** 把主题应用到 document — data-theme + 亮暗 CSS 变量 */
export function applyTheme(themeKey: string, isDark: boolean): void {
  const preset = THEME_PRESETS[themeKey] ?? THEME_PRESETS.default
  const scheme = isDark ? preset.dark : preset.light
  const el = document.documentElement
  el.dataset.theme = preset.key
  el.dataset.mode = isDark ? 'dark' : 'light'
  for (const [k, v] of Object.entries(scheme)) {
    el.style.setProperty(`--md-${kebab(k)}`, v)
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', scheme.background)
}

/** Alpha 常量 — Theme.kt Alpha object 1:1 */
export const ALPHA = {
  highContent: 0.8,
  hairline: 0.3,
  tinted: 0.12,
  inactive: 0.6,
} as const
