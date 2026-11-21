'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { NativeSelect } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'


const ROLE_LABELS: Record<string, string> = {
  tenant_owner: '组织所有者',
  tenant_admin: '组织管理员',
  tenant_engineer: '组织工程师',
  tenant_viewer: '组织查看者',
  owner: '所有者',
  admin: '管理员',
  member: '成员',
}

export default function CrossborderUsersPage() {
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'active' | 'banned'>('all')
  const query = trpc.platformUsers.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">用户管理</h2>
          <p className="text-sm text-muted-foreground">
            租户侧用户总览（平台管理员在独立体系，不在此列）；封禁/解封为风控操作，会写审计并通知所属组织。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setPage(1)
            }}
            placeholder="搜索姓名 / 邮箱 / 手机号"
            className="w-64"
          />
          <NativeSelect
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'all' | 'active' | 'banned')
              setPage(1)
            }}
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">用户总数</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data?.summary.total ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">已加入组织</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data?.summary.tenantMembers ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">已封禁</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data?.summary.banned ?? '—'}
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用户</TableHead>
            <TableHead>联系方式</TableHead>
            <TableHead>所属组织</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>注册时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableLoadingRow colSpan={6} />
          ) : query.isError ? (
            <TableErrorRow
              colSpan={6}
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          ) : data?.items.length ? (
            data.items.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <LocaleLink
                    className="font-medium underline-offset-2 hover:underline"
                    href={`/console/users/${user.id}`}
                  >
                    {user.name || '未命名用户'}
                  </LocaleLink>
                </TableCell>
                <TableCell className="text-xs">
                  <div>{user.email}</div>
                  <div className="text-muted-foreground">
                    {user.phoneNumber || '—'}
                    {user.emailVerified ? ' · 邮箱已验证' : ''}
                    {user.phoneVerified ? ' · 手机已验证' : ''}
                  </div>
                </TableCell>
                <TableCell>
                  {user.memberships.length ? (
                    <div className="space-y-1">
                      {user.memberships.slice(0, 2).map((membership, index) => (
                        <div key={index} className="text-sm">
                          {membership.organizationName}
                          <span className="text-muted-foreground text-xs">
                            {' '}
                            {ROLE_LABELS[membership.role] ?? membership.role}
                          </span>
                        </div>
                      ))}
                      {user.memberships.length > 2 ? (
                        <div className="text-muted-foreground text-xs">
                          等 {user.memberships.length} 个组织
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">未加入组织</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={user.banned ? 'destructive' : 'secondary'}>
                    {user.banned ? '已封禁' : '正常'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {new Date(user.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <LocaleLink href={`/console/users/${user.id}`}>详情</LocaleLink>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={6}>暂无用户。</TableEmptyRow>
          )}
        </TableBody>
      </Table>

      <ListPagination
        page={page}
        totalPages={pageCount}
        totalItems={data?.total ?? 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  )
}
