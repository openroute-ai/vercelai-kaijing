import { createAuth } from "@workspace/auth"
import { db } from "./db"
import { env } from "./env"

/**
 * Desktop and workspace users. This is the cloud better-auth instance on the
 * public schema. Cookie prefix `cloud` issues `cloud.session_token`.
 * apps/web keeps a separate better-auth instance on `web_auth`.
 * @see docs/design/cloud.md
 */
export const auth = createAuth(db, {
  baseURL: env.CLOUD_AUTH_URL ?? `http://127.0.0.1:${env.PORT}`,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
  cookiePrefix: "cloud",
})
