import { count, desc, eq } from 'drizzle-orm'
import { creditAccounts, creditLedger } from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export async function listCreditAccounts(input: { page?: number; pageSize?: number }) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const totalRows = await db.select({ total: count() }).from(creditAccounts)
  const total = Number(totalRows[0]?.total ?? 0)
  const items = await db
    .select({
      id: creditAccounts.id,
      userId: creditAccounts.userId,
      balance: creditAccounts.balance,
      updatedAt: creditAccounts.updatedAt,
    })
    .from(creditAccounts)
    .orderBy(desc(creditAccounts.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items, total, page, pageSize }
}

export async function listCreditLedger(input: {
  page?: number
  pageSize?: number
  userId?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = input.userId ? eq(creditLedger.userId, input.userId) : undefined
  const totalRows = await db.select({ total: count() }).from(creditLedger).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const items = await db
    .select({
      id: creditLedger.id,
      userId: creditLedger.userId,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      generationJobId: creditLedger.generationJobId,
      note: creditLedger.note,
      createdAt: creditLedger.createdAt,
    })
    .from(creditLedger)
    .where(where)
    .orderBy(desc(creditLedger.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items, total, page, pageSize }
}
