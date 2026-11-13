import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_DEPLOYMENT_ENV': JSON.stringify(process.env.VERCEL_ENV || 'local'),
  },
  server: { host: '0.0.0.0', port: 3000, allowedHosts: ['.e2b.app'] }
})
