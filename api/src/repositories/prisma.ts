import { PrismaClient } from '@prisma/client'
import { env } from '../config/env'

// Único Prisma Client da API e do worker (regra G12: Prisma só em repositories/).
export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}
