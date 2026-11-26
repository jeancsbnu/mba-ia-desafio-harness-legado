import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// A porta do front vem de WEB_PORT, que o `npm run up` grava no web/.env.local
// de cada cópia: `npm run dev` direto em web/ também usa a porta da cópia.
// Sem .env.local (cópia que nunca subiu), vale a porta de sempre.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'WEB_')
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT) || 5173,
      strictPort: true,
    },
  }
})
