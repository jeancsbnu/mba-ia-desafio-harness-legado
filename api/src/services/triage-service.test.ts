import { describe, expect, it } from 'vitest'
import { Ticket } from '../domain/ticket'
import { TicketUpdate } from '../repositories/ticket-repository'
import { TriageService } from './triage-service'

function pendente(id: string, title: string): Ticket {
  return {
    id,
    title,
    description: 'Descrição do chamado',
    status: 'open',
    category: null,
    priority: null,
    triageStatus: 'pending',
    customerId: 'c1',
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('TriageService', () => {
  it('classifica os pendentes e marca failed só o que falhou', async () => {
    const updates: { id: string; data: TicketUpdate }[] = []
    const fila = [pendente('t1', 'Fatura em dobro'), pendente('t2', 'Teste [falha-ia]')]
    const logs: string[] = []
    const service = new TriageService(
      {
        findPendingTriage: async () => fila,
        update: async (id, data) => {
          updates.push({ id, data })
          return { ...fila.find((t) => t.id === id)!, ...data }
        },
      },
      async (t) => {
        if (t.title.includes('[falha-ia]')) throw new Error('classificacao falhou')
        return { category: 'billing', priority: 'urgent' }
      },
      (msg) => logs.push(msg),
    )

    await service.runOnce()

    expect(updates).toEqual([
      { id: 't1', data: { category: 'billing', priority: 'urgent', triageStatus: 'done' } },
      { id: 't2', data: { triageStatus: 'failed' } },
    ])
    expect(logs).toEqual(['chamado t1 triado: billing/urgent', 'falha na triagem do chamado t2: classificacao falhou'])
  })
})
