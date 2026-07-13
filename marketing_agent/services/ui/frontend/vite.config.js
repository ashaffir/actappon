import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['msoa.actappon.com', 'localhost', '127.0.0.1'],
    watch: {
      usePolling: true
    }
  }
})
