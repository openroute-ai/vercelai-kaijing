import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { member, organization, session, user } from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

/**
 * 账户用户管理（public.users）。
 * 平台管理员在 web_auth schema，与这里物理隔离。
 * 封禁只更新用户并清掉会话，不写旧的经营审计表。
 */

export type PlatformUserListItem = {
  id: string
  name: string
  email: string
  phoneNumber: string | null
  emailVerified: boolean
  phoneVerified: boolean
  banned: boolean
  banReason: string | null
  banExpires: Date | null
  createdAt: Date
  memberships: { organizationName: string; role: string }[]
}

export async function listPlatformUsers(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters = []
  if (input.status === 'banned') {
    filters.push(eq(user.banned, true))
  } else if (input.status === 'active') {
    filters.push(or(isNull(user.banned), eq(user.banned, false))!)
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(ilike(user.name, value), ilike(user.email, value), ilike(user.phoneNumber, value))!,
    )
  }
  const where = filters.length ? and(...filters) : undefined

  const totalRows = await db
    .select({ total: count() })
    .from(user)
    .where(where)
  const total = Number(totalRows[0]?.total ?? 0)

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneNumberVerified,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const userIds = rows.map((row) => row.id)
  const membershipRows = userIds.length
    ? await db
        .select({
          userId: member.userId,
          organizationName: organization.name,
          role: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(and(inArray(member.userId, userIds), eq(organization.orgType, 'tenant')))
    : []
  const membershipsByUser = new Map<string, { organizationName: string; role: string }[]>()
  for (const row of membershipRows) {
    const list = membershipsByUser.get(row.userId) ?? []
    list.push({ organizationName: row.organizationName, role: row.role })
    membershipsByUser.set(row.userId, list)
  }

  // 不要在 sql`` 里内嵌 ${member}/${organization} 再 join：单表外层查询下
  // drizzle 会去掉列前缀，member/organization 同名 id 列导致 ambiguous 报错。
  const [summaryRow] = await db
    .select({
      total: count(),
      banned: sql<number>`count(*) filter (where ${user.banned} = true)`,
    })
    .from(user)
  const [tenantMembersRow] = await db
    .select({ tenantMembers: countDistinct(member.userId) })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(organization.orgType, 'tenant'))

  const items: PlatformUserListItem[] = rows.map((row) => ({
    ...row,
    banned: Boolean(row.banned),
    memberships: membershipsByUser.get(row.id) ?? [],
  }))

  return {
    items,
    total,
    page,
    pageSize,
    summary: {
      total: Number(summaryRow?.total ?? 0),
      banned: Number(summaryRow?.banned ?? 0),
      tenantMembers: Number(tenantMembersRow?.tenantMembers ?? 0),
    },
  }
}

export async function getPlatformUser(id: string) {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber,
      phoneVerified: user.phoneNumberVerified,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  if (!row) return null

  const memberships = await db
    .select({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      orgType: organization.orgType,
      role: member.role,
      entryApproved: organization.entryApproved,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, id))
    .orderBy(desc(member.createdAt))

  return { user: row, memberships }
}

type DbLike = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function tenantOrgIdsOfUser(dbLike: DbLike, userId: string) {
  const rows = await dbLike
    .select({ organizationId: member.organizationId })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(organization.orgType, 'tenant')))
  return rows.map((row) => row.organizationId)
}

export async function banPlatformUser(input: {
  userId: string
  operatorId: string
  reason: string
  expiresAt?: Date | null
}) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1)
    if (!target) throw new Error('用户不存在')
    if (target.banned) throw new Error('用户已被封禁')

    const now = new Date()
    await tx
      .update(user)
      .set({
        banned: true,
        banReason: input.reason.trim(),
        banExpires: input.expiresAt ?? null,
        updatedAt: now,
      })
      .where(eq(user.id, target.id))
    // 立即失效既有会话（登录闸在 better-auth banned 字段）
    await tx.delete(session).where(eq(session.userId, target.id))

    const orgIds = await tenantOrgIdsOfUser(tx, target.id)
    return {
      ok: true as const,
      userId: target.id,
      organizations: orgIds.length,
    }
  })
}

export async function unbanPlatformUser(input: {
  userId: string
  operatorId: string
}) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        banned: user.banned,
      })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1)
    if (!target) throw new Error('用户不存在')
    if (!target.banned) throw new Error('用户未被封禁')

    const now = new Date()
    await tx
      .update(user)
      .set({
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: now,
      })
      .where(eq(user.id, target.id))

    const orgIds = await tenantOrgIdsOfUser(tx, target.id)
    return { ok: true as const, userId: target.id, organizations: orgIds.length }
  })
}
