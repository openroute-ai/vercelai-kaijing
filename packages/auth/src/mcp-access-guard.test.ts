import assert from "node:assert/strict"
import { test } from "node:test"
import { evaluateMcpAccess, hasRequiredScope } from "./mcp-access-guard"
import { OPENSHOP_READ_SCOPE, OPENSHOP_WRITE_PENDING_SCOPE } from "./oauth-scopes"

const claims = { org_id: "org_a" }

test("环境或组织开关关闭时拒绝", () => {
  assert.equal(evaluateMcpAccess({ envEnabled: false, organizationEnabled: true, claims }).ok, false)
  const denied = evaluateMcpAccess({ envEnabled: true, organizationEnabled: false, claims })
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.equal(denied.status, 403)
})

test("组织只能来自令牌声明，请求或 SHOP_DEV 不能覆盖", () => {
  const granted = evaluateMcpAccess({
    envEnabled: true,
    organizationEnabled: true,
    claims,
    requestOrgId: "org_evil",
    sessionOrgId: "org_b",
    devOrganizationId: "org_shop_dev_demo",
  })
  assert.deepEqual(granted, { ok: true, organizationId: "org_a" })
})

test("已停用客户端或已吊销令牌即使未过期也不能调用", () => {
  const disabled = evaluateMcpAccess({
    envEnabled: true,
    organizationEnabled: true,
    claims,
    clientDisabled: true,
  })
  assert.equal(disabled.ok, false)
  const revoked = evaluateMcpAccess({
    envEnabled: true,
    organizationEnabled: true,
    claims,
    tokenRevoked: true,
  })
  assert.equal(revoked.ok, false)
  if (!revoked.ok) {
    assert.equal(revoked.status, 401)
    assert.match(revoked.message, /吊销/)
  }
})

test("缺少 org_id 的令牌不能访问", () => {
  const denied = evaluateMcpAccess({
    envEnabled: true,
    organizationEnabled: true,
    claims: {},
  })
  assert.equal(denied.ok, false)
})

test("读范围与写范围互相独立", () => {
  assert.equal(hasRequiredScope([OPENSHOP_READ_SCOPE], OPENSHOP_READ_SCOPE), true)
  assert.equal(hasRequiredScope([OPENSHOP_READ_SCOPE], OPENSHOP_WRITE_PENDING_SCOPE), false)
  assert.equal(
    hasRequiredScope([OPENSHOP_READ_SCOPE, OPENSHOP_WRITE_PENDING_SCOPE], OPENSHOP_WRITE_PENDING_SCOPE),
    true,
  )
})
