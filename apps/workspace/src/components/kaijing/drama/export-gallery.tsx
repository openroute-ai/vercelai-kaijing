import { Button } from '@/components/ui/button';

import { assetPreviewUrl } from './workbench-steps';
import type { EditableShot } from './shot-card';

export type EpisodeExportItem = {
  id: string
  title: string
  assetId: string
  publicUrl?: string | null
  shotIds?: string[]
  createdAt?: string | Date | null
};

function exportUrl(projectId: string, item: EpisodeExportItem) {
  return item.publicUrl || assetPreviewUrl(projectId, item.assetId);
}

export function DramaExportGallery({
  projectId,
  shots,
  selectedIds,
  exports = [],
  episodeComplete,
  onToggle,
  onSelectReady,
  onClear,
  onAssembleSelected,
  onExport,
  onExportSelected,
  onMarkComplete,
  exporting,
  hasTimeline,
  assembleComplete,
}: {
  projectId: string
  shots: EditableShot[]
  selectedIds: string[]
  exports?: EpisodeExportItem[]
  episodeComplete?: boolean
  onToggle: (id: string) => void
  onSelectReady: () => void
  onClear: () => void
  onAssembleSelected: () => void
  onExport: () => void
  onExportSelected?: () => void
  onMarkComplete?: (complete: boolean) => void
  exporting?: boolean
  hasTimeline?: boolean
  assembleComplete?: boolean
}) {
  const ready = shots.filter((shot) => shot.status === 'ready' && shot.videoAssetId && shot.id);
  const selectedReady = ready.filter((shot) => shot.id && selectedIds.includes(shot.id));
  const canExportAll = Boolean(assembleComplete || hasTimeline);
  const canExportSelected = selectedReady.length > 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">成片列表</h2>
            <p className="text-sm text-white/55">这里列出已经导出到本机的 MP4，可预览或再次下载。</p>
          </div>
          {onMarkComplete ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onMarkComplete(!episodeComplete)}>
              {episodeComplete ? '取消完成标记' : '标记完成'}
            </Button>
          ) : null}
        </div>
        {exports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-sm text-white/45">
            还没有成片。勾选已生成的镜头，铺进时间线后导出 MP4。
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {exports.map((item, index) => {
              const url = exportUrl(projectId, item);
              return (
                <li key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                  <div className="aspect-video bg-white/5">
                    {url ? (
                      <video src={url} className="size-full object-cover" controls preload="metadata" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xs text-white/35">无法预览</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-sm">{item.title || `成片 ${exports.length - index}`}</p>
                      <p className="text-[11px] text-white/45">
                        {item.shotIds?.length ? `${item.shotIds.length} 镜` : '整集导出'}
                      </p>
                    </div>
                    {url ? (
                      <a className="text-xs underline" href={url} download={`${item.title || '成片'}.mp4`}>
                        下载
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">镜头素材</h2>
          <p className="text-sm text-white/55">
            {ready.length}/{shots.length} 已生成
            {selectedReady.length ? ` · 已选 ${selectedReady.length}` : ''}
            {hasTimeline || assembleComplete ? ' · 时间线已有铺轨' : ' · 尚未铺进时间线'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onSelectReady} disabled={ready.length === 0}>
            勾选已生成
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={selectedIds.length === 0}>
            清空选择
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAssembleSelected}
            disabled={selectedReady.length === 0}
          >
            铺选中镜头
          </Button>
          {onExportSelected ? (
            <Button type="button" size="sm" variant="outline" disabled={exporting || !canExportSelected} onClick={onExportSelected}>
              {exporting ? '正在导出…' : '导出已选镜头'}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={exporting || !canExportAll} onClick={onExport}>
            {exporting ? '正在导出…' : '导出整集 MP4'}
          </Button>
        </div>
      </div>
      {shots.length === 0 ? (
        <p className="text-sm text-white/50">还没有镜头。请先到视频制作里拆分镜并生成真实视频。</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shots.map((shot, index) => {
            const readyShot = Boolean(shot.status === 'ready' && shot.videoAssetId);
            const checked = Boolean(shot.id && selectedIds.includes(shot.id));
            const preview = assetPreviewUrl(projectId, shot.videoAssetId || shot.imageAssetId);
            return (
              <li key={shot.id || index}>
                <label
                  className={`flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-black/25 ${
                    checked ? 'border-orange-400/70' : 'border-white/10'
                  }`}
                >
                  <div className="relative aspect-video bg-white/5">
                    {preview && shot.videoAssetId ? (
                      <video src={preview} className="size-full object-cover" controls preload="metadata" />
                    ) : preview ? (
                      <img src={preview} alt={`第 ${index + 1} 镜`} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xs text-white/35">未生成</div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px]">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="checkbox"
                      className="absolute right-2 top-2 size-4"
                      checked={checked}
                      disabled={!readyShot}
                      onChange={() => shot.id && readyShot && onToggle(shot.id)}
                    />
                  </div>
                  <div className="px-3 py-2 text-sm">
                    <p className="line-clamp-2 text-white/80">{shot.description || `第 ${index + 1} 镜`}</p>
                    <p className="mt-1 text-xs text-white/45">
                      {readyShot ? '可预览' : shot.status === 'failed' ? '生成失败' : '还没有真实视频'}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
