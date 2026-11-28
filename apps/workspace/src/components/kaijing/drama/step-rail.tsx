import { Button } from '@/components/ui/button';

import {
  adjacentStep,
  WORKBENCH_STEPS,
  type WorkbenchStepId,
} from './workbench-steps';

export function DramaStepRail({
  current,
  onSelect,
}: {
  current: WorkbenchStepId
  onSelect: (id: WorkbenchStepId) => void
}) {
  const previous = adjacentStep(current, -1);
  const next = adjacentStep(current, 1);

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {WORKBENCH_STEPS.map((step, index) => {
          const active = step.id === current;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className={`flex w-full flex-col rounded-xl border px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/10 bg-black/20 text-white/70 hover:border-white/25'
                }`}
              >
                <span className="text-[11px] tracking-wide text-white/45">{index + 1}</span>
                <span className="font-medium">{step.label}</span>
                <span className="mt-0.5 text-xs text-white/45">{step.hint}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!previous}
          onClick={() => previous && onSelect(previous)}
        >
          上一步
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!next}
          onClick={() => next && onSelect(next)}
        >
          下一步
        </Button>
      </div>
    </div>
  );
}
