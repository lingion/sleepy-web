/**
 * Android strings.xml 占位 (%1$s / %1$d) → i18next ({{name}})。
 * 按位置命名: %1 → v1, %2 → v2; 调用方传 { v1: ... }。
 * 数组值 (@*_format 等复数形态) 原样保留首元素外的形态, 仅转换字符串元素。
 */
function convertAndroidPlaceholders(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/%(\d+)\$[sdf]/g, (_, n: string) => `{{v${n}}}`)
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === 'string'
          ? item.replace(/%(\d+)\$[sd]/g, (_, n: string) => `{{v${n}}}`)
          : item
      )
    } else {
      out[k] = v
    }
  }
  return out
}

/** Convert and merge only the language being requested. */
export function buildTranslation(base: Record<string, unknown>, extras: Record<string, string>): Record<string, unknown> {
  return Object.assign(convertAndroidPlaceholders(base), extras)
}
