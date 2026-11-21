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

export default function GenerationJobsPage() {
  const query = trpc.generationJobs.list.useQuery({ page: 1, pageSize: 20 })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">生成任务</h2>
        <p className="text-muted-foreground text-sm">
          网关记下的任务元数据。M0 的供应商适配器是占位实现，不会真正出图或出视频。
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>供应商</TableHead>
            <TableHead>提示词</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data?.items.length ? (
            query.data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatOpsTime(row.createdAt)}</TableCell>
                <TableCell>{row.kind}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.provider}</TableCell>
                <TableCell className="max-w-md truncate">{row.prompt}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                {query.error?.message ?? '还没有生成任务。'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
