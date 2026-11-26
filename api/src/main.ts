import { httpConfig } from './config/http'
import { storageConfig } from './config/storage'
import { createApp } from './http/app'
import { suggestReply } from './integrations/ai-client'
import { attachmentRepository } from './repositories/attachment-repository'
import { pingDatabase } from './repositories/prisma'
import { replyRepository } from './repositories/reply-repository'
import { ticketRepository } from './repositories/ticket-repository'
import { userRepository } from './repositories/user-repository'
import { AttachmentService } from './services/attachment-service'
import { AuthService } from './services/auth-service'
import { StatsService } from './services/stats-service'
import { SuggestionService } from './services/suggestion-service'
import { TicketService } from './services/ticket-service'

// Composição da API: repositórios -> serviços -> rotas.
const tickets = new TicketService(ticketRepository, replyRepository)

const app = createApp({
  tickets,
  attachments: new AttachmentService(attachmentRepository, tickets, storageConfig.uploadDir),
  suggestions: new SuggestionService(tickets, userRepository, suggestReply),
  auth: new AuthService(userRepository),
  stats: new StatsService(ticketRepository),
  checkDatabase: pingDatabase,
})

app.listen(httpConfig.port, () => {
  console.log(`API rodando na porta ${httpConfig.port}`)
})
