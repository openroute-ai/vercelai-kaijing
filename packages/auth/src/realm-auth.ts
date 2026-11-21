import { and, eq } from 'drizzle-orm'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { user, account } from '@workspace/db/schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any

export const REALM_PROVIDERS = {
  merchant: { email: 'merchant-email', phone: 'merchant-phoneNumber' },
  cloud: { email: 'cloud-email', phone: 'cloud-phoneNumber' },
  supplier: { email: 'supplier-email', phone: 'supplier-phoneNumber' },
  web: { email: 'web-email', phone: 'web-phoneNumber' },
} as const

export type Realm = keyof typeof REALM_PROVIDERS

function generateId(): string {
  return crypto.randomUUID()
}

export async function realmSignUp(params: {
  db: Database
  realm: Realm
  email?: string
  phoneNumber?: string
  password: string
  name: string
}): Promise<{ userId: string }> {
  const providerId = params.email
    ? REALM_PROVIDERS[params.realm].email
    : REALM_PROVIDERS[params.realm].phone

  const accountId = params.email ?? params.phoneNumber!

  let existingUser: Record<string, unknown> | null = null
  if (params.email) {
    existingUser = (await params.db.query.user.findFirst({
      where: eq(user.email, params.email),
    })) as Record<string, unknown> | null
  } else {
    existingUser = (await params.db.query.user.findFirst({
      where: eq(user.phoneNumber, params.phoneNumber!),
    })) as Record<string, unknown> | null
  }

  if (existingUser) {
    const existingAccount = await params.db.query.account.findFirst({
      where: and(
        eq(account.userId, existingUser.id as string),
        eq(account.providerId, providerId),
      ),
    })
    if (existingAccount) {
      throw new Error('该账号已在此应用注册')
    }
  }

  const userId = (existingUser?.id as string) ?? generateId()
  if (!existingUser) {
    await params.db.insert(user).values({
      id: userId,
      name: params.name,
      email: params.email ?? `${params.phoneNumber}@${params.realm}.vercelai.cn`,
      emailVerified: !!params.email,
      phoneNumber: params.phoneNumber ?? null,
      phoneNumberVerified: !!params.phoneNumber,
    })
  }

  const hashedPassword = await hashPassword(params.password)
  await params.db.insert(account).values({
    id: generateId(),
    accountId,
    providerId,
    userId,
    password: hashedPassword,
  })

  return { userId }
}

export async function realmSignIn(params: {
  db: Database
  realm: Realm
  email?: string
  phoneNumber?: string
  password: string
}): Promise<{ userId: string }> {
  const providerId = params.email
    ? REALM_PROVIDERS[params.realm].email
    : REALM_PROVIDERS[params.realm].phone

  let foundUser: Record<string, unknown> | null = null
  if (params.email) {
    foundUser = (await params.db.query.user.findFirst({
      where: eq(user.email, params.email),
    })) as Record<string, unknown> | null
  } else {
    foundUser = (await params.db.query.user.findFirst({
      where: eq(user.phoneNumber, params.phoneNumber!),
    })) as Record<string, unknown> | null
  }

  if (!foundUser) throw new Error('账号或密码错误')

  const foundAccount = (await params.db.query.account.findFirst({
    where: and(
      eq(account.userId, foundUser.id as string),
      eq(account.providerId, providerId),
    ),
  })) as Record<string, unknown> | null

  if (!foundAccount) throw new Error('账号或密码错误')
  if (!foundAccount.password) throw new Error('账号或密码错误')

  const valid = await verifyPassword({ password: params.password, hash: foundAccount.password as string })
  if (!valid) throw new Error('账号或密码错误')

  return { userId: foundUser.id as string }
}
