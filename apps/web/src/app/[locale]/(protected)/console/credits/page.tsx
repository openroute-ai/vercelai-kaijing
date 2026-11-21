'use client'

import { trpc } from '@/lib/trpc/client'
import { formatOpsTime } from '@/lib/console/format-time'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function CreditsPage() {
  const accounts = trpc.credits.listAccounts.useQuery({ page: 1, pageSize: 20 })
  const ledger = trpc.credits.listLedger.useQuery({ page: 1, pageSize: 20 })

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-medium">积分</h2>
        <p className="text-muted-foreground text-sm">
          账户余额和流水。M0 没有充值、预扣或支付，表为空是正常状态。
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">账户（{accounts.data?.total ?? '…'}）</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>余额</TableHead>
              <TableHead>更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.data?.items.length ? (
              accounts.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.userId}</TableCell>
                  <TableCell>{row.balance}</TableCell>
                  <TableCell>{formatOpsTime(row.updatedAt)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  {accounts.error?.message ?? '还没有积分账户。'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">流水（{ledger.data?.total ?? '…'}）</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>原因</TableHead>
              <TableHead>变动</TableHead>
              <TableHead>任务</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.data?.items.length ? (
              ledger.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatOpsTime(row.createdAt)}</TableCell>
                  <TableCell>{row.reason}</TableCell>
                  <TableCell>{row.delta}</TableCell>
                  <TableCell className="font-mono text-xs">{row.generationJobId ?? '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {ledger.error?.message ?? '还没有积分流水。'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
