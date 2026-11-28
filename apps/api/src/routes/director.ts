import { createId } from "@paralleldrive/cuid2"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { creditCostFor, CreditError, captureHold, holdCredits, releaseHold } from "../lib/credit-ledger"
import { createDrizzleCreditStore } from "../lib/credit-store"
import { getCloudUser } from "../lib/cloud-user"
import { db } from "../lib/db"
import { DIRECTOR_TASKS, runDirectorText, type DirectorTask } from "../lib/director-text"
import { resolveOpenRouteConfig, submitOpenRouteGeneration } from "../lib/openroute-gateway"
import { ensureWelcomeCredits } from "../lib/welcome-credits"
import { generationJobs } from "@workspace/db"
import { eq } from "drizzle-orm"

const credits = createDrizzleCreditStore()

function requestOpenRouteKey(headers: Headers): string | undefined {
  const header = headers.get("x-openroute-api-key")?.trim()
  return header || undefined
}

const ResultSchema = z
  .object({
    source: z.enum(["openroute", "builtin"]),
    text: z.string(),
    error: z.string().optional(),
    jobId: z.string().optional(),
  })
  .openapi("DirectorTextResult")

const ErrorSchema = z.object({ message: z.string() }).openapi("DirectorError")

const createTaskRoute = createRoute({
  method: "post",
  path: "/tasks",
  tags: ["Director"],
  summary: "导演文本任务：改写/抽取/拆镜/提示词经薄云调用 OpenRoute，无密钥时返回内置编排",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            task: z.enum(DIRECTOR_TASKS),
            payload: z.record(z.string(), z.unknown()),
            quality: z.enum(["fast", "standard"]).optional(),
            aspectRatio: z.enum(["9:16", "16:9"]).optional(),
            idempotencyKey: z.string().min(1).max(128).optional(),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: { content: { "application/json": { schema: ResultSchema } }, description: "文本结果" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "请求无法处理" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "未登录且需要走 OpenRoute" },
    402: { content: { "application/json": { schema: ErrorSchema } }, description: "积分不足" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "账户被封禁" },
  },
})

const app = new OpenAPIHono()

app.openapi(createTaskRoute, async (c) => {
  const body = c.req.valid("json")
  const task = body.task as DirectorTask
  const quality = body.quality ?? "standard"
  const userKey = requestOpenRouteKey(c.req.raw.headers)
  const hasKey = Boolean(resolveOpenRouteConfig({ apiKey: userKey }).apiKey)
  const account = await getCloudUser(c.req.raw.headers)

  if (!hasKey || !account) {
    const result = await runDirectorText({
      task,
      payload: body.payload,
      quality,
      aspectRatio: body.aspectRatio,
    })
    return c.json(result, 200)
  }
  if (account.banned) return c.json({ message: "该账户已被限制使用生成服务。" }, 403)
  await ensureWelcomeCredits(account.id)

  const cost = creditCostFor("text", quality)
  const id = createId()
  try {
    await db.insert(generationJobs).values({
      id,
      userId: account.id,
      provider: "openroute",
      kind: "text",
      status: "queued",
      prompt: task,
      creditCost: cost,
      idempotencyKey: body.idempotencyKey,
      requestJson: { task, payload: body.payload, quality, aspectRatio: body.aspectRatio },
    })
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : "无法创建导演任务" }, 400)
  }

  try {
    await holdCredits(credits, {
      userId: account.id,
      generationJobId: id,
      amount: cost,
    })
  } catch (error) {
    if (error instanceof CreditError && error.status === 402) {
      return c.json({ message: error.message }, 402)
    }
    throw error
  }

  const result = await runDirectorText({
    task,
    payload: body.payload,
    quality,
    aspectRatio: body.aspectRatio,
    generateText: async (prompt) => {
      const generated = await submitOpenRouteGeneration({
        kind: "text",
        prompt,
        quality,
        apiKey: userKey,
        metadata: { task, aspectRatio: body.aspectRatio },
      })
      return {
        ok: generated.status === "succeeded" && Boolean(generated.text),
        text: generated.text,
        error: generated.error,
      }
    },
  })

  if (result.source === "openroute") {
    await captureHold(credits, { userId: account.id, generationJobId: id })
    await db
      .update(generationJobs)
      .set({ status: "succeeded", resultJson: { text: result.text }, finishedAt: new Date() })
      .where(eq(generationJobs.id, id))
  } else {
    await releaseHold(credits, { userId: account.id, generationJobId: id })
    await db
      .update(generationJobs)
      .set({
        status: "failed",
        errorMessage: result.error ?? null,
        resultJson: { text: result.text, source: "builtin" },
        finishedAt: new Date(),
      })
      .where(eq(generationJobs.id, id))
  }
  return c.json({ ...result, jobId: id }, 200)
})

export default app
