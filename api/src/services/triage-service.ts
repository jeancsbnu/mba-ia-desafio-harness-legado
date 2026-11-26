import { TicketCategory, TicketPriority } from '../domain/ticket'
import { TriageQueue } from '../repositories/ticket-repository'

type Classify = (ticket: { title: string; description: string }) => Promise<{ category: TicketCategory; priority: TicketPriority }>

const LOTE = 10

// Uma rodada da triagem: classifica até 10 chamados pendentes, do mais antigo
// para o mais novo. Falha num chamado marca só ele como "failed".
export class TriageService {
  constructor(
    private queue: TriageQueue,
    private classify: Classify,
    private log: (message: string) => void = console.log,
  ) {}

  async runOnce() {
    const tickets = await this.queue.findPendingTriage(LOTE)
    for (const ticket of tickets) {
      try {
        const result = await this.classify(ticket)
        await this.queue.update(ticket.id, { category: result.category, priority: result.priority, triageStatus: 'done' })
        this.log(`chamado ${ticket.id} triado: ${result.category}/${result.priority}`)
      } catch (err) {
        this.log(`falha na triagem do chamado ${ticket.id}: ${(err as Error).message}`)
        await this.queue.update(ticket.id, { triageStatus: 'failed' })
      }
    }
  }
}
