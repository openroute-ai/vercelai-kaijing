/**
 * 开镜授权范围。签发列表不含确认类写范围。
 * 常量名仍沿用历史前缀，避免一次性改动认证调用面；实际 scope 字符串已换成 kaijing。
 */
export const OPENSHOP_READ_SCOPE = "kaijing:account.read"
export const OPENSHOP_WRITE_PENDING_SCOPE = "kaijing:generation.submit"

/** 仅控制台确认使用，不得向任何 OAuth 客户端签发。 */
export const OPENSHOP_WRITE_CONFIRM_SCOPE = "kaijing:generation.confirm"

/** 与 @better-auth/oauth-provider DEFAULT_OAUTH_SCOPES 对齐。 */
export const OPENSHOP_OIDC_SCOPES = ["openid", "profile", "email", "offline_access"] as const

export const OPENSHOP_ISSUABLE_SCOPES = [
  ...OPENSHOP_OIDC_SCOPES,
  OPENSHOP_READ_SCOPE,
  OPENSHOP_WRITE_PENDING_SCOPE,
] as const

export type OpenshopIssuableScope = (typeof OPENSHOP_ISSUABLE_SCOPES)[number]

export const OPENSHOP_SCOPE_LABELS_ZH: Record<
  string,
  { title: string; description: string }
> = {
  openid: { title: "登录身份", description: "确认你的账号身份。" },
  profile: { title: "基本资料", description: "读取你的显示名称等基本资料。" },
  email: { title: "邮箱", description: "读取你的邮箱地址。" },
  offline_access: {
    title: "离线访问",
    description: "在你离开后保持授权，以便工作台继续访问本组织。",
  },
  [OPENSHOP_READ_SCOPE]: {
    title: "读取账户",
    description: "读取本账号的资料、积分与生成任务状态。",
  },
  [OPENSHOP_WRITE_PENDING_SCOPE]: {
    title: "提交生成",
    description: "向统一生成网关提交生图或生视频任务。",
  },
}

export function isIssuableScope(scope: string): boolean {
  return (OPENSHOP_ISSUABLE_SCOPES as readonly string[]).includes(scope)
}

export function parseScopeList(scope?: string | readonly string[] | null): string[] {
  const raw = typeof scope === "string" ? scope.split(/[\s,]+/) : [...(scope ?? [])]
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

export function assertIssuableScopes(scopes: readonly string[]): void {
  const forbidden = scopes.filter((scope) => !isIssuableScope(scope))
  if (forbidden.length > 0) {
    throw new Error(`不可签发的授权范围: ${forbidden.join(", ")}`)
  }
}
