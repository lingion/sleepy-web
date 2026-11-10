/** Shared renderer for the original Material Outlined paths. */
import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  color?: string
  style?: CSSProperties
}

// ── 官方 Material Outlined 24px 图标 (google/material-design-icons outlined 变体)
// 几何逐字节来自官方 SVG path 数据;fill=currentColor 描出轮廓,非 stroke 近似
export function outlineSvg(path: string): (props: IconProps) => JSX.Element {
  return function Icon({ size = 24, color, style }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ display: 'block', color, ...style }}
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    )
  }
}

