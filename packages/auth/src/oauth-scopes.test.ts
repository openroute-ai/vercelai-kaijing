import assert from "node:assert/strict"
import { test } from "node:test"
import {
  OPENSHOP_ISSUABLE_SCOPES,
  OPENSHOP_WRITE_CONFIRM_SCOPE,
  assertIssuableScopes,
  isIssuableScope,
  parseScopeList,
} from "./oauth-scopes"

test("签发范围包含 read 与 write.pending，不含 write.confirm", () => {
  assert.equal(isIssuableScope("kaijing:account.read"), true)
  assert.equal(isIssuableScope("kaijing:generation.submit"), true)
  assert.equal(isIssuableScope(OPENSHOP_WRITE_CONFIRM_SCOPE), false)
  assert.equal(
    (OPENSHOP_ISSUABLE_SCOPES as readonly string[]).includes(OPENSHOP_WRITE_CONFIRM_SCOPE),
    false,
  )
})

test("openid 等标准范围可签发", () => {
  for (const scope of ["openid", "profile", "email", "offline_access"]) {
    assert.equal(isIssuableScope(scope), true)
  }
})

test("拒绝签发 confirm 或未知范围", () => {
  assert.throws(() => assertIssuableScopes(["kaijing:account.read", OPENSHOP_WRITE_CONFIRM_SCOPE]), /不可签发/)
  assert.throws(() => assertIssuableScopes(["admin"]), /不可签发/)
})

test("解析空格分隔的 scope 字符串", () => {
  assert.deepEqual(parseScopeList("openid  kaijing:account.read"), ["openid", "kaijing:account.read"])
})
