import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the Flask dev server so the browser sees one origin.
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Flask's serve_react() catchall in app.py reads from here.
    outDir: "../static",
    emptyOutDir: true,
  },
})
