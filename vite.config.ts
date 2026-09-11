import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 子路径部署: https://lingion.github.io/sleepy/
export default defineConfig({
  plugins: [react()],
  base: '/sleepy/',
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/e2e/**'],
  },
})
