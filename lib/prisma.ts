import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildPrismaUrl(): string {
  const base = process.env.DATABASE_URL || ''
  if (!base) return base
  // Supabase pooler (porta 6543) é PgBouncer em modo transação.
  // O parâmetro pgbouncer=true告诉 Prisma para NÃO usar prepared statements,
  // evitando "prepared statement already exists" (42P05) entre cold starts.
  let url = base
  if (!url.includes('pgbouncer=')) {
    url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true'
  }
  return url
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: { db: { url: buildPrismaUrl() } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
