import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { assetPreviewUrl, entitiesMentionedInText, type NamedEntity } from './workbench-steps';
import type { EditableShot } from './shot-card';

function statusLabel(status?: string) {
  if (status === 'ready') return '已生成';
  if (status === 'generating') return '生成中';
  if (status === 'failed') return '失败，可重试';
  if (status === 'prompted') return '已有提示词';
  return '草稿';
}

export function DramaVideoStudio({
  projectId,
  aspectRatio,
  shots,
  selectedIndex,
  characters,
  scenes,
  props,
  busy,
  onSelect,
  onChangeShot,
  onAddShot,
  onBreakdown,
  onGenerateShot,
  onGenerateMissing,
}: {
  projectId: string
  aspectRatio: '9:16' | '16:9'
  shots: EditableShot[]
  selectedIndex: number
  characters: NamedEntity[]
  scenes: NamedEntity[]
  props: NamedEntity[]
  busy?: boolean
  onSelect: (index: number) => void
  onChangeShot: (index: number, next: EditableShot) => void
  onAddShot: () => void
  onBreakdown: () => void
  onGenerateShot: (shot: EditableShot) => void
  onGenerateMissing: () => void
}) {
  const shot = shots[selectedIndex];
  const preview = shot ? assetPreviewUrl(projectId, shot.videoAssetId || shot.imageAssetId) : null;
  const mentionText = shot
    ? [shot.description, shot.dialogue, shot.imagePrompt, shot.videoPrompt].filter(Boolean).join('\n')
    : '';
  const relatedCharacters = entitiesMentionedInText(mentionText, characters);
  const relatedScenes = entitiesMentionedInText(mentionText, scenes);
  const relatedProps = entitiesMentionedInText(mentionText, props);
  const readyCount = shots.filter((item) => item.status === 'ready' && item.videoAssetId).length;
  const failedCount = shots.filter((item) => item.status === 'failed').length;

  return (
    <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(16rem,22rem)]">
      <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-sm">
          <strong>分镜列表</strong>
          <span className="text-xs text-white/45">
            {readyCount} 已生成 · {failedCount} 失败 · {shots.length} 镜
          </span>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {shots.length === 0 ? (
            <li className="px-2 py-6 text-sm text-white/45">还没有分镜。完成剧本后可以拆分镜。</li>
          ) : (
            shots.map((item, index) => {
              const thumb = assetPreviewUrl(projectId, item.videoAssetId || item.imageAssetId);
              return (
                <li key={item.id || index}>
                  <button
                    type="button"
                    onClick={() => onSelect(index)}
                    className={`mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm ${
                      index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`shrink-0 overflow-hidden rounded-md bg-white/5 ${
                        aspectRatio === '16:9' ? 'h-10 w-16' : 'h-14 w-9'
                      }`}
                    >
                      {thumb ? (
                        item.videoAssetId ? (
                          <video src={thumb} className="size-full object-cover" muted preload="metadata" />
                        ) : (
                          <img src={thumb} alt="" className="size-full object-cover" />
                        )
                      ) : (
                        <div className="size-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span>第 {index + 1} 镜</span>
                        <span className="text-[11px] text-white/45">{statusLabel(item.status)}</span>
                      </div>
                      <p className="truncate text-xs text-white/50">{item.description || '还没有描述'}</p>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-white/10 p-2">
          <Button type="button" size="sm" variant="outline" onClick={onAddShot}>
            加一镜
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onBreakdown}>
            {shots.length ? '重新拆分' : '拆分镜'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4">
        {!shot ? (
          <p className="text-sm text-white/55">请先拆分镜，或手动加一镜。</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">第 {selectedIndex + 1} 镜</h2>
              <span className="text-xs text-white/50">{statusLabel(shot.status)}</span>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              描述
              <Textarea
                className="min-h-28 border-white/15 bg-black/30"
                value={shot.description}
                onChange={(event) => onChangeShot(selectedIndex, { ...shot, description: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              对白
              <Input
                className="border-white/15 bg-black/30"
                value={shot.dialogue}
                onChange={(event) => onChangeShot(selectedIndex, { ...shot, dialogue: event.target.value })}
                placeholder="对白，可空"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-white/70">
              时长（毫秒）
              <Input
                type="number"
                min={1}
                className="h-8 w-28 border-white/15 bg-black/30"
                value={shot.durationMs}
                onChange={(event) =>
                  onChangeShot(selectedIndex, { ...shot, durationMs: Number(event.target.value) })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              画面提示词
              <Textarea
                className="min-h-16 border-white/15 bg-black/30 text-sm"
                value={shot.imagePrompt ?? ''}
                onChange={(event) => onChangeShot(selectedIndex, { ...shot, imagePrompt: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              视频提示词
              <Textarea
                className="min-h-20 border-white/15 bg-black/30 text-sm"
                value={shot.videoPrompt ?? ''}
                onChange={(event) => onChangeShot(selectedIndex, { ...shot, videoPrompt: event.target.value })}
              />
            </label>
            <div className="text-sm">
              <p className="mb-1 text-white/70">这一镜提到的角色与场景</p>
              <p className="text-xs leading-5 text-white/45">
                仅按名称是否出现在描述、对白或提示词里展示，不是强制绑定。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {relatedCharacters.length + relatedScenes.length + relatedProps.length === 0 ? (
                  <span className="text-xs text-white/40">还没有识别到已有资产名称。</span>
                ) : (
                  <>
                    {relatedCharacters.map((item) => (
                      <span key={`c-${item.id || item.name}`} className="rounded-full bg-white/10 px-2 py-1 text-xs">
                        角色 · {item.name}
                        {item.assetId ? '' : '（无形象）'}
                      </span>
                    ))}
                    {relatedScenes.map((item) => (
                      <span key={`s-${item.id || item.name}`} className="rounded-full bg-white/10 px-2 py-1 text-xs">
                        场景 · {item.name}
                      </span>
                    ))}
                    {relatedProps.map((item) => (
                      <span key={`p-${item.id || item.name}`} className="rounded-full bg-white/10 px-2 py-1 text-xs">
                        道具 · {item.name}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
            {shot.errorMessage ? <p className="text-xs text-amber-200">{shot.errorMessage}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy || !shot.id} onClick={() => onGenerateShot(shot)}>
                {shot.status === 'failed' ? '重试这一镜' : '生成这一镜'}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onGenerateMissing}>
                生成未完成镜头
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20 p-3">
        <p className="mb-2 text-sm text-white/70">预览</p>
        <div
          className={`overflow-hidden rounded-xl bg-white/5 ${
            aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16] max-h-[28rem]'
          }`}
        >
          {preview && shot?.videoAssetId ? (
            <video src={preview} className="size-full object-cover" controls preload="metadata" />
          ) : preview ? (
            <img src={preview} alt="镜头预览" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-white/40">还没有镜头预览</div>
          )}
        </div>
      </div>
    </section>
  );
}
