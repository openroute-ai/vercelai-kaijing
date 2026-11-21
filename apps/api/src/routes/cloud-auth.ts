import { createId } from "@paralleldrive/cuid2"
import {
  CLOUD_SESSION_COOKIE,
  realmSignIn,
  realmSignUp,
  signSessionCookie,
  unsignCookieValue,
  validatePassword,
} from "@workspace/auth"
import { creditAccounts, session, user } from "@workspace/db"
import { and, eq, gt } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../lib/db"
import { env } from "../lib/env"

const SESSION_SECONDS = 60 * 60 * 24 * 30

type Credentials = {
  email?: unknown
  password?: unknown
  name?: unknown
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf("=")
    if (separator === -1) continue
    if (trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1)
  }
  return undefined
}

async function readSessionToken(cookieHeader: string | undefined): Promise<string | null> {
  const raw = readCookie(cookieHeader, CLOUD_SESSION_COOKIE)
  if (!raw) return null
  return unsignCookieValue(raw, env.BETTER_AUTH_SECRET)
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

async function loadSession(cookieHeader: string | undefined) {
  const token = await readSessionToken(cookieHeader)
  if (!token) return null
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      balance: creditAccounts.balance,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .leftJoin(creditAccounts, eq(creditAccounts.userId, user.id))
    .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    user: { id: row.id, email: row.email, name: row.name },
    balance: row.balance ?? "0",
  }
}

async function issueSession(userId: string): Promise<string> {
  const token = crypto.randomUUID()
  const now = new Date()
  await db.insert(session).values({
    id: createId(),
    token,
    userId,
    expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
    createdAt: now,
    updatedAt: now,
  })
  return signSessionCookie(CLOUD_SESSION_COOKIE, token, env.BETTER_AUTH_SECRET, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: SESSION_SECONDS,
  })
}

async function ensureCreditAccount(userId: string) {
  await db.insert(creditAccounts).values({ userId }).onConflictDoNothing()
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
  try {
    const created = await realmSignUp({
      db,
      realm: "cloud",
      email,
      password,
      name,
    })
    await ensureCreditAccount(created.userId)
    c.header("set-cookie", await issueSession(created.userId))
    return c.json({ session: await sessionForUser(created.userId) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "注册失败"
    return c.json({ message }, 400)
  }
})

cloudAuth.post("/login", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Credentials | null
  const email = asText(body?.email).toLowerCase()
  const password = asText(body?.password)
  try {
    const found = await realmSignIn({ db, realm: "cloud", email, password })
    await ensureCreditAccount(found.userId)
    c.header("set-cookie", await issueSession(found.userId))
    return c.json({ session: await sessionForUser(found.userId) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败"
    return c.json({ message }, 400)
  }
})

cloudAuth.get("/session", async (c) => {
  return c.json({ session: await loadSession(c.req.header("cookie")) })
})

cloudAuth.post("/logout", async (c) => {
  const token = await readSessionToken(c.req.header("cookie"))
  if (token) {
    await db.delete(session).where(eq(session.token, token))
  }
  c.header(
    "set-cookie",
    `${CLOUD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  )
  return c.json({ session: null })
})

export default cloudAuth
