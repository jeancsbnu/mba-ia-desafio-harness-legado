import { describe, expect, it } from 'vitest'
import { StatsService } from './stats-service'

describe('StatsService', () => {
  it('preenche zero nas chaves sem chamado e agrupa a falta de triagem em untriaged', async () => {
    const service = new StatsService({
      countGrouped: async () => ({
        byStatus: [{ status: 'open', count: 3 }],
        byCategory: [
          { category: 'billing', count: 2 },
          { category: null, count: 1 },
        ],
        byPriority: [{ priority: null, count: 3 }],
      }),
    })

    expect(await service.summary()).toEqual({
      byStatus: { open: 3, in_progress: 0, resolved: 0 },
      byCategory: { billing: 2, technical: 0, account: 0, other: 0, untriaged: 1 },
      byPriority: { low: 0, medium: 0, high: 0, urgent: 0, untriaged: 3 },
    })
  })
})
