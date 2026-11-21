import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapLegacyPlatformPath } from './legacy-paths'

describe('mapLegacyPlatformPath', () => {
  it('maps old crossborder paths back to the console overview', () => {
    assert.equal(mapLegacyPlatformPath('/crossborder'), '/console')
    assert.equal(mapLegacyPlatformPath('/crossborder/tenants'), '/console')
    assert.equal(mapLegacyPlatformPath('/crossborder/shops/abc'), '/console')
  })

  it('maps old console settings aliases', () => {
    assert.equal(mapLegacyPlatformPath('/console/platform-config'), '/settings/platform-config')
    assert.equal(mapLegacyPlatformPath('/console/audit-logs'), '/settings/audit-logs')
    assert.equal(mapLegacyPlatformPath('/console/announcements'), '/settings/announcements')
    assert.equal(mapLegacyPlatformPath('/console/roles'), '/settings/roles')
  })

  it('leaves current paths unchanged', () => {
    assert.equal(mapLegacyPlatformPath('/console'), null)
    assert.equal(mapLegacyPlatformPath('/console/users/abc'), null)
    assert.equal(mapLegacyPlatformPath('/settings/platform-config'), null)
  })
})
