import assert from 'node:assert/strict'
import { test } from 'node:test'
import { signSessionCookie, unsignCookieValue } from './session-cookie'

test('签名后的会话 cookie 可以还原令牌', async () => {
  const header = await signSessionCookie('cloud.session_token', 'token-1', 'secret', {
    httpOnly: true,
    path: '/',
  })
  const value = header.split(';')[0]?.slice('cloud.session_token='.length)
  assert.ok(value)
  assert.equal(await unsignCookieValue(value, 'secret'), 'token-1')
  assert.equal(await unsignCookieValue(value, 'other-secret'), null)
})
