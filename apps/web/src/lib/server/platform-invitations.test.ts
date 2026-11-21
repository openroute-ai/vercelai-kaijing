import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isSyntheticPhoneEmail, normalizeContactPhone } from '@workspace/auth'
import { DEFAULT_PLATFORM_INVITE_ROLE } from '@/lib/platform-invite'
import {
  invitationEffectiveStatus,
  isValidCnMobile,
  isValidInviteEmail,
  resolvePlatformInviteRole,
  shouldBindInvitationEmail,
} from './dataaccess/platform-invitation-rules'

describe('platform invitation contacts', () => {
  it('accepts 11-digit mainland mobiles and normalizes +86 / separators', () => {
    assert.equal(isValidCnMobile('13800138000'), true)
    assert.equal(isValidCnMobile('138 0013 8000'), true)
    assert.equal(isValidCnMobile('+8613800138000'), true)
    assert.equal(isValidCnMobile('8613800138000'), true)
    assert.equal(isValidCnMobile('12800138000'), false)
    assert.equal(isValidCnMobile('1380013800'), false)
    assert.equal(isValidCnMobile('not-a-phone'), false)
    assert.equal(normalizeContactPhone('+86 138-0013-8000'), '13800138000')
  })

  it('requires at least a plausible email when provided', () => {
    assert.equal(isValidInviteEmail('ops@example.com'), true)
    assert.equal(isValidInviteEmail('bad@'), false)
    assert.equal(isValidInviteEmail(''), false)
  })
})

describe('platform invitation roles', () => {
  it('defaults to platform operator and rejects tenant or shop roles', () => {
    assert.equal(resolvePlatformInviteRole(undefined), DEFAULT_PLATFORM_INVITE_ROLE)
    assert.equal(resolvePlatformInviteRole(''), DEFAULT_PLATFORM_INVITE_ROLE)
    assert.equal(resolvePlatformInviteRole('platform_admin'), 'platform_admin')
    assert.equal(resolvePlatformInviteRole('platform_finance'), 'platform_finance')
    assert.throws(() => resolvePlatformInviteRole('operator'), /平台管理员、平台运营或平台财务/)
    assert.throws(() => resolvePlatformInviteRole('owner'), /平台管理员、平台运营或平台财务/)
    assert.throws(() => resolvePlatformInviteRole('member'), /平台管理员、平台运营或平台财务/)
  })
})

describe('platform invitation status', () => {
  it('treats overdue pending invites as expired without changing other statuses', () => {
    const past = new Date(Date.now() - 1000)
    const future = new Date(Date.now() + 60_000)
    assert.equal(invitationEffectiveStatus('pending', past), 'expired')
    assert.equal(invitationEffectiveStatus('pending', future), 'pending')
    assert.equal(invitationEffectiveStatus('accepted', past), 'accepted')
    assert.equal(invitationEffectiveStatus('canceled', past), 'canceled')
  })
})

describe('bind invitation email after phone signup', () => {
  it('binds a real email onto a synthetic phone email for the same user', () => {
    assert.equal(isSyntheticPhoneEmail('13800138000@vercelai.cn', '13800138000'), true)
    assert.equal(
      shouldBindInvitationEmail({
        userEmail: '13800138000@vercelai.cn',
        userPhone: '13800138000',
        invitationEmail: 'ops@example.com',
      }),
      true,
    )
  })

  it('does not overwrite an already bound real email', () => {
    assert.equal(
      shouldBindInvitationEmail({
        userEmail: 'already@example.com',
        userPhone: '13800138000',
        invitationEmail: 'ops@example.com',
      }),
      false,
    )
  })

  it('does nothing when the invitation has no email or already matches', () => {
    assert.equal(
      shouldBindInvitationEmail({
        userEmail: '13800138000@vercelai.cn',
        userPhone: '13800138000',
        invitationEmail: '',
      }),
      false,
    )
    assert.equal(
      shouldBindInvitationEmail({
        userEmail: 'ops@example.com',
        userPhone: '13800138000',
        invitationEmail: 'ops@example.com',
      }),
      false,
    )
  })
})
