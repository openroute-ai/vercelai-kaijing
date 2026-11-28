import { Button } from '@/components/ui/button';

export type WorkbenchTask = {
  id: string
  kind: string
  label: string
  status: string
  errorMessage?: string | null
  targetKind?: string | null
  targetId?: string | null
  createdAt?: string | Date | null
};

function statusLabel(status: string) {
  if (status === 'succeeded') return '已完成';
  if (status === 'failed') return '失败';
  if (status === 'running') return '进行中';
  return '排队中';
}

export function DramaTaskDrawer({
  open,
  tasks,
  onClose,
  onRetry,
  busy,
}: {
  open: boolean
  tasks: WorkbenchTask[]
  onClose: () => void
  onRetry: (task: WorkbenchTask) => void
  busy?: boolean
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="dialog" aria-label="生成任务">
      <button type="button" className="h-full flex-1" aria-label="关闭任务面板" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-950 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">生成任务</h2>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        <p className="mb-3 text-xs text-white/50">显示本集最近的形象、镜头和对白配音任务。失败后可以重试。</p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {tasks.length === 0 ? (
            <li className="py-8 text-sm text-white/45">还没有生成任务。</li>
          ) : (
            tasks.map((task) => (
              <li key={task.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white/85">{task.label}</p>
                  <span
                    className={`shrink-0 text-[11px] ${
                      task.status === 'failed'
                        ? 'text-amber-200'
                        : task.status === 'succeeded'
                          ? 'text-emerald-200'
                          : 'text-white/50'
                    }`}
                  >
                    {statusLabel(task.status)}
                  </span>
                </div>
                {task.errorMessage ? <p className="mt-1 text-xs text-amber-200">{task.errorMessage}</p> : null}
                {task.status === 'failed' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={busy}
                    onClick={() => onRetry(task)}
                  >
                    重试
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </aside>
    </div>
  );
}
