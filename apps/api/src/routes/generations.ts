import { createId } from "@paralleldrive/cuid2"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { generationJobs } from "@workspace/db"
import { createStubProvider } from "@workspace/providers"
import { eq } from "drizzle-orm"
import { db } from "../lib/db"

const provider = createStubProvider()

const JobSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    provider: z.string(),
    kind: z.string(),
    prompt: z.string(),
    errorMessage: z.string().nullable(),
  })
  .openapi("GenerationJob")

const CreateSchema = z
  .object({
    kind: z.enum(["text", "image", "video"]),
    prompt: z.string().min(1).max(8000),
    userId: z.string().min(1).optional(),
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
  summary: "记录一条生成任务（M0 不调用供应商）",
  request: {
    body: {
      content: { "application/json": { schema: CreateSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: JobSchema } },
      description: "已写入的占位任务",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "用户不存在或请求无法落库",
    },
  },
})

const getJobRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Generations"],
  summary: "读取生成任务元数据",
  request: {
    params: z.object({ id: z.string().min(1) }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: JobSchema } },
      description: "任务元数据",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "任务不存在",
    },
  },
})

function toDto(row: {
  id: string
  status: string
  provider: string
  kind: string
  prompt: string
  errorMessage: string | null
}) {
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    kind: row.kind,
    prompt: row.prompt,
    errorMessage: row.errorMessage,
  }
}

const app = new OpenAPIHono()

app.openapi(createJobRoute, async (c) => {
  const body = c.req.valid("json")
  const id = createId()
  // 占位供应商只确认接口形状，返回的 jobId 不落库。
  await provider.submit({ kind: body.kind, prompt: body.prompt })

  try {
    const [row] = await db
      .insert(generationJobs)
      .values({
        id,
        userId: body.userId,
        provider: provider.id,
        kind: body.kind,
        status: "queued",
        prompt: body.prompt,
        requestJson: { kind: body.kind, prompt: body.prompt },
      })
      .returning({
        id: generationJobs.id,
        status: generationJobs.status,
        provider: generationJobs.provider,
        kind: generationJobs.kind,
        prompt: generationJobs.prompt,
        errorMessage: generationJobs.errorMessage,
      })
    if (!row) {
      return c.json({ message: "任务没有写入" }, 400)
    }
    return c.json(toDto(row), 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : "任务写入失败"
    return c.json({ message }, 400)
  }
})

app.openapi(getJobRoute, async (c) => {
  const { id } = c.req.valid("param")
  const [row] = await db
    .select({
      id: generationJobs.id,
      status: generationJobs.status,
      provider: generationJobs.provider,
      kind: generationJobs.kind,
      prompt: generationJobs.prompt,
      errorMessage: generationJobs.errorMessage,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, id))
    .limit(1)
  if (!row) return c.json({ message: "任务不存在" }, 404)
  return c.json(toDto(row), 200)
})

export default app
