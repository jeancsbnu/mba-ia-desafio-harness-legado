import os from 'os'
import { describe, expect, it } from 'vitest'
import { DomainError } from '../domain/errors'
import { Attachment, CurrentUser, Ticket } from '../domain/ticket'
import { AttachmentService } from './attachment-service'

const ticket: Ticket = {
  id: 't1',
  title: 'Chamado',
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

const fakeTickets = {
  getById: async (user: CurrentUser, id: string) => {
    if (id !== ticket.id || (user.role === 'customer' && user.id !== ticket.customerId)) {
      throw new DomainError('not_found', 'Chamado não encontrado')
    }
    return ticket
  },
}

const fakeAttachments = {
  create: async (data: Omit<Attachment, 'id' | 'createdAt'>) => ({ id: 'att1', createdAt: new Date(), ...data }),
  findById: async (): Promise<Attachment | null> => null,
}

const customer: CurrentUser = { id: 'c1', role: 'customer' }

function file(size: number, mimetype: string, originalname: string) {
  return { size, mimetype, originalname, buffer: Buffer.from('') }
}

describe('AttachmentService', () => {
  const service = new AttachmentService(fakeAttachments, fakeTickets, os.tmpdir())

  it('exige arquivo', async () => {
    await expect(service.upload(customer, 't1', undefined)).rejects.toMatchObject({ code: 'validation_error' })
  })

  it('recusa arquivo maior que 5 MB', async () => {
    await expect(service.upload(customer, 't1', file(5 * 1024 * 1024 + 1, 'text/plain', 'a.txt'))).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })

  it('recusa tipo não suportado', async () => {
    await expect(service.upload(customer, 't1', file(10, 'image/gif', 'a.gif'))).rejects.toMatchObject({
      code: 'unsupported_type',
    })
  })

  it('não deixa outro cliente enviar', async () => {
    const other: CurrentUser = { id: 'c2', role: 'customer' }
    await expect(service.upload(other, 't1', undefined)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('anexo inexistente responde não encontrado', async () => {
    await expect(service.getForDownload(customer, 'nao-existe')).rejects.toBeInstanceOf(DomainError)
  })
})
