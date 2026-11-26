import { Router } from 'express'
import { StatsService } from '../../services/stats-service'
import { asyncHandler } from '../errors'
import { requireAuth, requireRole } from '../middlewares/auth'

export function statsRoutes(stats: StatsService) {
  const router = Router()

  router.get(
    '/',
    requireAuth,
    requireRole('admin'),
    asyncHandler(async (_req, res) => {
      res.json(await stats.summary())
    }),
  )

  return router
}
