import * as authSchema from "./auth-schema"
import * as kaijingSchema from "./kaijing-schema"
import * as oauthSchema from "./oauth-schema"
import * as rbacSchema from "./rbac-schema"

export * from "./auth-schema"
export * from "./kaijing-schema"
export * from "./oauth-schema"
export * from "./rbac-schema"

/** 显式交叉类型，避免 TS7056 同时保留各表导出类型 */
export type AppDbSchema = typeof authSchema &
  typeof kaijingSchema &
  typeof rbacSchema &
  typeof oauthSchema

export const schema: AppDbSchema = {
  ...authSchema,
  ...kaijingSchema,
  ...rbacSchema,
  ...oauthSchema,
}
