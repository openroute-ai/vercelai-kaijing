import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"

/**
 * better-auth 身份表的列定义工厂（单一事实来源）。
 *
 * public schema（auth-schema.ts，桌面 / 薄云用户）与 web_auth schema
 * （web-auth-schema.ts，apps/web 平台管理员专用，与云端用户物理隔离）
 * 各自实例化同一套列定义，避免两处列定义漂移。
 *
 * 含外键的表通过参数接收目标表，保证 FK 落在各自 schema 内：
 * web_auth.session.user_id 只能引用 web_auth.users.id，绝不跨到 public.users。
 */

/** 引用目标表只需暴露被引用的列 */
type RefTable<C extends string = string> = Record<C, AnyPgColumn>

export const usersColumns = () => ({
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  phoneNumber: text("phone_number").unique(), // 用户手机号码
  phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(), // 手机号是否已验证
  role: varchar("role", { length: 256 }).default("user"), // 用户角色：admin, user, guest
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  provisionedBy: text("provisioned_by"),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  customerId: text("customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const sessionColumns = (
  userRef: RefTable<"id">,
  organizationRef: RefTable<"id">
) => ({
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => userRef.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id")
    .references(() => organizationRef.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
})

export const accountColumns = (userRef: RefTable<"id">) => ({
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => userRef.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const verificationColumns = () => ({
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const organizationColumns = (selfRef: () => AnyPgColumn) => ({
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: jsonb("metadata"),
  entryApproved: boolean("entry_approved").notNull().default(false),
  isCurrent: boolean("is_current").notNull().default(false),
  status: text("status").default("active").notNull(),

  // ---- 多租户组织类型 ----
  orgType: varchar("org_type", { length: 16 }).notNull().default("tenant"),
  // 'platform' | 'supplier' | 'merchant' | 'tenant'

  // ---- 经销商关联（仅 tenant） ----
  parentMerchantOrgId: text("parent_merchant_org_id").references(selfRef, {
    onDelete: "set null",
  }),
  // ---- 供应商专属字段 ----
  supplierType: varchar("supplier_type", { length: 16 }),
  // 'gpu' | 'cpu' | 'hybrid' | null
  supplierTier: varchar("supplier_tier", { length: 16 }),
  // 'basic' | 'professional' | 'enterprise' | null
  supplierStatus: varchar("supplier_status", { length: 16 }),
  // 'pending' | 'approved' | 'suspended' | null
  commissionRate: integer("commission_rate"),
  // 平台抽成比例 (千分比, e.g. 100 = 10%)

  // ---- 经销商专属字段 ----
  merchantTier: varchar("merchant_tier", { length: 16 }),
  // 'basic' | 'professional' | 'enterprise' | null
  merchantStatus: varchar("merchant_status", { length: 16 }),
  // 'pending' | 'approved' | 'suspended' | null
  merchantCommissionRate: integer("merchant_commission_rate"),
  // 经销商分成比例 (千分比)

  // ---- 企业认证（兼容字段；权威摘要见 identityStatus）----
  enterpriseVerificationStatus: varchar("enterprise_verification_status", {
    length: 16,
  })
    .default("unverified")
    .notNull(),
  // 'unverified' | 'pending' | 'verified' | 'rejected'

  /**
   * 实名认证摘要状态（权威展示）
   * unverified | pending | individual_verified | enterprise_verified | rejected
   */
  identityStatus: varchar("identity_status", { length: 32 })
    .default("unverified")
    .notNull(),

  // ---- Capsule 多租户隔离状态 ----
  capsuleNamespaceReady: boolean("capsule_namespace_ready").default(false).notNull(),
  // 租户首次提交任务时懒加载 Namespace，完成后置 true
  capsuleSyncStatus: varchar("capsule_sync_status", { length: 20 }).default("pending"),
  // 'pending' | 'syncing' | 'synced' | 'failed' | 'suspended'
  capsuleSyncedAt: timestamp("capsule_synced_at"),
  capsuleSyncError: text("capsule_sync_error"),
})

export const memberColumns = (
  organizationRef: RefTable<"id">,
  userRef: RefTable<"id">
) => ({
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationRef.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => userRef.id, { onDelete: "cascade" }),
  role: text("role").default("member").notNull(),
  // ---- 资源级作用域（用于 site_operator 等限定角色） ----
  scopeType: varchar("scope_type", { length: 16 }),
  // 'project' | 'task' | null (null = 组织级权限)
  scopeId: text("scope_id"),
  createdAt: timestamp("created_at").notNull(),
})

export const invitationColumns = (
  organizationRef: RefTable<"id">,
  userRef: RefTable<"id">
) => ({
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationRef.id, { onDelete: "cascade" }),
  /** 邮箱可空：纯手机号邀请时仅写 phone */
  email: text("email"),
  /** 中国大陆手机号（规范化后 11 位）；手机登录时自动绑定组织 */
  phone: text("phone"),
  role: text("role"),
  status: text("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => userRef.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const sessionIndexes = (table: { userId: AnyPgColumn }) => [
  index("session_userId_idx").on(table.userId),
]
export const accountIndexes = (table: { userId: AnyPgColumn }) => [
  index("account_userId_idx").on(table.userId),
]
export const verificationIndexes = (table: { identifier: AnyPgColumn }) => [
  index("verification_identifier_idx").on(table.identifier),
]
export const invitationIndexes = (table: {
  organizationId: AnyPgColumn
  email: AnyPgColumn
  phone: AnyPgColumn
  inviterId: AnyPgColumn
}) => [
  index("invitation_organization_id_idx").on(table.organizationId),
  index("invitation_email_idx").on(table.email),
  index("invitation_phone_idx").on(table.phone),
  index("invitation_inviter_id_idx").on(table.inviterId),
]
