import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SETTINGS_NAV_GROUPS,
  SITE_NAV_GROUPS,
  findBestMatchingNavItem,
  isNavItemActive,
} from './site-nav'

describe('console and settings navigation', () => {
  it('keeps account and thin-cloud menus, and settings pages out of the console', () => {
    const consoleUrls = SITE_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url))
    const settingsUrls = SETTINGS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url))
    assert.deepEqual(consoleUrls, [
      '/console/users',
      '/console/invitations',
      '/console/credits',
      '/console/generation-jobs',
    ])
    assert.ok(!consoleUrls.includes('/settings/platform-config'))
    assert.ok(settingsUrls.includes('/settings/platform-config'))
    assert.ok(settingsUrls.includes('/settings/audit-logs'))
    assert.ok(settingsUrls.includes('/settings/announcements'))
    assert.ok(settingsUrls.includes('/settings/roles'))
  })

  it('activates list nav items for detail routes', () => {
    const users = findBestMatchingNavItem('/console/users/u1')
    assert.equal(users?.url, '/console/users')
    assert.equal(isNavItemActive('/console/users/u1', users!), true)
  })

  it('does not treat account settings as active on other settings pages', () => {
    const account = SETTINGS_NAV_GROUPS[0]?.items[0]
    assert.ok(account)
    assert.equal(isNavItemActive('/settings', account), true)
    assert.equal(isNavItemActive('/settings/roles', account), false)
  })
})
