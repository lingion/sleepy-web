/** 测试视口工具 — jsdom 默认 1024×768 会落平板横屏分支, 需要显式锁形态 */
export function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: h })
  window.dispatchEvent(new Event('resize'))
}
