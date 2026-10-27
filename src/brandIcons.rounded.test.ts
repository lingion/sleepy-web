import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

// 2026-10-27 用户定令: 所有方形尖角 Sleepy logo 一律改圆角矩形。
// 品牌几何唯一源 = favicon.svg 底版 rect rx=115/512(iOS AppIcon 比例),位图按同比例圆角。
// 五点采样断言: 四角透明(圆角生效)+ 中心保留 + 上/左外缘中点保留 ——
// 中心与外缘中点同时不透明才能区分「真圆角」与「整图蒙掉/缩小」。
// maskable 双图反向锁: 四角必须保持不透明(系统遮罩要求全幅方图,圆角即回归)。

const asset = (p: string) => new URL(p, import.meta.url)

function decodePng(p: URL) {
  const png = PNG.sync.read(readFileSync(p))
  const alphaAt = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3]
  return { w: png.width, h: png.height, alphaAt }
}

function expectRounded(label: string, p: URL) {
  return () => {
    const { w, h, alphaAt } = decodePng(p)
    for (const [x, y] of [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ]) {
      expect(alphaAt(x, y), `${label} 角 (${x},${y}) 应透明`).toBe(0)
    }
    expect(alphaAt(w >> 1, h >> 1), `${label} 中心应不透明`).toBe(255)
    expect(alphaAt(w >> 1, 0), `${label} 上缘中点应不透明`).toBe(255)
    expect(alphaAt(0, h >> 1), `${label} 左缘中点应不透明`).toBe(255)
  }
}

function expectFullBleed(label: string, p: URL) {
  return () => {
    const { w, h, alphaAt } = decodePng(p)
    for (const [x, y] of [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ]) {
      expect(alphaAt(x, y), `${label} 角 (${x},${y}) 必须保持不透明(maskable 全幅要求)`).toBe(255)
    }
  }
}

describe('品牌位图圆角化(用户定令 2026-10-27)', () => {
  it('sleepy-logo.png(1024 母图)四角透明、中心与外缘中点保留', expectRounded('sleepy-logo', asset('../public/assets/sleepy-logo.png')))
  it('pwa-192.png 四角透明、中心与外缘中点保留', expectRounded('pwa-192', asset('../public/assets/pwa-192.png')))
  it('pwa-512.png 四角透明、中心与外缘中点保留', expectRounded('pwa-512', asset('../public/assets/pwa-512.png')))
})

describe('maskable 图标免伤锁(系统遮罩要求全幅方图)', () => {
  it('pwa-maskable-192.png 四角保持不透明', expectFullBleed('pwa-maskable-192', asset('../public/assets/pwa-maskable-192.png')))
  it('pwa-maskable-512.png 四角保持不透明', expectFullBleed('pwa-maskable-512', asset('../public/assets/pwa-maskable-512.png')))
})

describe('品牌 SVG 与标签页引用', () => {
  it('favicon.svg 底版 rect 携带 rx=115(尖角底版即回归)', () => {
    const svg = readFileSync(asset('../public/favicon.svg'), 'utf8')
    expect(svg).toMatch(/<rect width="512" height="512" rx="115"/)
  })

  it('index.html 标签页图标首选圆角 SVG(PNG 仅兜底)', () => {
    const html = readFileSync(asset('../index.html'), 'utf8')
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg" \/>/)
  })
})
