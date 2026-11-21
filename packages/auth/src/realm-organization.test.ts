import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  APP_ORGANIZATION_TYPE,
  getOrganizationTypeFieldConfig,
  selectRealmOrganization,
} from './realm-organization'

test('selects the organization type required by the login app', () => {
  const merchant = {
    organizationId: 'merchant-org',
    organization: { orgType: 'merchant' },
  }
  const tenant = {
    organizationId: 'tenant-org',
    organization: { orgType: 'tenant' },
  }

  assert.equal(
    selectRealmOrganization([merchant, tenant], 'cloud')?.organizationId,
    tenant.organizationId
  )
  assert.equal(
    selectRealmOrganization([tenant, merchant], 'merchant')?.organizationId,
    merchant.organizationId
  )
})

test('does not accept an active organization from another realm', () => {
  const platform = {
    organizationId: 'platform-org',
    organization: { orgType: 'platform' },
  }
  const supplier = {
    organizationId: 'supplier-org',
    organization: { orgType: 'supplier' },
  }

  assert.equal(
    selectRealmOrganization([platform, supplier], 'supplier', platform.organizationId)
      ?.organizationId,
    supplier.organizationId
  )
})

test('locks the organization type field to the app default', () => {
  for (const [app, orgType] of Object.entries(APP_ORGANIZATION_TYPE)) {
    const field = getOrganizationTypeFieldConfig(app as keyof typeof APP_ORGANIZATION_TYPE)

    assert.equal(field.type, 'string')
    assert.equal(field.required, true)
    assert.equal(field.input, false)
    assert.equal(field.defaultValue, orgType)
  }
})
