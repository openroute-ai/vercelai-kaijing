import { creditAccounts, creditLedger } from "@workspace/db"
import { eq, sql } from "drizzle-orm"

import { CreditError, type CreditStore, type LedgerEntry } from "./credit-ledger"
import { db } from "./db"

export function createDrizzleCreditStore(): CreditStore {
  return {
    async getAccount(userId) {
      const rows = await db
        .select({
          id: creditAccounts.id,
          userId: creditAccounts.userId,
          balance: creditAccounts.balance,
        })
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, userId))
        .limit(1)
      return rows[0] ?? null
    },
    async listLedgerForJob(generationJobId) {
      const rows = await db
        .select()
        .from(creditLedger)
        .where(eq(creditLedger.generationJobId, generationJobId))
      return rows as LedgerEntry[]
    },
    async runInAccountTx(userId, fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select id from credit_accounts where user_id = ${userId} for update`)
        const rows = await tx
          .select({
            id: creditAccounts.id,
            userId: creditAccounts.userId,
            balance: creditAccounts.balance,
          })
          .from(creditAccounts)
          .where(eq(creditAccounts.userId, userId))
          .limit(1)
        const account = rows[0]
        if (!account) throw new CreditError("找不到积分账户。", 404)
        return fn({
          account,
          async setBalance(balance) {
            await tx.update(creditAccounts).set({ balance }).where(eq(creditAccounts.id, account.id))
          },
          async addLedger(entry) {
            const [row] = await tx
              .insert(creditLedger)
              .values({
                accountId: account.id,
                userId,
                delta: entry.delta,
                reason: entry.reason,
                generationJobId: entry.generationJobId,
                note: entry.note,
              })
              .returning()
            return row as LedgerEntry
          },
          async listLedgerForJob(generationJobId) {
            const items = await tx
              .select()
              .from(creditLedger)
              .where(eq(creditLedger.generationJobId, generationJobId))
            return items as LedgerEntry[]
          },
        })
      })
    },
  }
}
