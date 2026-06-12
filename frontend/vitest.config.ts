import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify('2026-01-01T00:00:00.000Z'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/test/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
