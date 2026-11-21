/**
 * 桌面端登录薄云用的 OAuth Provider 配置。
 * 不要放进 sharedAuthOptions：apps/web 控制台走自己的 better-auth 实例。
 */
import { jwt, type JwtOptions } from "better-auth/plugins"
import {
  oauthProvider,
  type OAuthOptions,
  type OAuthProviderExtension,
  type Scope,
} from "@better-auth/oauth-provider"
import {
  buildAccessTokenClaims,
  requireConsentOrganizationId,
} from "./access-token"
import { OPENSHOP_ISSUABLE_SCOPES } from "./oauth-scopes"

export const SHOP_OAUTH_LOGIN_PAGE = "/oauth/signin"
export const SHOP_OAUTH_CONSENT_PAGE = "/oauth/consent"
export const SHOP_OAUTH_SELECT_ORG_PAGE = "/oauth/select-org"

/** jwt 插件的 /token 与授权码换票无关，避免暴露会话 JWT 端点。 */
export const SHOP_OAUTH_DISABLED_AUTH_PATHS = ["/token"] as const

export const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = 900

export type ShopOAuthSession = {
  activeOrganizationId?: string | null
  userId?: string
  impersonatedBy?: string | null
}

export type CreateShopOAuthProviderOptions = {
  mcpResource: string
  loginPage?: string
  consentPage?: string
  postLoginPage?: string
  accessTokenExpiresIn?: number
  allowInsecureLocalRedirects?: boolean
  extensions?: OAuthProviderExtension[]
  listOrganizationIds: (input: {
    userId: string
    headers: Headers
  }) => Promise<string[]>
  canManageClients?: (input: {
    user?: { id?: string } | null
    session?: ShopOAuthSession | null
    action: string
    headers?: Headers
  }) => Promise<boolean> | boolean
}

export function createShopJwtOptions(): JwtOptions {
  return { disableSettingJwtHeader: true }
}

function isLocalHttpRedirect(url: URL): boolean {
  if (url.protocol !== "http:") return false
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  )
}

export function createShopOAuthProviderOptions(
  options: CreateShopOAuthProviderOptions,
): OAuthOptions<Scope[]> {
  const loginPage = options.loginPage ?? SHOP_OAUTH_LOGIN_PAGE
  const consentPage = options.consentPage ?? SHOP_OAUTH_CONSENT_PAGE
  const postLoginPage = options.postLoginPage ?? SHOP_OAUTH_SELECT_ORG_PAGE
  const canManageClients = options.canManageClients

  return {
    loginPage,
    consentPage,
    scopes: [...OPENSHOP_ISSUABLE_SCOPES] as Scope[],
    accessTokenExpiresIn: options.accessTokenExpiresIn ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
    allowDynamicClientRegistration: false,
    allowUnauthenticatedClientRegistration: false,
    clientRegistrationRequirePKCE: true,
    disableJwtPlugin: false,
    resources: [
      {
        identifier: options.mcpResource,
        name: "开镜",
        allowedScopes: [...OPENSHOP_ISSUABLE_SCOPES],
        accessTokenTtl: options.accessTokenExpiresIn ?? DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
      },
    ],
    // v1 预注册客户端即可请求 MCP 资源；S2 管理端创建客户端时再按需建立关联。
    enforcePerClientResources: false,
    allowInsecureRedirectUri: options.allowInsecureLocalRedirects
      ? isLocalHttpRedirect
      : undefined,
    extensions: options.extensions,
    postLogin: {
      page: postLoginPage,
      consentReferenceId: ({ session }) => {
        const oauthSession = session as ShopOAuthSession
        if (oauthSession.impersonatedBy) {
          throw new Error("模拟登录期间不能完成工作台授权")
        }
        return requireConsentOrganizationId(oauthSession.activeOrganizationId)
      },
      shouldRedirect: async ({ session, headers, isContinuation }) => {
        const oauthSession = session as ShopOAuthSession
        if (oauthSession.impersonatedBy) return true
        const userId = oauthSession.userId
        if (!userId) return true
        const organizationIds = await options.listOrganizationIds({ userId, headers })
        const activeOrganizationId = oauthSession.activeOrganizationId?.trim() ?? ""
        if (!activeOrganizationId || !organizationIds.includes(activeOrganizationId)) {
          return true
        }
        if (!isContinuation && organizationIds.length > 1) {
          return true
        }
        return false
      },
    },
    customAccessTokenClaims: ({ referenceId, scopes }) =>
      buildAccessTokenClaims({ referenceId, scopes }),
    clientPrivileges: async ({ user, session, action, headers }) => {
      if (!canManageClients) return false
      return canManageClients({
        user,
        session: session as ShopOAuthSession | null,
        action,
        headers,
      })
    },
  }
}

export function createShopOAuthPlugins(options: CreateShopOAuthProviderOptions) {
  return [
    jwt(createShopJwtOptions()),
    oauthProvider(createShopOAuthProviderOptions(options)),
  ]
}
