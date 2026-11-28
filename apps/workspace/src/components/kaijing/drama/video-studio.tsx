import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { mentionCatalogFromLists, PromptMentionField } from './prompt-mentions';
import { mentionReferenceIds, parseMentions } from './mentions';
import { assetPreviewUrl } from './workbench-steps';
import type { EditableShot } from './shot-card';
import type { EditableAsset } from './asset-card';

function statusLabel(status?: string) {
  if (status === 'ready') return '已生成';
  if (status === 'generating') return '生成中';
  if (status === 'failed') return '失败，可重试';
  if (status === 'prompted') return '已有提示词';
  return '草稿';
}

export type StoryboardVersion = {
  id: string
  title: string
  current?: boolean
  createdAt?: string | Date | null
};

export function DramaVideoStudio({
  projectId,
  aspectRatio,
  shots,
  selectedIndex,
  characters,
  scenes,
  props,
  storyboards,
  busy,
  onSelect,
  onChangeShot,
  onAddShot,
  onBreakdown,
  onGenerateShot,
  onGenerateMissing,
  onGenerateVoice,
  onUploadShot,
  onSwitchStoryboard,
}: {
  projectId: string
  aspectRatio: '9:16' | '16:9'
  shots: EditableShot[]
  selectedIndex: number
  characters: EditableAsset[]
  scenes: EditableAsset[]
  props: EditableAsset[]
  storyboards?: StoryboardVersion[]
  busy?: boolean
  onSelect: (index: number) => void
  onChangeShot: (index: number, next: EditableShot) => void
  onAddShot: () => void
  onBreakdown: () => void
  onGenerateShot: (shot: EditableShot) => void
  onGenerateMissing: () => void
  onGenerateVoice?: (shot: EditableShot) => void
  onUploadShot?: (shot: EditableShot, file: File) => void
  onSwitchStoryboard?: (storyboardId: string) => void
}) {
  const shot = shots[selectedIndex];
  const preview = shot ? assetPreviewUrl(projectId, shot.videoAssetId || shot.imageAssetId) : null;
  const audioUrl = shot ? assetPreviewUrl(projectId, shot.audioAssetId) : null;
  const catalog = mentionCatalogFromLists({ characters, scenes, props });
  const readyCount = shots.filter((item) => item.status === 'ready' && item.videoAssetId).length;
  const failedCount = shots.filter((item) => item.status === 'failed').length;

  function applyPrompt(field: 'imagePrompt' | 'videoPrompt', next: string) {
    if (!shot) return;
    const mentions = parseMentions(`${next}\n${field === 'imagePrompt' ? shot.videoPrompt ?? '' : shot.imagePrompt ?? ''}\n${shot.description}`, catalog);
    onChangeShot(selectedIndex, {
      ...shot,
      [field]: next,
      referenceAssetIds: mentionReferenceIds(mentions),
    });
  }

  return (
    <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(16rem,22rem)]">
      <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/20">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-sm">
          <strong>分镜列表</strong>
          <span className="text-xs text-white/45">
            {readyCount} 已生成 · {failedCount} 失败 · {shots.length} 镜
          </span>
        </div>
        {storyboards && storyboards.length > 0 && onSwitchStoryboard ? (
          <label className="border-b border-white/10 px-3 py-2 text-xs text-white/60">
            分镜版本
            <select
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
              value={storyboards.find((item) => item.current)?.id || ''}
              onChange={(event) => event.target.value && onSwitchStoryboard(event.target.value)}
            >
              {storyboards.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {(item.title || '分镜') + (item.current ? '（当前）' : '')} · 第 {storyboards.length - index} 版
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
            <PromptMentionField
              label="画面提示词"
              value={shot.imagePrompt ?? ''}
              catalog={catalog}
              className="min-h-16 border-white/15 bg-black/30 text-sm"
              onChange={(next) => applyPrompt('imagePrompt', next)}
            />
            <PromptMentionField
              label="视频提示词"
              value={shot.videoPrompt ?? ''}
              catalog={catalog}
              className="min-h-20 border-white/15 bg-black/30 text-sm"
              placeholder="输入 @ 绑定角色或场景"
              onChange={(next) => applyPrompt('videoPrompt', next)}
            />
            {shot.errorMessage ? <p className="text-xs text-amber-200">{shot.errorMessage}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy || !shot.id} onClick={() => onGenerateShot(shot)}>
                {shot.status === 'failed' ? '重试这一镜' : '生成这一镜'}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onGenerateMissing}>
                生成未完成镜头
              </Button>
              {onGenerateVoice ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !shot.id || !shot.dialogue.trim()}
                  onClick={() => onGenerateVoice(shot)}
                >
                  {shot.audioAssetId ? '重新配音' : '生成对白配音'}
                </Button>
              ) : null}
              {onUploadShot && shot.id ? (
                <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-white/15 px-2.5 text-[0.8rem]">
                  上传镜头视频
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onUploadShot(shot, file);
                      event.target.value = '';
                    }}
                  />
                </label>
              ) : null}
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
        {audioUrl ? (
          <div className="mt-3">
            <p className="mb-1 text-xs text-white/55">对白配音</p>
            <audio src={audioUrl} controls className="w-full" preload="metadata" />
          </div>
        ) : shot?.dialogue ? (
          <p className="mt-3 text-xs text-white/40">有对白，但还没有配音。</p>
        ) : null}
      </div>
    </section>
  );
}
