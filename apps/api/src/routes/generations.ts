import { createId } from "@paralleldrive/cuid2"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { generationJobs, type GenerationJobStatus } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { creditCostFor, CreditError, captureHold, holdCredits, releaseHold } from "../lib/credit-ledger"
import { createDrizzleCreditStore } from "../lib/credit-store"
import { getCloudUser } from "../lib/cloud-user"
import { db } from "../lib/db"
import {
  getOpenRouteGeneration,
  OPENROUTE_MISSING_KEY,
  resolveOpenRouteConfig,
  submitOpenRouteGeneration,
  type OpenRouteGenerationResult,
} from "../lib/openroute-gateway"
import { ensureWelcomeCredits } from "../lib/welcome-credits"

const credits = createDrizzleCreditStore()

function requestOpenRouteKey(headers: Headers): string | undefined {
  const header = headers.get("x-openroute-api-key")?.trim()
  return header || undefined
}

const JobSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    provider: z.string(),
    kind: z.string(),
    prompt: z.string(),
    quality: z.string().optional(),
    creditCost: z.string().nullable().optional(),
    errorMessage: z.string().nullable(),
    result: z
      .object({
        text: z.string().optional(),
        outputUrl: z.string().optional(),
        mimeType: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .openapi("GenerationJob")

const CreateSchema = z
  .object({
    kind: z.enum(["text", "image", "video"]),
    prompt: z.string().min(1).max(8000),
    quality: z.enum(["fast", "standard"]).optional(),
    references: z.array(z.string().max(2_000_000)).max(8).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("CreateGenerationJob")

const ErrorSchema = z
  .object({
    message: z.string(),
  })
  .openapi("GenerationError")

const createJobRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Generations"],
  summary: "提交生成任务：须登录，预扣积分；经薄云调用 https://api.openroute.cn/v1",
  request: {
    body: {
      content: { "application/json": { schema: CreateSchema } },
      required: true,
    },
  },
  responses: {
    201: { content: { "application/json": { schema: JobSchema } }, description: "已受理的任务" },
    200: { content: { "application/json": { schema: JobSchema } }, description: "幂等请求返回的原任务" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "未登录" },
    402: { content: { "application/json": { schema: ErrorSchema } }, description: "积分不足" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "账户被封禁" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "请求无法处理" },
    503: { content: { "application/json": { schema: ErrorSchema } }, description: "未配置 OpenRoute 密钥" },
  },
})

const getJobRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Generations"],
  summary: "读取生成任务；结束后实扣或回退积分",
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: { content: { "application/json": { schema: JobSchema } }, description: "任务元数据" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "未登录" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "无权查看" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "任务不存在" },
  },
})

type ResultJson = {
  providerJobId?: string
  text?: string
  outputUrl?: string
  mimeType?: string
}

type JobRow = {
  id: string
  userId: string | null
  status: string
  provider: string
  kind: string
  prompt: string
  requestJson: unknown
  resultJson: unknown
  errorMessage: string | null
  creditCost: string | null
}

function asRecord(value: unknown): ResultJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as ResultJson
}

function qualityOf(row: JobRow): string {
  const request = asRecord(row.requestJson)
  const quality = (request as { quality?: unknown } | null)?.quality
  return quality === "fast" || quality === "standard" ? quality : "standard"
}

function toDto(row: JobRow) {
  const result = asRecord(row.resultJson)
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    kind: row.kind,
    prompt: row.prompt,
    quality: qualityOf(row),
    creditCost: row.creditCost,
    errorMessage: row.errorMessage,
    result: result
      ? { text: result.text, outputUrl: result.outputUrl, mimeType: result.mimeType }
      : null,
  }
}

async function loadJob(id: string): Promise<JobRow | null> {
  const rows = await db.select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1)
  return (rows[0] as JobRow | undefined) ?? null
}

async function findIdempotent(userId: string, key: string): Promise<JobRow | null> {
  const rows = await db
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, userId), eq(generationJobs.idempotencyKey, key)))
    .limit(1)
  return (rows[0] as JobRow | undefined) ?? null
}

async function applyProviderResult(row: JobRow, result: OpenRouteGenerationResult): Promise<JobRow> {
  const previous = asRecord(row.resultJson) ?? {}
  const resultJson: ResultJson = {
    ...previous,
    providerJobId: result.jobId,
    text: result.text,
    outputUrl: result.outputUrl,
    mimeType: result.mimeType,
  }
  const status = result.status as GenerationJobStatus
  const finished = status === "succeeded" || status === "failed" || status === "cancelled"
  if (finished && row.userId) {
    if (status === "succeeded") {
      await captureHold(credits, { userId: row.userId, generationJobId: row.id })
    } else {
      await releaseHold(credits, { userId: row.userId, generationJobId: row.id })
    }
  }
  const [updated] = await db
    .update(generationJobs)
    .set({
      status,
      resultJson,
      errorMessage: result.error ?? null,
      finishedAt: finished ? new Date() : null,
    })
    .where(eq(generationJobs.id, row.id))
    .returning()
  return (updated as JobRow | undefined) ?? { ...row, status, resultJson, errorMessage: result.error ?? null }
}

async function refreshJob(row: JobRow, headers: Headers): Promise<JobRow> {
  if (row.status !== "queued" && row.status !== "running") return row
  const stored = asRecord(row.resultJson)
  const providerJobId = stored?.providerJobId
  if (!providerJobId) return row
  const result = await getOpenRouteGeneration(providerJobId, {
    kind: row.kind === "video" || row.kind === "image" || row.kind === "text" ? row.kind : undefined,
    apiKey: requestOpenRouteKey(headers),
  })
  return applyProviderResult(row, result)
}

const app = new OpenAPIHono()

app.openapi(createJobRoute, async (c) => {
  const account = await getCloudUser(c.req.raw.headers)
  if (!account) return c.json({ message: "请先登录开镜账户，再使用平台网关生成。" }, 401)
  if (account.banned) return c.json({ message: "该账户已被限制使用生成服务。" }, 403)
  await ensureWelcomeCredits(account.id)

  const body = c.req.valid("json")
  const quality = body.quality ?? "standard"
  const userKey = requestOpenRouteKey(c.req.raw.headers)
  if (!resolveOpenRouteConfig({ apiKey: userKey }).apiKey) {
    return c.json({ message: OPENROUTE_MISSING_KEY }, 503)
  }
  if (body.idempotencyKey) {
    const existing = await findIdempotent(account.id, body.idempotencyKey)
    if (existing) return c.json(toDto(await refreshJob(existing, c.req.raw.headers)), 200)
  }

  const cost = creditCostFor(body.kind, quality)
  const id = createId()
  try {
    await db.insert(generationJobs).values({
      id,
      userId: account.id,
      provider: "openroute",
      kind: body.kind,
      status: "queued",
      prompt: body.prompt,
      creditCost: cost,
      idempotencyKey: body.idempotencyKey,
      requestJson: {
        kind: body.kind,
        prompt: body.prompt,
        quality,
        references: body.references ?? [],
        metadata: body.metadata ?? {},
      },
    })
  } catch (error) {
    if (body.idempotencyKey) {
      const existing = await findIdempotent(account.id, body.idempotencyKey)
      if (existing) return c.json(toDto(await refreshJob(existing, c.req.raw.headers)), 200)
    }
    const message = error instanceof Error ? error.message : "任务写入失败"
    return c.json({ message }, 400)
  }

  try {
    await holdCredits(credits, {
      userId: account.id,
      generationJobId: id,
      amount: cost,
      note: `${body.kind}:${quality}`,
    })
  } catch (error) {
    const message = error instanceof CreditError ? error.message : "积分预扣失败"
    const status = error instanceof CreditError ? error.status : 400
    await db
      .update(generationJobs)
      .set({ status: "failed", errorMessage: message, finishedAt: new Date() })
      .where(eq(generationJobs.id, id))
    if (status === 402) return c.json({ message }, 402)
    return c.json({ message }, 400)
  }

  const submitted = await submitOpenRouteGeneration({
    kind: body.kind,
    prompt: body.prompt,
    quality,
    references: body.references,
    metadata: body.metadata,
    apiKey: userKey,
  })
  const row = await loadJob(id)
  if (!row) return c.json({ message: "任务没有写入" }, 400)
  return c.json(toDto(await applyProviderResult(row, submitted)), 201)
})

app.openapi(getJobRoute, async (c) => {
  const account = await getCloudUser(c.req.raw.headers)
  if (!account) return c.json({ message: "请先登录开镜账户。" }, 401)
  const { id } = c.req.valid("param")
  const row = await loadJob(id)
  if (!row) return c.json({ message: "任务不存在" }, 404)
  if (row.userId !== account.id) return c.json({ message: "无权查看这个任务。" }, 403)
  return c.json(toDto(await refreshJob(row, c.req.raw.headers)), 200)
})

export default app
