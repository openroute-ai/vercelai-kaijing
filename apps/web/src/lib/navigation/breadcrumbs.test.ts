import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getSiteBreadcrumbTrail } from './breadcrumbs'

describe('getSiteBreadcrumbTrail', () => {
  it('marks console detail routes under their list page', () => {
    const trail = getSiteBreadcrumbTrail('/console/users/u1')
    assert.deepEqual(
      trail.map((item) => item.label),
      ['开镜控制台', '用户', '详情'],
    )
    assert.equal(trail[0]?.href, '/console')
  })

  it('separates account settings from the thin-cloud note', () => {
    assert.deepEqual(
      getSiteBreadcrumbTrail('/settings').map((item) => item.label),
      ['设置', '账号设置'],
    )
    assert.deepEqual(
      getSiteBreadcrumbTrail('/settings/platform-config').map((item) => item.label),
      ['设置', '薄云说明'],
    )
  })
})
