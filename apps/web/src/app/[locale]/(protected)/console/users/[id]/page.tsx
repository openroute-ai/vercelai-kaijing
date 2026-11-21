'use client'

import * as React from 'react'
import { DetailBackButton } from '@/components/console/detail-back-button'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog'
import { PageDataLoading } from '@/components/shared/data-table'
import { formatOpsTime } from '@/lib/console/format-time'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
const ROLE_LABELS: Record<string, string> = {
  tenant_owner: '组织所有者',
  tenant_admin: '组织管理员',
  tenant_engineer: '组织工程师',
  tenant_viewer: '组织查看者',
  owner: '所有者',
  admin: '管理员',
  member: '成员',
}

export default function PlatformUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const utils = trpc.useUtils()
  const query = trpc.platformUsers.get.useQuery({ id })
  const [reason, setReason] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [banOpen, setBanOpen] = React.useState(false)
  const [unbanOpen, setUnbanOpen] = React.useState(false)

  const ban = trpc.platformUsers.ban.useMutation({
    onSuccess: async (result) => {
      setNotice(`用户已封禁。关联组织 ${result.organizations} 个。`)
      setBanOpen(false)
      await utils.platformUsers.get.invalidate({ id })
      await utils.platformUsers.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const unban = trpc.platformUsers.unban.useMutation({
    onSuccess: async (result) => {
      setNotice(`用户已解封，已通知 ${result.organizations} 个所属组织并写审计。`)
      setUnbanOpen(false)
      await utils.platformUsers.get.invalidate({ id })
      await utils.platformUsers.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return <PageDataLoading />
  }
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">用户不存在。</p>
  }

  const { user, memberships } = query.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <DetailBackButton href="/console/users" />
          <h2 className="text-lg font-medium">{user.name || '未命名用户'}</h2>
          <p className="text-sm text-muted-foreground">
            {user.email}
            {user.phoneNumber ? ` · ${user.phoneNumber}` : ''}
          </p>
        </div>
        <Badge variant={user.banned ? 'destructive' : 'secondary'}>
          {user.banned ? '已封禁' : '正常'}
        </Badge>
      </div>

      <section>
        <h3 className="mb-2 font-medium">账号信息</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">邮箱验证</dt>
            <dd>{user.emailVerified ? '已验证' : '未验证'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">手机验证</dt>
            <dd>{user.phoneVerified ? '已验证' : '未验证'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">注册时间</dt>
            <dd>{formatOpsTime(user.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">最近更新</dt>
            <dd>{formatOpsTime(user.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 font-medium">所属组织（{memberships.length}）</h3>
        {memberships.length ? (
          <div className="space-y-2">
            {memberships.map((membership) => (
              <div
                key={`${membership.organizationId}-${membership.role}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{membership.organizationName}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    {ROLE_LABELS[membership.role] ?? membership.role}
                    {membership.organizationSlug ? ` · ${membership.organizationSlug}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{membership.orgType}</Badge>
                  <Badge variant={membership.entryApproved ? 'default' : 'secondary'}>
                    {membership.entryApproved ? '已启用' : '未启用'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">该用户尚未加入任何组织。</p>
        )}
      </section>

      {user.banned ? (
        <section className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <h3 className="font-medium text-destructive">封禁信息</h3>
          <dl className="text-sm">
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">封禁原因</dt>
              <dd>{user.banReason || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b py-2">
              <dt className="text-muted-foreground">封禁到期</dt>
              <dd>
                {user.banExpires
                  ? `${formatOpsTime(user.banExpires)}（到期后需手动解封或由登录校验自动放行）`
                  : '永久'}
              </dd>
            </div>
          </dl>
          <Button disabled={unban.isPending} onClick={() => setUnbanOpen(true)}>
            解除封禁
          </Button>
        </section>
      ) : (
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">风控操作</h3>
          <p className="text-sm text-muted-foreground">
            封禁后用户立即退出所有会话且无法登录。
          </p>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="封禁原因（必填）"
          />
          <Button
            variant="destructive"
            disabled={ban.isPending}
            onClick={() => {
              if (reason.trim().length < 2) {
                setNotice('请填写至少 2 个字符的封禁原因。')
                return
              }
              setBanOpen(true)
            }}
          >
            封禁用户
          </Button>
        </section>
      )}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <ConfirmActionDialog
        open={unbanOpen}
        onOpenChange={setUnbanOpen}
        title="解除封禁"
        description="确认解封该用户？解封后用户可重新登录。"
        confirmLabel="确认解封"
        pending={unban.isPending}
        onConfirm={() => unban.mutate({ userId: user.id })}
      />
      <ConfirmReasonDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        title="封禁用户"
        description={`确认封禁用户「${user.name || user.email}」？封禁后该用户将立即退出并无法登录。`}
        confirmLabel="确认封禁"
        confirmVariant="destructive"
        placeholder="封禁原因（必填）"
        required
        minLength={2}
        defaultReason={reason}
        pending={ban.isPending}
        onConfirm={(value) => {
          setReason(value)
          ban.mutate({ userId: user.id, reason: value })
        }}
      />
    </div>
  )
}
