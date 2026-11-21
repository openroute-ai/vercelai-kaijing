import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { account, user, verification } from '@workspace/db/schema'
import { REALM_PROVIDERS, type Realm } from './realm-auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
const RESET_IDENTIFIER_PREFIX = 'password-reset:'

function newId(): string {
  return crypto.randomUUID()
}

/**
 * 该 realm 下所有可持有密码的凭证 providerId。
 * 找回密码只能改动本 realm 的凭证，避免 cloud/merchant/supplier/web 互相覆盖密码。
 */
export function getRealmPasswordProviderIds(realm: Realm): string[] {
  const { email, phone } = REALM_PROVIDERS[realm]
  return [email, phone]
}

/** 找回密码令牌标识：`password-reset:<realm>:<userId>`，把令牌绑定到签发它的应用。 */
export function buildPasswordResetIdentifier(realm: Realm, userId: string): string {
  return `${RESET_IDENTIFIER_PREFIX}${realm}:${userId}`
}

/** 解析令牌标识；格式非法或 realm 未知返回 null。 */
export function parsePasswordResetIdentifier(
  identifier: string
): { realm: Realm; userId: string } | null {
  if (!identifier.startsWith(RESET_IDENTIFIER_PREFIX)) return null

  const payload = identifier.slice(RESET_IDENTIFIER_PREFIX.length)
  const separatorIndex = payload.indexOf(':')
  if (separatorIndex <= 0) return null

  const realm = payload.slice(0, separatorIndex)
  const userId = payload.slice(separatorIndex + 1)
  if (!userId || !(realm in REALM_PROVIDERS)) return null

  return { realm: realm as Realm, userId }
}

export function buildPasswordResetUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}/auth/reset-password?token=${encodeURIComponent(token)}`
}

/**
 * 为指定邮箱创建找回密码令牌（写入 verification 表，30 分钟有效）。
 * 邮箱未注册、或该用户在本 realm 没有密码凭证时返回 null
 * （调用方应返回通用提示，避免账号探测与跨端探测）。
 */
export async function createPasswordResetRequest(
  db: Database,
  email: string,
  resetUrlBase: string,
  realm: Realm
): Promise<{ userId: string; name: string; token: string; resetUrl: string } | null> {
  const rows = (await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)) as Array<{ id: string; name: string }>

  const found = rows[0]
  if (!found) return null

  const hasRealmCredential = await hasRealmPasswordCredential(db, found.id, realm)
  if (!hasRealmCredential) return null

  const token = crypto.randomUUID()
  const identifier = buildPasswordResetIdentifier(realm, found.id)

  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({
    id: newId(),
    identifier,
    value: token,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  })

  return {
    userId: found.id,
    name: found.name,
    token,
    resetUrl: buildPasswordResetUrl(resetUrlBase, token),
  }
}

/** 该用户在本 realm 是否持有密码凭证（决定能否发起本 realm 的找回密码）。 */
async function hasRealmPasswordCredential(
  db: Database,
  userId: string,
  realm: Realm
): Promise<boolean> {
  const rows = (await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        isNotNull(account.password),
        inArray(account.providerId, getRealmPasswordProviderIds(realm))
      )
    )
    .limit(1)) as Array<{ id: string }>

  return rows.length > 0
}

async function findTokenRow(
  db: Database,
  token: string,
): Promise<{ identifier: string } | null> {
  const rows = (await db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(eq(verification.value, token))
    .limit(1)) as Array<{ identifier: string }>

  const row = rows[0]
  if (!row) return null

  const meta = (await db
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.value, token))
    .limit(1)) as Array<{ expiresAt: Date }>
  const expiresAt = meta[0]?.expiresAt

  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    await db.delete(verification).where(eq(verification.value, token))
    return null
  }

  return { identifier: row.identifier }
}

/**
 * 校验找回密码令牌，返回对应 userId。
 * 令牌必须由本 realm 签发——其他应用签发的令牌在此无效，防止跨端重放。
 */
export async function validatePasswordResetToken(
  db: Database,
  token: string,
  realm: Realm
): Promise<string | null> {
  const row = await findTokenRow(db, token)
  if (!row) return null

  const parsed = parsePasswordResetIdentifier(row.identifier)
  if (!parsed || parsed.realm !== realm) return null

  return parsed.userId
}

/** 校验令牌并只更新本 realm 凭证的密码。 */
export async function resetPasswordWithToken(
  db: Database,
  token: string,
  newPassword: string,
  realm: Realm
): Promise<boolean> {
  const userId = await validatePasswordResetToken(db, token, realm)
  if (!userId) return false

  const credentialIds = (await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        isNotNull(account.password),
        inArray(account.providerId, getRealmPasswordProviderIds(realm))
      )
    )) as Array<{ id: string }>

  await db.delete(verification).where(eq(verification.value, token))
  if (credentialIds.length === 0) return false

  const hashed = await hashPassword(newPassword)
  await db
    .update(account)
    .set({ password: hashed })
    .where(inArray(account.id, credentialIds.map((row) => row.id)))

  return true
}

/** 供应用内部（如管理员重置密码）直接为用户更新本 realm 凭证的密码。 */
export async function resetPasswordForUser(
  db: Database,
  userId: string,
  newPassword: string,
  realm: Realm
): Promise<boolean> {
  const credentialIds = (await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        isNotNull(account.password),
        inArray(account.providerId, getRealmPasswordProviderIds(realm))
      )
    )) as Array<{ id: string }>

  if (credentialIds.length === 0) return false

  const hashed = await hashPassword(newPassword)
  await db
    .update(account)
    .set({ password: hashed })
    .where(inArray(account.id, credentialIds.map((row) => row.id)))

  return true
}
