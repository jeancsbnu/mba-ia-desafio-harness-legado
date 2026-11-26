import { Router } from 'express'

// `checkDatabase` vem do main.ts: a rota não fala com o banco diretamente.
export function healthRoutes(checkDatabase: () => Promise<void>) {
  const router = Router()

  router.get('/', async (_req, res) => {
    try {
      await checkDatabase()
      res.json({ status: 'ok', db: 'ok' })
    } catch (err) {
      console.log('health: banco fora', err)
      res.status(503).json({ error: 'db_unavailable', message: 'Banco de dados não responde' })
    }
  })

  return router
}
