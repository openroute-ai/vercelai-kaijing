import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export type EditableAsset = {
  id?: string
  name: string
  description: string
  visualNotes?: string
  assetId?: string | null
};

export function DramaAssetCard({
  kindLabel,
  asset,
  previewUrl,
  busy,
  onChange,
  onGenerate,
  onUpload,
  onTurnaround,
}: {
  kindLabel: string
  asset: EditableAsset
  previewUrl: string | null
  busy?: boolean
  onChange: (next: EditableAsset) => void
  onGenerate?: () => void
  onUpload?: (file: File) => void
  onTurnaround?: () => void
}) {
  const status = asset.assetId ? '已有形象' : '待生成';
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="relative aspect-[3/4] bg-white/5">
        {previewUrl ? (
          <img src={previewUrl} alt={`${asset.name || kindLabel}形象`} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-white/40">还没有形象图</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/80">
          {kindLabel} · {status}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <Input
          aria-label={`${kindLabel}名称`}
          value={asset.name}
          onChange={(event) => onChange({ ...asset, name: event.target.value })}
          placeholder={`${kindLabel}名称`}
          className="h-8 border-white/15 bg-black/30 text-sm"
        />
        <Textarea
          aria-label={`${kindLabel}简介`}
          value={asset.description}
          onChange={(event) => onChange({ ...asset, description: event.target.value })}
          placeholder="简介"
          className="min-h-16 border-white/15 bg-black/30 text-sm"
        />
        <Textarea
          aria-label={`${kindLabel}形象说明`}
          value={asset.visualNotes ?? ''}
          onChange={(event) => onChange({ ...asset, visualNotes: event.target.value })}
          placeholder="形象说明，可空"
          className="min-h-14 border-white/15 bg-black/30 text-xs text-white/80"
        />
        <div className="flex flex-wrap gap-2">
          {onGenerate ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onGenerate}>
              {busy ? '生成中…' : asset.assetId ? '重新生成' : '生成形象'}
            </Button>
          ) : null}
          {onUpload ? (
            <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-white/15 px-2.5 text-[0.8rem]">
              上传形象
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(file);
                  event.target.value = '';
                }}
              />
            </label>
          ) : null}
          {onTurnaround ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onTurnaround}>
              记下三视图需求
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
