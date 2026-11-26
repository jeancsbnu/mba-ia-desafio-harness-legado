import { TicketCategory, TicketPriority, TicketStatus } from '../domain/ticket'
import { TicketStatsSource } from '../repositories/ticket-repository'

export class StatsService {
  constructor(private source: TicketStatsSource) {}

  // Contagem de chamados por status, categoria e prioridade. Chamado ainda sem
  // triagem entra como "untriaged"; toda chave aparece, mesmo com zero.
  async summary() {
    const counts = await this.source.countGrouped()

    const byStatus: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0 }
    for (const row of counts.byStatus) byStatus[row.status] = row.count

    const byCategory: Record<TicketCategory | 'untriaged', number> = {
      billing: 0,
      technical: 0,
      account: 0,
      other: 0,
      untriaged: 0,
    }
    for (const row of counts.byCategory) byCategory[row.category || 'untriaged'] = row.count

    const byPriority: Record<TicketPriority | 'untriaged', number> = { low: 0, medium: 0, high: 0, urgent: 0, untriaged: 0 }
    for (const row of counts.byPriority) byPriority[row.priority || 'untriaged'] = row.count

    return { byStatus, byCategory, byPriority }
  }
}
