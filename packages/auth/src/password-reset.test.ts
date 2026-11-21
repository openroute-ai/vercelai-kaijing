import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { account, user, verification } from '@workspace/db/schema'
import {
  buildPasswordResetIdentifier,
  createPasswordResetRequest,
  getRealmPasswordProviderIds,
  parsePasswordResetIdentifier,
  resetPasswordWithToken,
  validatePasswordResetToken,
} from './password-reset'

type Row = Record<string, unknown>

type TableName = 'user' | 'account' | 'verification'

type Dataset = Record<TableName, Row[]>

const COLUMN_TO_FIELD: Record<string, string> = {
  id: 'id',
  user_id: 'userId',
  account_id: 'accountId',
  provider_id: 'providerId',
  password: 'password',
  email: 'email',
  name: 'name',
  identifier: 'identifier',
  value: 'value',
  expires_at: 'expiresAt',
}

const CLAUSE_REGEX = /"[^"]+"\."(\w+)"\s*(= \$(\d+)|is not null|in \(([^)]*)\))/g

/** drizzle schema 名 -> 实际 SQL 表名 */
const SQL_TABLE_NAME: Record<TableName, string> = {
  user: 'users',
  account: 'account',
  verification: 'verification',
}

/**
 * 迷你查询引擎：把 drizzle 生成的 SQL 条件渲染成 SQL 文本 + 具名参数，
 * 再对内存数据求值。这样测试能真正验证 where 条件（尤其是 providerId 作用域），
 * 而不仅仅是验证调用次数。
 */
function matchesClause(
  row: Row,
  table: TableName,
  sql: string,
  params: unknown[]
): boolean {
  for (const match of sql.matchAll(CLAUSE_REGEX)) {
    const column = match[1]
    assert.ok(column, `fake db 解析不出列名: ${sql}`)
    const field = COLUMN_TO_FIELD[column]
    assert.ok(field, `fake db 未覆盖列 ${column}`)

    if (match[2] === 'is not null') {
      if (row[field] == null) return false
      continue
    }

    if (match[3]) {
      if (row[field] !== params[Number(match[3]) - 1]) return false
      continue
    }

    const placeholders = [...(match[4] ?? '').matchAll(/\$(\d+)/g)].map(
      (p) => params[Number(p[1]) - 1]
    )
    if (!placeholders.includes(row[field])) return false
  }

  // 确认条件确实作用在预期的表上，避免 where 条件写错表而测试仍然通过
  assert.ok(sql.includes(`"${SQL_TABLE_NAME[table]}"."`), `条件未作用于 ${table} 表: ${sql}`)
  return true
}

function createFakeDb(dataset: Dataset) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const render = (condition: any): { sql: string; params: unknown[] } =>
    new PgDialect().sqlToQuery(condition)

  // 同时支持 `await ....where(cond)` 与 `await ....where(cond).limit(n)`
  const chainable = (compute: (limit?: number) => Promise<Row[]>) => ({
    limit: (count?: number) => compute(count),
    then: (
      onFulfilled: (rows: Row[]) => unknown,
      onRejected: (reason: unknown) => unknown
    ) => compute(undefined).then(onFulfilled, onRejected),
  })

  const matching = (table: TableName, condition: unknown) => {
    const { sql, params } = render(condition)
    return (limit?: number) => {
      const rows = dataset[table].filter((row) => matchesClause(row, table, sql, params))
      return Promise.resolve(limit === undefined ? rows : rows.slice(0, limit))
    }
  }

  return {
    select: () => ({
      from: (table: unknown) => {
        const tableName = tableNameOf(table)
        return {
          where: (condition: never) => chainable(matching(tableName, condition)),
        }
      },
    }),
    update: (table: unknown) => {
      const tableName = tableNameOf(table)
      return {
        set: (values: Row) => ({
          where: async (condition: never) => {
            const { sql, params } = render(condition)
            for (const row of dataset[tableName]) {
              if (matchesClause(row, tableName, sql, params)) Object.assign(row, values)
            }
          },
        }),
      }
    },
    delete: (table: unknown) => {
      const tableName = tableNameOf(table)
      return {
        where: async (condition: never) => {
          const { sql, params } = render(condition)
          dataset[tableName] = dataset[tableName].filter(
            (row) => !matchesClause(row, tableName, sql, params)
          )
        },
      }
    },
    insert: (table: unknown) => {
      const tableName = tableNameOf(table)
      return {
        values: async (values: Row) => {
          dataset[tableName].push(values)
        },
      }
    },
  }
}

function tableNameOf(table: unknown): 'user' | 'account' | 'verification' {
  if (table === user) return 'user'
  if (table === account) return 'account'
  if (table === verification) return 'verification'
  throw new Error('fake db 未覆盖该表')
}

const USER_ID = 'user-1'
const OLD_HASH = 'old-hash'
const RESET_URL_BASE = 'https://cloud.example.com'

/** 同一 userId 在四端都持有密码凭证——这正是跨端改密串联的根因场景。 */
function seedMultiRealmUser(): Dataset {
  return {
    user: [{ id: USER_ID, name: '张三', email: 'shared@example.com' }],
    account: [
      { id: 'acc-cloud-email', userId: USER_ID, providerId: 'cloud-email', password: OLD_HASH },
      {
        id: 'acc-cloud-phone',
        userId: USER_ID,
        providerId: 'cloud-phoneNumber',
        password: OLD_HASH,
      },
      {
        id: 'acc-merchant',
        userId: USER_ID,
        providerId: 'merchant-email',
        password: OLD_HASH,
      },
      { id: 'acc-web', userId: USER_ID, providerId: 'credential', password: OLD_HASH },
      { id: 'acc-google', userId: USER_ID, providerId: 'google', password: null },
    ],
    verification: [],
  }
}

function passwordOf(dataset: Dataset, accountId: string): unknown {
  return dataset.account.find((row) => row.id === accountId)?.password
}

/** 全部凭证的密码快照，用于断言「没有任何凭证被改动」。 */
function passwordSnapshot(dataset: Dataset): Record<string, unknown> {
  return Object.fromEntries(dataset.account.map((row) => [row.id, row.password]))
}

test('找回密码只更新本 realm 的凭证，不波及其他应用', async () => {
  const dataset = seedMultiRealmUser()
  const db = createFakeDb(dataset)

  const request = await createPasswordResetRequest(db, 'shared@example.com', RESET_URL_BASE, 'cloud')
  assert.ok(request)

  const ok = await resetPasswordWithToken(db, request.token, 'new-password', 'cloud')
  assert.equal(ok, true)

  // 本 realm 的两个凭证都已改密
  assert.notEqual(passwordOf(dataset, 'acc-cloud-email'), OLD_HASH)
  assert.notEqual(passwordOf(dataset, 'acc-cloud-phone'), OLD_HASH)

  // 其他应用的凭证保持原样（修复前会全部被改写）
  assert.equal(passwordOf(dataset, 'acc-merchant'), OLD_HASH)
  assert.equal(passwordOf(dataset, 'acc-web'), OLD_HASH)
  // 无密码的社交账号不会被写入密码
  assert.equal(passwordOf(dataset, 'acc-google'), null)
})

test('找回密码令牌绑定签发它的 realm，无法跨端重放', async () => {
  const dataset = seedMultiRealmUser()
  const db = createFakeDb(dataset)

  const cloudRequest = await createPasswordResetRequest(
    db,
    'shared@example.com',
    RESET_URL_BASE,
    'cloud'
  )
  assert.ok(cloudRequest)
  const before = passwordSnapshot(dataset)

  // 拿 cloud 签发的令牌去 merchant 端重置密码：必须失败且不改动任何密码
  const replayed = await resetPasswordWithToken(
    db,
    cloudRequest.token,
    'attacker-password',
    'merchant'
  )
  assert.equal(replayed, false)
  assert.deepEqual(passwordSnapshot(dataset), before)

  // 同一令牌在本 realm 可以正常使用
  assert.equal(await validatePasswordResetToken(db, cloudRequest.token, 'cloud'), USER_ID)
  assert.equal(await validatePasswordResetToken(db, cloudRequest.token, 'supplier'), null)
})

test('用户在本 realm 没有密码凭证时不签发令牌', async () => {
  const dataset = seedMultiRealmUser()
  const db = createFakeDb(dataset)

  // 该用户只有 cloud 凭证，supplier 端找回密码不应发信
  const supplierRequest = await createPasswordResetRequest(
    db,
    'shared@example.com',
    RESET_URL_BASE,
    'supplier'
  )
  assert.equal(supplierRequest, null)
  assert.equal(dataset.verification.length, 0)
})

test('令牌按 realm 分别签发，互不覆盖', async () => {
  const dataset = seedMultiRealmUser()
  const db = createFakeDb(dataset)

  const cloudRequest = await createPasswordResetRequest(
    db,
    'shared@example.com',
    RESET_URL_BASE,
    'cloud'
  )
  const merchantRequest = await createPasswordResetRequest(
    db,
    'shared@example.com',
    RESET_URL_BASE,
    'merchant'
  )
  assert.ok(cloudRequest)
  assert.ok(merchantRequest)
  assert.notEqual(cloudRequest.token, merchantRequest.token)
  assert.equal(dataset.verification.length, 2)

  // 重签同 realm 令牌时只作废该 realm 的旧令牌
  const renewed = await createPasswordResetRequest(
    db,
    'shared@example.com',
    RESET_URL_BASE,
    'cloud'
  )
  assert.ok(renewed)
  assert.equal(dataset.verification.length, 2)
  assert.equal(await validatePasswordResetToken(db, cloudRequest.token, 'cloud'), null)
  assert.ok(await validatePasswordResetToken(db, merchantRequest.token, 'merchant'))
})

test('过期令牌无法重置密码', async () => {
  const dataset = seedMultiRealmUser()
  const db = createFakeDb(dataset)

  const request = await createPasswordResetRequest(db, 'shared@example.com', RESET_URL_BASE, 'cloud')
  assert.ok(request)
  const before = passwordSnapshot(dataset)

  const [tokenRow] = dataset.verification
  assert.ok(tokenRow, '应写入 verification 记录')
  tokenRow.expiresAt = new Date(Date.now() - 1000)

  assert.equal(await resetPasswordWithToken(db, request.token, 'new-password', 'cloud'), false)
  assert.deepEqual(passwordSnapshot(dataset), before)
})

test('未注册的邮箱不签发令牌', async () => {
  const dataset = seedMultiRealmUser()
  const db = createFakeDb(dataset)

  const request = await createPasswordResetRequest(db, 'nobody@example.com', RESET_URL_BASE, 'cloud')
  assert.equal(request, null)
  assert.equal(dataset.verification.length, 0)
})

test('各 realm 的密码凭证互不相交', () => {
  const providerIds = (['cloud', 'merchant', 'supplier', 'web'] as const).map(
    getRealmPasswordProviderIds
  )
  const flattened = providerIds.flat()
  assert.equal(new Set(flattened).size, flattened.length, 'realm 之间的 providerId 存在重叠')
  assert.deepEqual(getRealmPasswordProviderIds('cloud'), ['cloud-email', 'cloud-phoneNumber'])
})

test('令牌标识携带 realm 且能正确解析', () => {
  assert.equal(
    buildPasswordResetIdentifier('supplier', 'user-9'),
    'password-reset:supplier:user-9'
  )

  assert.deepEqual(parsePasswordResetIdentifier('password-reset:merchant:user-9'), {
    realm: 'merchant',
    userId: 'user-9',
  })

  // 旧格式（无 realm）与未知 realm 一律判为非法
  assert.equal(parsePasswordResetIdentifier('password-reset:user-9'), null)
  assert.equal(parsePasswordResetIdentifier('password-reset:unknown:user-9'), null)
  assert.equal(parsePasswordResetIdentifier('password-reset::user-9'), null)
  assert.equal(parsePasswordResetIdentifier('password-reset:merchant:'), null)
  assert.equal(parsePasswordResetIdentifier('other-token:merchant:user-9'), null)
})
