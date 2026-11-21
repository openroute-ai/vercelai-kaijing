import { Search } from 'lucide-react'

export function SiteHeaderSearch() {
  return (
    <div
      className="text-muted-foreground bg-muted/40 hidden h-8 w-56 items-center gap-2 rounded-md border px-2.5 text-sm md:flex"
      aria-disabled
      title="全局搜索即将上线"
    >
      <Search className="size-4 shrink-0" />
      <span className="truncate">搜索用户、任务…</span>
      <kbd className="bg-background ml-auto rounded border px-1.5 py-0.5 text-[10px]">
        ⌘K
      </kbd>
    </div>
  )
}
