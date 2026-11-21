export const APP_ORGANIZATION_TYPE = {
  cloud: 'tenant',
  merchant: 'merchant',
  supplier: 'supplier',
  web: 'platform',
} as const

export type RealmName = keyof typeof APP_ORGANIZATION_TYPE
export type RealmOrganizationType =
  (typeof APP_ORGANIZATION_TYPE)[RealmName]

export type RealmOrganizationCandidate = {
  organizationId: string
  organization: {
    orgType: string
  }
}

export function selectRealmOrganization<T extends RealmOrganizationCandidate>(
  candidates: T[],
  realm: RealmName,
  preferredOrganizationId?: string | null
): T | null {
  const expectedOrgType = APP_ORGANIZATION_TYPE[realm]
  const matchingCandidates = candidates.filter(
    (candidate) => candidate.organization.orgType === expectedOrgType
  )

  if (preferredOrganizationId) {
    const preferredCandidate = matchingCandidates.find(
      (candidate) => candidate.organizationId === preferredOrganizationId
    )
    if (preferredCandidate) return preferredCandidate
  }

  return matchingCandidates[0] ?? null
}

export function getOrganizationTypeFieldConfig<T extends RealmName>(realm: T) {
  return {
    type: 'string',
    required: true,
    input: false,
    defaultValue: APP_ORGANIZATION_TYPE[realm],
  } as const
}
