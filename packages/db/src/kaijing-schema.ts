/**
 * 开镜薄云元数据：账户积分与生成任务。
 * 项目、剧本、分镜与成片默认留在桌面端本机，不在这里建完整短剧模型。
 */
import { createId } from "@paralleldrive/cuid2"
import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { user } from "./auth-schema"

export const generationJobKinds = ["text", "image", "video"] as const
export type GenerationJobKind = (typeof generationJobKinds)[number]

export const generationJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const
export type GenerationJobStatus = (typeof generationJobStatuses)[number]

export const creditReasons = ["grant", "hold", "capture", "release", "adjust"] as const
export type CreditReason = (typeof creditReasons)[number]

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

/** 每个登录用户一条积分账户。余额用 numeric，避免浮点误差。 */
export const creditAccounts = pgTable(
  "credit_accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    balance: numeric("balance", { precision: 15, scale: 4 }).notNull().default("0"),
    ...timestamps,
  },
  (table) => [uniqueIndex("credit_accounts_user_id_unique").on(table.userId)],
)

/** 积分流水。generation_job_id 只记关联，不强制外键，便于任务先失败再回退。 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    accountId: text("account_id")
      .notNull()
      .references(() => creditAccounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    delta: numeric("delta", { precision: 15, scale: 4 }).notNull(),
    reason: varchar("reason", { length: 32 }).notNull(),
    generationJobId: text("generation_job_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("credit_ledger_user_id_idx").on(table.userId),
    index("credit_ledger_account_id_idx").on(table.accountId),
  ],
)

/**
 * 生成网关任务元数据。M0 只落库状态，不调用供应商。
 * user_id 可空：桌面端在接入登录前，网关仍可记录匿名占位任务。
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 64 }).notNull().default("stub"),
    kind: varchar("kind", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    prompt: text("prompt").notNull(),
    requestJson: jsonb("request_json").notNull().default({}),
    resultJson: jsonb("result_json"),
    errorMessage: text("error_message"),
    creditCost: numeric("credit_cost", { precision: 15, scale: 4 }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("generation_jobs_user_id_idx").on(table.userId),
    index("generation_jobs_status_idx").on(table.status),
  ],
)

export type CreditAccount = typeof creditAccounts.$inferSelect
export type CreditLedgerEntry = typeof creditLedger.$inferSelect
export type GenerationJob = typeof generationJobs.$inferSelect
export type NewGenerationJob = typeof generationJobs.$inferInsert
