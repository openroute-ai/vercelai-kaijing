import {
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  FileText,
  Images,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Scissors,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  adjacentStep,
  sectionOf,
  sectionProgress,
  WORKBENCH_SECTIONS,
  type WorkbenchDraftLike,
  type WorkbenchStepId,
} from './workbench-steps';

const STEP_ICON: Record<WorkbenchStepId, typeof FileText> = {
  raw: FileText,
  rewrite: PenLine,
  assets: Images,
  videos: Clapperboard,
  export: Scissors,
};

export function DramaStageNav({
  current,
  draft,
  collapsed,
  onCollapsedChange,
  onSelect,
}: {
  current: WorkbenchStepId
  draft: WorkbenchDraftLike | null
  collapsed: boolean
  onCollapsedChange: (value: boolean) => void
  onSelect: (id: WorkbenchStepId) => void
}) {
  const previous = adjacentStep(current, -1);
  const next = adjacentStep(current, 1);
  const currentMeta = sectionOf(current);
  const currentItem = currentMeta.items.find((item) => item.id === current);
  const completed = WORKBENCH_SECTIONS.filter(
    (section) => sectionProgress(section.id, draft, current) === 'done'
  ).length;

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-white/10 bg-black/25 ${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {WORKBENCH_SECTIONS.map((section) => {
          const state = sectionProgress(section.id, draft, current);
          return (
            <div key={section.id} className="mb-4">
              {collapsed ? (
                <div className="mb-1 flex justify-center">
                  <span
                    className={`size-1.5 rounded-full ${
                      state === 'done' ? 'bg-emerald-400' : state === 'active' ? 'bg-orange-400' : 'bg-white/25'
                    }`}
                  />
                </div>
              ) : (
                <div className="mb-1.5 flex items-center gap-2 px-2 text-[11px] tracking-wide text-white/45">
                  <span
                    className={`size-1.5 rounded-full ${
                      state === 'done' ? 'bg-emerald-400' : state === 'active' ? 'bg-orange-400' : 'bg-white/25'
                    }`}
                  />
                  <span>{section.label}</span>
                  {state === 'active' ? <span className="ml-auto text-orange-300">进行中</span> : null}
                  {state === 'done' ? <span className="ml-auto text-emerald-300">已完成</span> : null}
                </div>
              )}
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const active = item.id === current;
                  const Icon = STEP_ICON[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={item.label}
                        onClick={() => onSelect(item.id)}
                        className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition ${
                          active
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:bg-white/5 hover:text-white'
                        } ${collapsed ? 'justify-center' : ''}`}
                      >
                        <Icon className="size-4 shrink-0" />
                        {collapsed ? null : <span>{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-2">
        <div className={`mb-2 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-2`}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-label={collapsed ? '展开阶段导航' : '收起阶段导航'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {collapsed ? null : <span className="ml-1">收起</span>}
          </Button>
        </div>
        {collapsed ? null : (
          <div className="mb-2 px-1">
            <p className="text-[11px] text-white/45">
              {currentMeta.label} · {currentItem?.label}
            </p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-orange-400"
                style={{ width: `${(completed / WORKBENCH_SECTIONS.length) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-white/40">
              {completed}/{WORKBENCH_SECTIONS.length} 阶段
            </p>
          </div>
        )}
        <div className={`flex ${collapsed ? 'flex-col' : ''} gap-1`}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!previous}
            onClick={() => previous && onSelect(previous)}
          >
            <ChevronLeft className="size-4" />
            {collapsed ? null : '上一步'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!next}
            onClick={() => next && onSelect(next)}
          >
            {collapsed ? null : '下一步'}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
