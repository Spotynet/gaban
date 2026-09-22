import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, /api va al backend FastAPI
      '/api': 'http://localhost:8000'
    }
  }
})
