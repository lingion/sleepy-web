import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 子路径部署: https://lingion.github.io/sleepy-web/
// Pages URL 由仓库名决定 → base 必须 = /sleepy-web/
// BASE_PATH 环境变量可覆盖 (deploy.yml 与本地构建同源)
const BASE = process.env.BASE_PATH || '/sleepy-web/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/e2e/**'],
  },
})
