import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'
import { creditsRouter } from './credits'
import { generationJobsRouter } from './generationJobs'
import { platformInvitationsRouter } from './platformInvitations'
import { platformUsersRouter } from './platformUsers'
import { siteMessagesRouter } from './site-messages'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
  credits: creditsRouter,
  generationJobs: generationJobsRouter,
  platformUsers: platformUsersRouter,
  platformInvitations: platformInvitationsRouter,
  siteMessages: siteMessagesRouter,
})

export type AppRouter = typeof appRouter
