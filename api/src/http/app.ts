import express from 'express'
import cors from 'cors'
import { httpConfig } from '../config/http'
import { AttachmentService } from '../services/attachment-service'
import { AuthService } from '../services/auth-service'
import { StatsService } from '../services/stats-service'
import { SuggestionService } from '../services/suggestion-service'
import { TicketService } from '../services/ticket-service'
import { errorHandler, notFoundHandler } from './errors'
import { attachmentRoutes } from './routes/attachments'
import { authRoutes } from './routes/auth'
import { healthRoutes } from './routes/health'
import { statsRoutes } from './routes/stats'
import { ticketRoutes } from './routes/tickets'

// A camada HTTP recebe os serviços prontos (montados no main.ts) e não
// conhece repositórios nem o Prisma (regra G4).
type AppServices = {
  tickets: TicketService
  attachments: AttachmentService
  suggestions: SuggestionService
  auth: AuthService
  stats: StatsService
  checkDatabase: () => Promise<void>
}

export function createApp(services: AppServices) {
  const app = express()

  app.use(cors({ origin: httpConfig.corsOrigin }))
  app.use(express.json())

  app.use('/api/health', healthRoutes(services.checkDatabase))
  app.use('/api/auth', authRoutes(services.auth))
  app.use(
    '/api/tickets',
    ticketRoutes({ tickets: services.tickets, attachments: services.attachments, suggestions: services.suggestions }),
  )
  app.use('/api/attachments', attachmentRoutes(services.attachments))
  app.use('/api/stats', statsRoutes(services.stats))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
