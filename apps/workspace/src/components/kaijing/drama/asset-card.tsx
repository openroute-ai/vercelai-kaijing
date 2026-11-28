import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
  onChange,
}: {
  kindLabel: string
  asset: EditableAsset
  previewUrl: string | null
  onChange: (next: EditableAsset) => void
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <div className="relative aspect-[3/4] bg-white/5">
        {previewUrl ? (
          <img src={previewUrl} alt={`${asset.name || kindLabel}形象`} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-white/40">
            还没有形象图
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/80">
          {kindLabel}
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
      </div>
    </article>
  );
}
