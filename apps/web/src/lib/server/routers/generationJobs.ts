import { z } from 'zod'
import { listGenerationJobs } from '@/lib/server/dataaccess/generation-jobs'
import { createTRPCRouter, protectedProcedure } from './trpc'

export const generationJobsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
          status: z.string().max(32).optional(),
        })
        .optional(),
    )
    .query(({ input }) => listGenerationJobs(input ?? {})),
})
