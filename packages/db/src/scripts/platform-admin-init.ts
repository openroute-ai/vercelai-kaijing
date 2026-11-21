/**
 * 种子：apps/web 平台管理员（写入 web_auth schema，与租户 public schema 物理隔离）。
 *
 * 用法（仓库根）：
 *   pnpm --filter @workspace/db db:seed:admin
 *
 * 环境变量（根 .env 或 packages/db/.env；已存在的进程环境变量优先）：
 *   PLATFORM_ADMIN_EMAIL      必填语义上的主键之一，默认 platform-admin@example.com
 *   PLATFORM_ADMIN_PHONE      可选；提供后可走手机验证码+拼图登录（E.164，如 +94771234567）
 *   PLATFORM_ADMIN_PASSWORD   可选；提供后可走邮箱密码登录（不提供则仅手机登录）
 *   PLATFORM_ADMIN_NAME       默认 Platform Admin
 *   PLATFORM_ADMIN_ORG_ID     默认 org_platform_main
 *   PLATFORM_ADMIN_ORG_SLUG   默认 platform（organization.slug 唯一键，幂等定位用）
 *   PLATFORM_ADMIN_ORG_NAME   默认 开镜平台
 *
 * 说明：
 * - 本地 apps 运行库是 studio@127.0.0.1:5434（apps/web/.env），而根 .env 的
 *   DATABASE_URL 指向 5431/shop；定向执行时用 DATABASE_URL 覆盖：
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/studio pnpm --filter @workspace/db db:seed:admin
 * - 幂等：按 organization.slug / users.email / users.phone_number 定位并 upsert。
 * - 管理员判定（登录门禁）= org_type='platform' 且 member.role ∈
 *   platform_admin/platform_operator/platform_finance（与 @workspace/auth ORG_ROLES.platform 一致；
 *   packages/db 不反向依赖 auth，故此处字面量声明）。
 */
import { config } from 'dotenv'
import { randomBytes, scryptSync } from 'node:crypto'
import { resolve } from 'node:path'
import { createId } from '@paralleldrive/cuid2'
import { eq, or } from 'drizzle-orm'
import { createPgClient } from '../client'
import {
  webAccount,
  webMember,
  webOrganization,
  webUser,
} from '../web-auth-schema'

config({ path: resolve(process.cwd(), '../../.env') })
config({ path: resolve(process.cwd(), '.env') })

const EMAIL = process.env.PLATFORM_ADMIN_EMAIL?.trim() || 'platform-admin@example.com'
const PHONE = process.env.PLATFORM_ADMIN_PHONE?.trim() || null
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || null
const NAME = process.env.PLATFORM_ADMIN_NAME?.trim() || 'Platform Admin'
const ORG_ID = process.env.PLATFORM_ADMIN_ORG_ID?.trim() || 'org_platform_main'
const ORG_SLUG = process.env.PLATFORM_ADMIN_ORG_SLUG?.trim() || 'platform'
const ORG_NAME = process.env.PLATFORM_ADMIN_ORG_NAME?.trim() || '开镜平台'

/** 与 better-auth @better-auth/utils/password 的 scrypt 格式保持一致：`${salt}:${key}`（hex） */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  })
  return `${salt}:${key.toString('hex')}`
}

async function main() {
  const { db, pool } = createPgClient()
  try {
    await db.transaction(async (tx) => {
      const [existingOrg] = await tx
        .select()
        .from(webOrganization)
        .where(or(eq(webOrganization.slug, ORG_SLUG), eq(webOrganization.id, ORG_ID)))
        .limit(1)

      const orgId = existingOrg?.id ?? createId()
      if (existingOrg) {
        await tx
          .update(webOrganization)
          .set({
            name: ORG_NAME,
            slug: ORG_SLUG,
            orgType: 'platform',
            entryApproved: true,
            isCurrent: false,
            status: 'active',
          })
          .where(eq(webOrganization.id, existingOrg.id))
      } else {
        await tx.insert(webOrganization).values({
          id: orgId,
          name: ORG_NAME,
          slug: ORG_SLUG,
          createdAt: new Date(),
          entryApproved: true,
          isCurrent: false,
          status: 'active',
          orgType: 'platform',
        })
      }

      const [byEmail] = await tx
        .select()
        .from(webUser)
        .where(eq(webUser.email, EMAIL))
        .limit(1)

      let user = byEmail
      if (!user && PHONE) {
        const [byPhone] = await tx
          .select()
          .from(webUser)
          .where(eq(webUser.phoneNumber, PHONE))
          .limit(1)
        if (byPhone && byPhone.email !== EMAIL) {
          throw new Error(
            `手机号 ${PHONE} 已被账号 ${byPhone.email} 占用，与 PLATFORM_ADMIN_EMAIL=${EMAIL} 冲突`
          )
        }
        user = byPhone
      }

      const userId = user?.id ?? createId()
      if (user) {
        await tx
          .update(webUser)
          .set({
            name: NAME,
            email: EMAIL,
            emailVerified: true,
            phoneNumber: PHONE,
            phoneNumberVerified: PHONE != null,
            role: 'admin',
          })
          .where(eq(webUser.id, user.id))
      } else {
        await tx.insert(webUser).values({
          id: userId,
          name: NAME,
          email: EMAIL,
          emailVerified: true,
          phoneNumber: PHONE,
          phoneNumberVerified: PHONE != null,
          role: 'admin',
          mustChangePassword: false,
        })
      }

      if (PASSWORD) {
        const passwordHash = hashPassword(PASSWORD)
        const [existingAccount] = await tx
          .select()
          .from(webAccount)
          .where(eq(webAccount.userId, userId))
          .limit(1)
        if (existingAccount) {
          await tx
            .update(webAccount)
            .set({ password: passwordHash, providerId: 'credential', accountId: userId })
            .where(eq(webAccount.id, existingAccount.id))
        } else {
          await tx.insert(webAccount).values({
            id: createId(),
            accountId: userId,
            providerId: 'credential',
            userId,
            password: passwordHash,
          })
        }
      }

      const [existingMember] = await tx
        .select()
        .from(webMember)
        .where(eq(webMember.userId, userId))
        .limit(1)
      if (existingMember) {
        await tx
          .update(webMember)
          .set({ organizationId: orgId, role: 'platform_admin' })
          .where(eq(webMember.id, existingMember.id))
      } else {
        await tx.insert(webMember).values({
          id: createId(),
          organizationId: orgId,
          userId,
          role: 'platform_admin',
          createdAt: new Date(),
        })
      }

      console.log('[platform-admin-init] 完成：')
      console.log(`  schema      web_auth`)
      console.log(`  organization ${orgId} (${ORG_SLUG}, org_type=platform)`)
      console.log(`  user        ${userId}`)
      console.log(`  email       ${EMAIL}`)
      console.log(`  phone       ${PHONE ?? '(未设置，仅邮箱密码登录)'} `)
      console.log(`  password    ${PASSWORD ? '已写入 credential 账号' : '(未设置，仅手机验证码登录)'}`)
      console.log(`  member      platform_admin`)
    })
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('[platform-admin-init] 失败:', error)
  process.exitCode = 1
})
