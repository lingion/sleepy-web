/**
 * 自定义主题存储 — CustomThemeStore.kt + CustomThemeCore 1:1。
 *
 * 不存最终颜色, 存 4 个"源角色"种子(primary/secondary/tertiary 种子色 +
 * surfaceHue/surfaceChroma 表面倾向); 完整 SchemeColors 由
 * src/theme/customSchemeDeriver 按 M3 角色关系派生, 深浅两套同源。
 *
 * 存储: localStorage JSON 数组(Android SharedPreferences JSON 同构, 形状见 toJson)。
 * 容错语义对齐 HolidayManager: 整文档损坏 → 空列表; 坏行(缺 id)跳过、好行保留;
 * 缺可选数值字段落默认值而非整行丢弃(向后兼容)。
 */

/**
 * 用户在编辑器里配出的主题。不存最终颜色, 存种子:
 * primary/secondary/tertiary 为 "#RRGGBB" 种子色, 表面族只存色相倾向(0-360)
 * + 低饱和 chroma(推荐 4-12), 明度结构由派生引擎按模板给。
 */
export interface CustomTheme {
  id: string
  name: string
  /** 主交互色种子(按钮/选中态/当前周胶囊/链接色),"#RRGGBB" */
  primary: string
  /** 次级强调种子(芯片/次级容器底色),"#RRGGBB" */
  secondary: string
  /** 第三强调种子(节次 chip 等点缀),"#RRGGBB" */
  tertiary: string
  /** 表面中性色色相倾向 0-360(与 primary 同相 = 主题氛围一致性来源) */
  surfaceHue: number
  /** 表面中性色饱和度倾向, 推荐 4-12(0=纯灰, 过高=彩色表面) */
  surfaceChroma: number
  /** 创建时间, epoch 秒 (Android createdAt 同单位) */
  createdAt: number
}

export const CUSTOM_KEY_PREFIX = 'custom:'

/** localStorage key — 存 JSON 数组字符串 (Android KEY_THEMES 同名) */
export const KEY_THEMES = 'custom_themes'

/** 缺省表面色相 — 与默认淡紫模板的紫相一致 */
export const DEFAULT_SURFACE_HUE = 265
/** 缺省表面饱和度 — 低 chroma 中性色推荐区间(4-12)中值 */
export const DEFAULT_SURFACE_CHROMA = 8

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 非安全上下文回落 — 拼一个足够唯一的 v4 形状
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function toJson(themes: CustomTheme[]): string {
  return JSON.stringify(
    themes.map((t) => ({
      id: t.id,
      name: t.name,
      primary: t.primary,
      secondary: t.secondary,
      tertiary: t.tertiary,
      surfaceHue: t.surfaceHue,
      surfaceChroma: t.surfaceChroma,
      createdAt: t.createdAt,
    })),
  )
}

export function parse(json: string): CustomTheme[] {
  try {
    const arr: unknown = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    const out: CustomTheme[] = []
    for (const row of arr) {
      if (typeof row !== 'object' || row === null) continue
      const r = row as Record<string, unknown>
      // id 是唯一键(upsert/delete/getById 都靠它),缺失行不可救 — 跳过
      if (typeof r.id !== 'string' || r.id.trim() === '') continue
      out.push({
        id: r.id,
        name: typeof r.name === 'string' ? r.name : '',
        primary: typeof r.primary === 'string' ? r.primary : '#6750A4',
        secondary: typeof r.secondary === 'string' ? r.secondary : '#625B71',
        tertiary: typeof r.tertiary === 'string' ? r.tertiary : '#7D5260',
        surfaceHue: typeof r.surfaceHue === 'number' && Number.isFinite(r.surfaceHue) ? r.surfaceHue : DEFAULT_SURFACE_HUE,
        surfaceChroma: typeof r.surfaceChroma === 'number' && Number.isFinite(r.surfaceChroma) ? r.surfaceChroma : DEFAULT_SURFACE_CHROMA,
        createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0,
      })
    }
    return out
  } catch {
    // 损坏 JSON 容错 — Android diskCache try-catch 空列表语义
    return []
  }
}

/** upsert by id:存在即原位替换,不存在追加尾部 */
export function upsert(list: CustomTheme[], theme: CustomTheme): CustomTheme[] {
  const idx = list.findIndex((t) => t.id === theme.id)
  if (idx >= 0) list[idx] = theme
  else list.push(theme)
  return list
}

/** 删除指定 id;@return 是否真的删了(未知 id = false,列表不动) */
export function removeFrom(list: CustomTheme[], id: string): boolean {
  const idx = list.findIndex((t) => t.id === id)
  if (idx < 0) return false
  list.splice(idx, 1)
  return true
}

export function getById(list: CustomTheme[], id: string): CustomTheme | undefined {
  return list.find((t) => t.id === id)
}

// ── localStorage 门面 (Android CustomThemeStore 薄桥接同构) ──

function loadAll(): CustomTheme[] {
  if (typeof localStorage === 'undefined') return []
  const json = localStorage.getItem(KEY_THEMES)
  if (json == null) return []
  return parse(json)
}

function saveAll(themes: CustomTheme[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY_THEMES, toJson(themes))
}

export function getAllThemes(): CustomTheme[] {
  return loadAll()
}

export function getThemeById(id: string): CustomTheme | undefined {
  return getById(loadAll(), id)
}

/** upsert by id — 编辑既有主题复用同入口 */
export function saveTheme(theme: CustomTheme): void {
  const list = loadAll()
  saveAll(upsert(list, theme))
}

/** 删除;@return 是否真的删了 */
export function deleteTheme(id: string): boolean {
  const list = loadAll()
  const removed = removeFrom(list, id)
  if (removed) saveAll(list)
  return removed
}
