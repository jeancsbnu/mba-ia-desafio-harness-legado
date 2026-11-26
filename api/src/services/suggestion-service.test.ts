import { describe, expect, it } from 'vitest'
import { DomainError } from '../domain/errors'
import { CurrentUser, Ticket } from '../domain/ticket'
import { User } from '../domain/user'
import { SuggestionService } from './suggestion-service'

const ticket: Ticket = {
  id: 't1',
  title: 'Erro no login',
  description: 'Não consigo entrar desde ontem',
  status: 'open',
  category: null,
  priority: null,
  triageStatus: 'pending',
  customerId: 'c1',
  assigneeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const maria: User = { id: 'c1', name: 'Maria', email: 'maria@x.com', passwordHash: 'x', role: 'customer', createdAt: new Date() }
const agent: CurrentUser = { id: 'a1', role: 'agent' }

function service(customer: User | null) {
  return new SuggestionService(
    { getById: async () => ticket },
    { findById: async () => customer },
    async (input) => `sugestão para ${input.customerName}: ${input.title}`,
  )
}

describe('SuggestionService', () => {
  it('monta a sugestão com o nome do cliente', async () => {
    expect(await service(maria).suggest(agent, 't1')).toBe('sugestão para Maria: Erro no login')
  })

  it('usa "cliente" quando a conta do cliente não existe mais', async () => {
    expect(await service(null).suggest(agent, 't1')).toBe('sugestão para cliente: Erro no login')
  })

  it('não atende cliente', async () => {
    const err = await service(maria)
      .suggest({ id: 'c1', role: 'customer' }, 't1')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('forbidden')
  })
})
