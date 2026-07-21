import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    'import.meta.env.VITE_API_MODE': JSON.stringify('mock'),
    'import.meta.env.VITE_AMAP_KEY': JSON.stringify(''),
    'import.meta.env.VITE_AMAP_SECURITY_CODE': JSON.stringify('')
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true
  }
})
