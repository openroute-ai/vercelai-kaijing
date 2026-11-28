import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type EditableShot = {
  id?: string
  index?: number
  description: string
  dialogue: string
  durationMs: number
  status?: string
  imagePrompt?: string | null
  videoPrompt?: string | null
  imageAssetId?: string | null
  videoAssetId?: string | null
  audioAssetId?: string | null
  referenceAssetIds?: string[]
  errorMessage?: string | null
};

function statusLabel(status?: string) {
  if (status === 'ready') return '已生成';
  if (status === 'generating') return '生成中';
  if (status === 'failed') return '失败，可重试';
  return '草稿';
}

export function DramaShotCard({
  index,
  shot,
  previewUrl,
  aspectRatio,
  onChange,
}: {
  index: number
  shot: EditableShot
  previewUrl: string | null
  aspectRatio: '9:16' | '16:9'
  onChange: (next: EditableShot) => void
}) {
  return (
    <article className="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 md:grid-cols-[minmax(0,9rem)_1fr]">
      <div
        className={`relative overflow-hidden rounded-xl bg-white/5 ${
          aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'
        }`}
      >
        {previewUrl ? (
          shot.videoAssetId ? (
            <video src={previewUrl} className="size-full object-cover" controls preload="metadata" />
          ) : (
            <img src={previewUrl} alt={`第 ${index + 1} 镜预览`} className="size-full object-cover" />
          )
        ) : (
          <div className="flex size-full items-center justify-center px-2 text-center text-xs text-white/40">
            还没有镜头预览
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-sm">
          <strong>第 {index + 1} 镜</strong>
          <span className="text-xs text-white/50">{statusLabel(shot.status)}</span>
        </div>
        <Textarea
          aria-label={`第 ${index + 1} 镜描述`}
          value={shot.description}
          onChange={(event) => onChange({ ...shot, description: event.target.value })}
          placeholder="这一镜发生什么"
          className="min-h-16 border-white/15 bg-black/30 text-sm"
        />
        <Input
          aria-label={`第 ${index + 1} 镜对白`}
          value={shot.dialogue}
          onChange={(event) => onChange({ ...shot, dialogue: event.target.value })}
          placeholder="对白，可空"
          className="h-8 border-white/15 bg-black/30 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-white/55">
          时长（毫秒）
          <Input
            type="number"
            min={1}
            value={shot.durationMs}
            onChange={(event) => onChange({ ...shot, durationMs: Number(event.target.value) })}
            className="h-8 w-28 border-white/15 bg-black/30"
          />
        </label>
        {shot.errorMessage ? <p className="text-xs leading-5 text-amber-200">{shot.errorMessage}</p> : null}
      </div>
    </article>
  );
}
