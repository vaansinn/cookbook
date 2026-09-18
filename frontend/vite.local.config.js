// Preserve the default preview/build workflow; opt in for local PostgreSQL dev.
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.js'

export default mergeConfig(base, defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:5100', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:5100', changeOrigin: true },
    },
  },
}))
