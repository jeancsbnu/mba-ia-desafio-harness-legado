import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// A seed é idempotente: `npm run up` roda ela a cada subida. As contas são
// garantidas por e-mail (e voltam para a senha da seed) e os chamados de
// exemplo só são criados quando ainda não existem.

const prisma = new PrismaClient()

type SeedUser = { name: string; email: string; password: string; role: 'admin' | 'agent' | 'customer' }

async function ensureUser(user: SeedUser) {
  const data = { name: user.name, passwordHash: await bcrypt.hash(user.password, 10), role: user.role }
  return prisma.user.upsert({
    where: { email: user.email },
    update: data,
    create: { ...data, email: user.email },
  })
}

async function main() {
  const admin = await ensureUser({ name: 'Admin', email: 'admin@balcao.dev', password: 'Admin@123', role: 'admin' })
  const agent = await ensureUser({ name: 'Ana Atendente', email: 'agente@balcao.dev', password: 'Agente@123', role: 'agent' })
  const customer = await ensureUser({
    name: 'Carlos Cliente',
    email: 'cliente@balcao.dev',
    password: 'Cliente@123',
    role: 'customer',
  })

  const alreadySeeded = await prisma.ticket.count({
    where: {
      customerId: customer.id,
      title: { in: ['Não consigo emitir a segunda via do boleto', 'Erro ao salvar o perfil', 'Dúvida sobre troca de senha'] },
    },
  })

  if (alreadySeeded === 0) {
    await prisma.ticket.create({
      data: {
        title: 'Não consigo emitir a segunda via do boleto',
        description: 'Quando clico em segunda via aparece uma tela em branco. Preciso pagar até sexta.',
        customerId: customer.id,
      },
    })

    await prisma.ticket.create({
      data: {
        title: 'Erro ao salvar o perfil',
        description: 'Ao alterar o telefone no perfil aparece a mensagem "erro inesperado".',
        status: 'in_progress',
        category: 'technical',
        priority: 'medium',
        triageStatus: 'done',
        customerId: customer.id,
        assigneeId: agent.id,
        replies: {
          create: [{ authorId: agent.id, body: 'Oi, Carlos! Já estamos olhando o problema.' }],
        },
      },
    })

    await prisma.ticket.create({
      data: {
        title: 'Dúvida sobre troca de senha',
        description: 'Qual o tamanho mínimo de senha que o sistema aceita?',
        status: 'resolved',
        category: 'account',
        priority: 'low',
        triageStatus: 'done',
        customerId: customer.id,
        assigneeId: agent.id,
        replies: {
          create: [
            { authorId: agent.id, body: 'A senha precisa ter pelo menos 8 caracteres.' },
            { authorId: customer.id, body: 'Obrigado!' },
          ],
        },
      },
    })
  }

  console.log(`seed ok: ${admin.email}, ${agent.email}, ${customer.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
