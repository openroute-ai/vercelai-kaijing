'use client'

import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'

export default function CloudOverviewPage() {
  const accounts = trpc.credits.listAccounts.useQuery({ page: 1, pageSize: 1 })
  const jobs = trpc.generationJobs.list.useQuery({ page: 1, pageSize: 1 })

  const cards = [
    {
      key: 'accounts',
      label: '积分账户',
      value: accounts.data?.total,
      href: '/console/credits',
      error: accounts.error?.message,
    },
    {
      key: 'jobs',
      label: '生成任务',
      value: jobs.data?.total,
      href: '/console/generation-jobs',
      error: jobs.error?.message,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">薄云总览</h2>
        <p className="text-muted-foreground text-sm">
          开镜一期的云端只保存账户、积分和生成任务元数据。短剧项目、画布和成片留在桌面客户端。
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-3xl font-semibold tabular-nums">
                {card.error ? '—' : (card.value ?? '…')}
              </p>
              {card.error ? (
                <p className="text-destructive text-sm">{card.error}</p>
              ) : (
                <LocaleLink className="text-sm underline" href={card.href}>
                  查看列表
                </LocaleLink>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
