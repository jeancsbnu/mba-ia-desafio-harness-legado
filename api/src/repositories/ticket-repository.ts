import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { Ticket, TicketCategory, TicketDetails, TicketPriority, TicketStatus } from '../domain/ticket'

export type TicketFilter = {
  customerId?: string
  status?: TicketStatus
}

export type TicketUpdate = Partial<Pick<Ticket, 'status' | 'assigneeId' | 'category' | 'priority' | 'triageStatus'>>

export interface TicketRepository {
  create(data: { title: string; description: string; customerId: string }): Promise<Ticket>
  findById(id: string): Promise<Ticket | null>
  findByIdWithDetails(id: string): Promise<TicketDetails | null>
  list(filter: TicketFilter, page: number, pageSize: number): Promise<{ items: Ticket[]; total: number }>
  update(id: string, data: TicketUpdate): Promise<Ticket>
}

// O que o worker de triagem precisa: chamados pendentes e a atualização.
export interface TriageQueue {
  findPendingTriage(limit: number): Promise<Ticket[]>
  update(id: string, data: TicketUpdate): Promise<Ticket>
}

type TicketCounts = {
  byStatus: { status: TicketStatus; count: number }[]
  byCategory: { category: TicketCategory | null; count: number }[]
  byPriority: { priority: TicketPriority | null; count: number }[]
}

// O que as estatísticas precisam: contagens agrupadas.
export interface TicketStatsSource {
  countGrouped(): Promise<TicketCounts>
}

class PrismaTicketRepository implements TicketRepository, TriageQueue, TicketStatsSource {
  create(data: { title: string; description: string; customerId: string }) {
    return prisma.ticket.create({ data })
  }

  findById(id: string) {
    return prisma.ticket.findUnique({ where: { id } })
  }

  findByIdWithDetails(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  async list(filter: TicketFilter, page: number, pageSize: number) {
    const where: Prisma.TicketWhereInput = {}
    if (filter.customerId) where.customerId = filter.customerId
    if (filter.status) where.status = filter.status
    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ])
    return { items, total }
  }

  update(id: string, data: TicketUpdate) {
    return prisma.ticket.update({ where: { id }, data })
  }

  findPendingTriage(limit: number) {
    return prisma.ticket.findMany({
      where: { triageStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async countGrouped() {
    const [statusRows, categoryRows, priorityRows] = await Promise.all([
      prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['priority'], _count: { _all: true } }),
    ])
    return {
      byStatus: statusRows.map((row) => ({ status: row.status, count: row._count._all })),
      byCategory: categoryRows.map((row) => ({ category: row.category, count: row._count._all })),
      byPriority: priorityRows.map((row) => ({ priority: row.priority, count: row._count._all })),
    }
  }
}

export const ticketRepository = new PrismaTicketRepository()
