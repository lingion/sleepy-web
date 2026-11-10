import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { parallelBootstrap } from './src/startup/parallelBootstrap.mjs'

// GitHub Pages 子路径部署: https://lingion.github.io/sleepy-web/
// Pages URL 由仓库名决定 → base 必须 = /sleepy-web/
// BASE_PATH 环境变量可覆盖 (deploy.yml 与本地构建同源)
const configuredBase = process.env.BASE_PATH || '/sleepy-web/'
// The root deployment is also served intact below the official site's
// /preview/ proxy. Relative chunk/preload URLs follow the importing module at
// either mount; rewriting only index.html cannot repair absolute URLs in JS.
const BASE = configuredBase === '/' ? './' : configuredBase

export default defineConfig({
  plugins: [react(), parallelBootstrap()],
  base: BASE,
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/e2e/**'],
  },
})
