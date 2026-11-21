import { count, desc, eq } from 'drizzle-orm'
import { generationJobs } from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export async function listGenerationJobs(input: {
  page?: number
  pageSize?: number
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = input.status ? eq(generationJobs.status, input.status) : undefined
  const totalRows = await db.select({ total: count() }).from(generationJobs).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const items = await db
    .select({
      id: generationJobs.id,
      userId: generationJobs.userId,
      provider: generationJobs.provider,
      kind: generationJobs.kind,
      status: generationJobs.status,
      prompt: generationJobs.prompt,
      errorMessage: generationJobs.errorMessage,
      createdAt: generationJobs.createdAt,
      finishedAt: generationJobs.finishedAt,
    })
    .from(generationJobs)
    .where(where)
    .orderBy(desc(generationJobs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items, total, page, pageSize }
}
