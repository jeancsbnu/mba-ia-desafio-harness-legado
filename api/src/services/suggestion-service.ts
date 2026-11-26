import { DomainError } from '../domain/errors'
import { CurrentUser, Ticket } from '../domain/ticket'
import { UserRepository } from '../repositories/user-repository'

type TicketAccess = { getById(user: CurrentUser, id: string): Promise<Ticket> }
type SuggestReply = (input: { customerName: string; title: string; description: string }) => Promise<string>

// Sugestão de resposta para atendentes e admins. A IA (fake ou OpenAI) entra
// pela função `suggestReply` de api/src/integrations/, injetada no main.ts.
export class SuggestionService {
  constructor(
    private tickets: TicketAccess,
    private users: Pick<UserRepository, 'findById'>,
    private suggestReply: SuggestReply,
  ) {}

  async suggest(user: CurrentUser, ticketId: string) {
    if (user.role === 'customer') {
      throw new DomainError('forbidden', 'Só atendentes e admins podem pedir sugestão')
    }
    const ticket = await this.tickets.getById(user, ticketId)
    const customer = await this.users.findById(ticket.customerId)
    const customerName = customer ? customer.name : 'cliente'
    return this.suggestReply({ customerName, title: ticket.title, description: ticket.description })
  }
}
