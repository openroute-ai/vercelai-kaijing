import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildAccessTokenClaims,
  issuedAccessTokenClaimsRemainBound,
  readOrganizationIdFromTokenClaims,
  requireConsentOrganizationId,
  resolveOrganizationIdForMcp,
} from "./access-token"

test("缺少 referenceId 时拒绝签发 org_id", () => {
  assert.throws(() => requireConsentOrganizationId(undefined), /恰好一个组织/)
  assert.throws(() => requireConsentOrganizationId(""), /恰好一个组织/)
  assert.throws(() => buildAccessTokenClaims({ referenceId: "  " }), /恰好一个组织/)
})

test("customAccessTokenClaims 写入恰好一个 org_id", () => {
  const claims = buildAccessTokenClaims({
    referenceId: "org_a",
    scopes: ["kaijing:account.read"],
  })
  assert.deepEqual(claims, { org_id: "org_a" })
})

test("Topbar 切换组织不会改写已签发令牌中的 org_id", () => {
  const issued = buildAccessTokenClaims({ referenceId: "org_a" })
  const sessionAfterSwitch = { activeOrganizationId: "org_b" }
  const resolved = resolveOrganizationIdForMcp({
    tokenClaims: issued,
    sessionOrgId: sessionAfterSwitch.activeOrganizationId,
  })
  assert.equal(resolved, "org_a")
  assert.notEqual(resolved, sessionAfterSwitch.activeOrganizationId)
  const check = issuedAccessTokenClaimsRemainBound(issued, "org_b")
  assert.equal(check.org_id, "org_a")
  assert.equal(check.unchanged, true)
})

test("模型或请求传入的 organization_id 不能覆盖令牌组织", () => {
  const claims = buildAccessTokenClaims({ referenceId: "org_a" })
  assert.equal(
    readOrganizationIdFromTokenClaims(claims, { requestOrgId: "org_evil" }),
    "org_a",
  )
  assert.equal(
    resolveOrganizationIdForMcp({
      tokenClaims: claims,
      requestOrgId: "org_evil",
      sessionOrgId: "org_b",
    }),
    "org_a",
  )
})

test("没有 org_id 的令牌不能用于 MCP", () => {
  assert.throws(
    () => readOrganizationIdFromTokenClaims({ organization_id: "org_a" }),
    /缺少 org_id/,
  )
})
