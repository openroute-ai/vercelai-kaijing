import { user } from "@workspace/db"
import { eq } from "drizzle-orm"

import { auth } from "./auth"
import { callBetterAuth } from "./cloud-auth-proxy"
import { db } from "./db"

export type CloudUser = {
  id: string
  email: string
  name: string
  banned: boolean
}

export async function getCloudUser(headers: Headers): Promise<CloudUser | null> {
  const response = await callBetterAuth((request) => auth.handler(request), "session", { headers })
  if (!response.ok) return null
  const payload = (await response.json().catch(() => null)) as
    | { user?: { id?: unknown } }
    | null
  const id = payload?.user && typeof payload.user === "object" ? payload.user.id : null
  if (typeof id !== "string" || !id) return null
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      banned: user.banned,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    banned: Boolean(row.banned),
  }
}
