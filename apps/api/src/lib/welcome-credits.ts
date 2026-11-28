import {
  WELCOME_CREDIT_AMOUNT,
  WELCOME_CREDIT_NOTE,
  WELCOME_GRANT_MARKER,
  checkoutIntents,
  creditAccounts,
  creditLedger,
} from "@workspace/db"
import { and, eq, sql } from "drizzle-orm"

import { db } from "./db"

async function ensureCheckoutTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS checkout_intents (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE cascade,
      plan_id varchar(64) NOT NULL,
      credits numeric(15, 4) NOT NULL,
      price_label text NOT NULL,
      status varchar(32) DEFAULT 'placeholder' NOT NULL,
      note text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS checkout_intents_user_id_idx ON checkout_intents (user_id)
  `)
}

export async function ensureWelcomeCredits(userId: string) {
  await db
    .insert(creditAccounts)
    .values({ userId, balance: "0" })
    .onConflictDoNothing()

  const granted = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, userId), eq(creditLedger.note, WELCOME_GRANT_MARKER)))
    .limit(1)
  if (granted[0]) return { granted: false, already: true }

  await db.transaction(async (tx) => {
    const again = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.note, WELCOME_GRANT_MARKER)))
      .limit(1)
    if (again[0]) return

    const accounts = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
      .limit(1)
    const account = accounts[0]
    if (!account) return

    await tx.insert(creditLedger).values({
      accountId: account.id,
      userId,
      delta: WELCOME_CREDIT_AMOUNT,
      reason: "grant",
      note: WELCOME_GRANT_MARKER,
    })
    await tx
      .update(creditAccounts)
      .set({
        balance: sql`${creditAccounts.balance} + ${WELCOME_CREDIT_AMOUNT}`,
      })
      .where(eq(creditAccounts.id, account.id))
  })

  return { granted: true, already: false }
}

export async function createCheckoutPlaceholder(input: {
  userId: string
  planId: string
  credits: string
  priceLabel: string
}) {
  await ensureCheckoutTable()
  const [row] = await db
    .insert(checkoutIntents)
    .values({
      userId: input.userId,
      planId: input.planId,
      credits: input.credits,
      priceLabel: input.priceLabel,
      status: "placeholder",
      note: "支付通道尚未开通，这是一条待支付占位记录，没有实际扣款，也没有增加积分。",
    })
    .returning()
  return row
}

export { WELCOME_CREDIT_AMOUNT, WELCOME_CREDIT_NOTE, WELCOME_GRANT_MARKER }
