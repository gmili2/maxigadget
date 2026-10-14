import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// L'API NestJS (backend/) tourne sur le port 3000 ; le proxy garde le front et l'API sur la même origine
// (le cookie de session admin est SameSite=Strict).
const api = { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false }
// /api couvre aussi /api/uploads (images envoyées depuis l'admin).
const proxy = { '/api': api }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
