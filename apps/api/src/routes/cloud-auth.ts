import { validatePassword } from "@workspace/auth"
import { creditAccounts, user } from "@workspace/db"
import { eq } from "drizzle-orm"
import { Hono, type Context } from "hono"
import { auth } from "../lib/auth"
import { callBetterAuth, type CloudAuthAction } from "../lib/cloud-auth-proxy"
import { db } from "../lib/db"

type Credentials = {
  email?: unknown
  password?: unknown
  name?: unknown
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function ensureCreditAccount(userId: string) {
  await db.insert(creditAccounts).values({ userId }).onConflictDoNothing()
}

async function sessionForUser(userId: string) {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      balance: creditAccounts.balance,
    })
    .from(user)
    .leftJoin(creditAccounts, eq(creditAccounts.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    user: { id: row.id, email: row.email, name: row.name },
    balance: row.balance ?? "0",
  }
}

function userIdFromPayload(payload: Record<string, unknown> | null): string | null {
  const accountUser = payload?.user
  if (!accountUser || typeof accountUser !== "object") return null
  const id = (accountUser as { id?: unknown }).id
  return typeof id === "string" && id.length > 0 ? id : null
}

async function readPayload(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function messageFromPayload(payload: Record<string, unknown> | null, fallback: string): string {
  const message = payload?.message
  return typeof message === "string" && message.trim() ? message : fallback
}

async function proxy(c: Context, action: CloudAuthAction, body?: Record<string, unknown>) {
  const response = await callBetterAuth((request) => auth.handler(request), action, {
    headers: c.req.raw.headers,
    body,
  })
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []
  for (const cookie of cookies) c.header("set-cookie", cookie, { append: true })
  const payload = await readPayload(response)
  return { response, payload }
}

const cloudAuth = new Hono()

cloudAuth.post("/register", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Credentials | null
  const email = asText(body?.email).toLowerCase()
  const password = asText(body?.password)
  const name = asText(body?.name) || email
  if (!email || !email.includes("@")) {
    return c.json({ message: "请填写邮箱" }, 400)
  }
  const issues = validatePassword(password, { email, name })
  if (issues.length > 0) {
    return c.json({ message: "密码至少 8 位，并包含大小写字母、数字和符号" }, 400)
  }
  const proxied = await proxy(c, "register", { email, password, name })
  if (!proxied.response.ok) {
    return c.json(
      { message: messageFromPayload(proxied.payload, "注册失败") },
      proxied.response.status as 400,
    )
  }
  const userId = userIdFromPayload(proxied.payload)
  if (!userId) return c.json({ message: "注册失败" }, 502)
  await ensureCreditAccount(userId)
  return c.json({ session: await sessionForUser(userId) })
})

cloudAuth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Credentials | null
  const email = asText(body?.email).toLowerCase()
  const password = asText(body?.password)
  if (!email || !password) return c.json({ message: "请填写邮箱和密码" }, 400)
  const proxied = await proxy(c, "login", { email, password })
  if (!proxied.response.ok) {
    return c.json({ message: "账号或密码错误" }, 401)
  }
  const userId = userIdFromPayload(proxied.payload)
  if (!userId) return c.json({ message: "账号或密码错误" }, 401)
  await ensureCreditAccount(userId)
  return c.json({ session: await sessionForUser(userId) })
})

cloudAuth.get("/session", async (c) => {
  const proxied = await proxy(c, "session")
  const userId = userIdFromPayload(proxied.payload)
  if (!proxied.response.ok || !userId) return c.json({ session: null })
  return c.json({ session: await sessionForUser(userId) })
})

cloudAuth.post("/logout", async (c) => {
  await proxy(c, "logout", {})
  return c.json({ session: null })
})

export default cloudAuth
