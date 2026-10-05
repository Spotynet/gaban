import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = process.env.VITE_API_PROXY || 'http://127.0.0.1:3015'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3014,
    strictPort: true,
    allowedHosts: [
      'gaban-dev.spotynet.com',
      'gaban.spotynet.com',
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      // Direct Vite hits (optional). Through project nginx, /api is proxied there.
      '/api': apiProxy,
    },
  },
})
