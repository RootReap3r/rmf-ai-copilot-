import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During `npm run dev`, proxy /api requests to the local backend
// so the frontend can call relative paths like /api/chat.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
