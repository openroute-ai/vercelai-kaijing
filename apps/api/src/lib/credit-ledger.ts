import { CREDIT_COSTS, type CreditReason, type GenerationJobKind } from "@workspace/db"

export type LedgerEntry = {
  id: string
  accountId: string
  userId: string
  delta: string
  reason: CreditReason
  generationJobId?: string | null
  note?: string | null
}

export type CreditAccountState = {
  id: string
  userId: string
  balance: string
}

export type CreditTx = {
  account: CreditAccountState
  setBalance(balance: string): Promise<void>
  addLedger(entry: Omit<LedgerEntry, "id" | "accountId" | "userId"> & { id?: string }): Promise<LedgerEntry>
  listLedgerForJob(generationJobId: string): Promise<LedgerEntry[]>
}

export interface CreditStore {
  getAccount(userId: string): Promise<CreditAccountState | null>
  listLedgerForJob(generationJobId: string): Promise<LedgerEntry[]>
  runInAccountTx<T>(userId: string, fn: (tx: CreditTx) => Promise<T>): Promise<T>
}

export class CreditError extends Error {
  constructor(
    message: string,
    public status: 402 | 404 | 409,
  ) {
    super(message)
    this.name = "CreditError"
  }
}

export function addCredit(a: string, b: string): string {
  return (Number(a) + Number(b)).toFixed(4)
}

export function creditCostFor(kind: GenerationJobKind, quality: string = "standard"): string {
  const base = CREDIT_COSTS[kind]
  if (quality === "fast") {
    return (Number(base) * 0.8).toFixed(4)
  }
  return base
}

export async function holdCredits(
  store: CreditStore,
  input: { userId: string; generationJobId: string; amount: string; note?: string },
): Promise<{ account: CreditAccountState; hold: LedgerEntry }> {
  return store.runInAccountTx(input.userId, async (tx) => {
    const existing = await tx.listLedgerForJob(input.generationJobId)
    const held = existing.find((entry) => entry.reason === "hold")
    if (held) return { account: tx.account, hold: held }
    if (Number(tx.account.balance) < Number(input.amount)) {
      throw new CreditError(
        `积分不足，生成需要 ${input.amount} 分，当前余额 ${tx.account.balance}。请到云端账户查看礼包或套餐。`,
        402,
      )
    }
    const balance = addCredit(tx.account.balance, `-${input.amount}`)
    await tx.setBalance(balance)
    const hold = await tx.addLedger({
      delta: `-${input.amount}`,
      reason: "hold",
      generationJobId: input.generationJobId,
      note: input.note ?? "preauth",
    })
    return { account: { ...tx.account, balance }, hold }
  })
}

export async function captureHold(
  store: CreditStore,
  input: { userId: string; generationJobId: string },
): Promise<{ account: CreditAccountState; captured: boolean }> {
  return store.runInAccountTx(input.userId, async (tx) => {
    const entries = await tx.listLedgerForJob(input.generationJobId)
    if (entries.some((entry) => entry.reason === "capture")) {
      return { account: tx.account, captured: false }
    }
    if (entries.some((entry) => entry.reason === "release")) {
      throw new CreditError("这笔预扣已经回退，不能再实扣。", 409)
    }
    if (!entries.some((entry) => entry.reason === "hold")) {
      throw new CreditError("找不到对应的积分预扣。", 404)
    }
    await tx.addLedger({
      delta: "0.0000",
      reason: "capture",
      generationJobId: input.generationJobId,
      note: "capture",
    })
    return { account: tx.account, captured: true }
  })
}

export async function releaseHold(
  store: CreditStore,
  input: { userId: string; generationJobId: string },
): Promise<{ account: CreditAccountState; released: boolean }> {
  return store.runInAccountTx(input.userId, async (tx) => {
    const entries = await tx.listLedgerForJob(input.generationJobId)
    if (entries.some((entry) => entry.reason === "capture")) {
      throw new CreditError("这笔积分已经实扣，不能回退。", 409)
    }
    if (entries.some((entry) => entry.reason === "release")) {
      return { account: tx.account, released: false }
    }
    const hold = entries.find((entry) => entry.reason === "hold")
    if (!hold) throw new CreditError("找不到对应的积分预扣。", 404)
    const amount = hold.delta.startsWith("-") ? hold.delta.slice(1) : hold.delta
    const balance = addCredit(tx.account.balance, amount)
    await tx.setBalance(balance)
    await tx.addLedger({
      delta: amount,
      reason: "release",
      generationJobId: input.generationJobId,
      note: "release",
    })
    return { account: { ...tx.account, balance }, released: true }
  })
}

export function createMemoryCreditStore(seed?: CreditAccountState[]): CreditStore {
  const accounts = new Map<string, CreditAccountState>()
  const ledger: LedgerEntry[] = []
  for (const account of seed ?? []) accounts.set(account.userId, { ...account })
  let seq = 0
  return {
    async getAccount(userId) {
      return accounts.get(userId) ?? null
    },
    async listLedgerForJob(generationJobId) {
      return ledger.filter((entry) => entry.generationJobId === generationJobId)
    },
    async runInAccountTx(userId, fn) {
      const account = accounts.get(userId)
      if (!account) throw new CreditError("找不到积分账户。", 404)
      return fn({
        account,
        async setBalance(balance) {
          accounts.set(userId, { ...account, balance })
        },
        async addLedger(entry) {
          const row: LedgerEntry = {
            ...entry,
            id: entry.id ?? `led_${++seq}`,
            accountId: account.id,
            userId,
          }
          ledger.push(row)
          return row
        },
        async listLedgerForJob(generationJobId) {
          return ledger.filter((entry) => entry.generationJobId === generationJobId)
        },
      })
    },
  }
}
