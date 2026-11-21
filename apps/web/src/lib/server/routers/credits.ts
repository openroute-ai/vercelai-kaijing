import { z } from 'zod'
import { listCreditAccounts, listCreditLedger } from '@/lib/server/dataaccess/credits'
import { createTRPCRouter, protectedProcedure } from './trpc'

export const creditsRouter = createTRPCRouter({
  listAccounts: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(({ input }) => listCreditAccounts(input ?? {})),
  listLedger: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
          userId: z.string().min(1).optional(),
        })
        .optional(),
    )
    .query(({ input }) => listCreditLedger(input ?? {})),
})
