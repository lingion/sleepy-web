import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/sleepy/',
  test: {
    environment: 'node',
    globals: true,
    include: ['src/e2e/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 30000,
  },
})
