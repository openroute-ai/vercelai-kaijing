import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { DramaAssetCard, type EditableAsset } from '@/components/kaijing/drama/asset-card';
import { DramaExportGallery } from '@/components/kaijing/drama/export-gallery';
import { DramaStageNav } from '@/components/kaijing/drama/stage-nav';
import { type EditableShot } from '@/components/kaijing/drama/shot-card';
import { DramaVideoStudio } from '@/components/kaijing/drama/video-studio';
import {
  inferWorkbenchStep,
  type WorkbenchStepId,
} from '@/components/kaijing/drama/workbench-steps';
import { ProjectPackageBar } from '@/components/kaijing/project-package-bar';
import { BeatApiProductShell } from '@/components/marketing/beatapi-product-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { selectEpisodeExportDocument } from '@/core/drama/assemble-plan';
import { exportTimelineMp4, inspectLocalMedia, saveBlobToUserChoice } from '@/core/editor/media-export';
import type { TimelineDocument } from '@/core/editor/timeline-document';
import { uploadLocalProjectAsset } from '@/core/workspace-lib/app/local-project-asset-client';
import { apiJsonGet, apiJsonPost } from '@/lib/api-client';
import { getLocale } from '@/core/workspace-lib/shims/next-intl-server';
import {
  balanceNumber,
  fetchCloudSession,
  formatCredits,
  type KaijingSession,
} from '@/lib/kaijing-session';

export const Route = createFileRoute('/drama/$projectId')({
  loader: () => ({ locale: getLocale() }),
  component: DramaEditorPage,
});

type StepState = { id: string; label: string; state: string; detail: string };

type Draft = {
  settings?: {
    quality: string;
    aspectRatio: '9:16' | '16:9';
    aspectRatioLocked: boolean;
    cloudBackupStatus: string;
  };
  script: {
    title: string;
    sourceKind: string;
    sourceText: string;
    body: string;
    revision: number;
  } | null;
  storyboard: { id?: string; title: string; shots: EditableShot[] } | null;
  characters?: EditableAsset[];
  scenes?: EditableAsset[];
  props?: EditableAsset[];
};

function emptyShot(): EditableShot {
  return { description: '', dialogue: '', durationMs: 4000, status: 'draft' };
}

function emptyAsset(): EditableAsset {
  return { name: '', description: '', visualNotes: '' };
}

function DramaEditorPage() {
  const { locale } = Route.useLoaderData();
  const { projectId } = Route.useParams();
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState('one_liner');
  const [sourceText, setSourceText] = useState('');
  const [body, setBody] = useState('');
  const [boardTitle, setBoardTitle] = useState('分镜');
  const [shots, setShots] = useState<EditableShot[]>([]);
  const [quality, setQuality] = useState('standard');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [locked, setLocked] = useState(false);
  const [backup, setBackup] = useState('local');
  const [revision, setRevision] = useState<number | null>(null);
  const [status, setStatus] = useState('正在读取本机稿…');
  const [missing, setMissing] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [runMessage, setRunMessage] = useState('');
  const [session, setSession] = useState<KaijingSession | null>(null);
  const [characters, setCharacters] = useState<EditableAsset[]>([]);
  const [scenes, setScenes] = useState<EditableAsset[]>([]);
  const [props, setProps] = useState<EditableAsset[]>([]);
  const [storageMessage, setStorageMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState<WorkbenchStepId>('raw');
  const [hasTimeline, setHasTimeline] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyEntity, setBusyEntity] = useState<string | null>(null);
  const [selectedShot, setSelectedShot] = useState(0);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);

  function applyDraft(draft: Draft, options?: { keepStep?: boolean }) {
    if (draft.settings) {
      setQuality(draft.settings.quality || 'standard');
      setAspectRatio(draft.settings.aspectRatio || '9:16');
      setLocked(draft.settings.aspectRatioLocked);
      setBackup(draft.settings.cloudBackupStatus || 'local');
    }
    if (draft.script) {
      setTitle(draft.script.title);
      setSourceKind(draft.script.sourceKind);
      setSourceText(draft.script.sourceText);
      setBody(draft.script.body);
      setRevision(draft.script.revision);
    }
    if (draft.storyboard) {
      setBoardTitle(draft.storyboard.title || '分镜');
      setShots(draft.storyboard.shots);
    }
    setCharacters(draft.characters ?? []);
    setScenes(draft.scenes ?? []);
    setProps(draft.props ?? []);
    if (!options?.keepStep) {
      setStep(
        inferWorkbenchStep({
          script: draft.script,
          characters: draft.characters,
          scenes: draft.scenes,
          props: draft.props,
          storyboard: draft.storyboard,
        })
      );
    }
  }

  async function load() {
    setStatus('正在读取本机稿…');
    try {
      const data = await apiJsonGet<{
        draft: Draft | null
        steps?: StepState[]
        storage?: { message?: string }
      }>(`/api/app/projects/${projectId}/drama`);
      if (!data.draft) {
        setMissing(true);
        setStatus('找不到项目。');
        return;
      }
      applyDraft(data.draft);
      if (data.steps?.length) setSteps(data.steps);
      if (data.storage?.message) setStorageMessage(data.storage.message);
      setStatus(
        data.draft.script
          ? `已打开第 ${data.draft.script.revision} 稿。稿件在这台电脑上。`
          : '还没有剧本，写下后保存到这台电脑'
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取失败');
    }
  }

  useEffect(() => {
    void load();
    void fetchCloudSession().then((result) => setSession(result.session));
    void apiJsonGet<{ timeline: { document: TimelineDocument } | null }>(
      `/api/app/projects/${projectId}/timeline`
    )
      .then((payload) => setHasTimeline(Boolean(payload.timeline?.document)))
      .catch(() => setHasTimeline(false));
  }, [projectId]);

  const workbenchPayload = useMemo(
    () => ({
      action: 'save-workbench',
      quality,
      aspectRatio,
      script: { title, sourceKind, sourceText, body },
      storyboard: {
        title: boardTitle,
        shots: shots.map((shot, index) => ({
          id: shot.id,
          index,
          description: shot.description,
          dialogue: shot.dialogue,
          durationMs: shot.durationMs,
          imagePrompt: shot.imagePrompt,
          videoPrompt: shot.videoPrompt,
        })),
      },
      characters,
      scenes,
      props,
    }),
    [aspectRatio, boardTitle, body, characters, props, quality, scenes, shots, sourceKind, sourceText, title]
  );

  const draftLike = {
    script: { sourceText, body },
    characters,
    scenes,
    props,
    storyboard: { shots },
  };

  async function save(event?: FormEvent, options?: { silent?: boolean }) {
    event?.preventDefault();
    if (!options?.silent) setStatus('正在保存…');
    try {
      const data = await apiJsonPost<{ draft: Draft }>(
        `/api/app/projects/${projectId}/drama`,
        workbenchPayload
      );
      if (data.draft) applyDraft(data.draft, { keepStep: true });
      if (!options?.silent) setStatus(`已保存第 ${data.draft?.script?.revision ?? ''} 稿`);
      return data.draft;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
      return null;
    }
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}, nextStep?: WorkbenchStepId) {
    setBusy(true);
    setRunMessage('正在处理…');
    try {
      await apiJsonPost(`/api/app/projects/${projectId}/drama`, workbenchPayload);
      const data = await apiJsonPost<{ draft?: Draft; message?: string; steps?: StepState[]; error?: string }>(
        `/api/app/projects/${projectId}/drama`,
        { action, ...payload }
      );
      if (data.draft) applyDraft(data.draft, { keepStep: true });
      if (data.steps?.length) setSteps(data.steps);
      setRunMessage(data.message || '已完成');
      if (nextStep) setStep(nextStep);
      return data;
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : '操作失败');
      return null;
    } finally {
      setBusy(false);
      setBusyEntity(null);
    }
  }

  async function makeEpisode() {
    setStep('videos');
    await runAction('make-episode', {
      loggedIn: Boolean(session),
      creditBalance: session ? balanceNumber(session.balance) : null,
    });
  }

  async function uploadEntity(kind: 'character' | 'scene' | 'prop', entity: EditableAsset, file: File) {
    if (!entity.id) {
      setRunMessage('请先保存，再上传形象。');
      await save(undefined, { silent: true });
      return;
    }
    setBusyEntity(entity.id);
    try {
      const asset = await uploadLocalProjectAsset({ projectId, file, assetClass: 'original' });
      const data = await apiJsonPost<{ draft?: Draft; message?: string }>(
        `/api/app/projects/${projectId}/drama`,
        { action: 'attach-entity-asset', kind, entityId: entity.id, assetId: asset.id }
      );
      if (data.draft) applyDraft(data.draft, { keepStep: true });
      setRunMessage(data.message || '已上传形象');
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : '上传失败');
    } finally {
      setBusyEntity(null);
    }
  }

  async function exportEpisode() {
    setExporting(true);
    setRunMessage('正在导出整集 MP4…');
    try {
      const timelinePayload = await apiJsonGet<{
        timeline: { document: TimelineDocument; version: number } | null
      }>(`/api/app/projects/${projectId}/timeline`);
      const source = timelinePayload.timeline?.document;
      if (!source) throw new Error('还没有时间线，不能导出成片。');
      const document = selectEpisodeExportDocument(source);
      const blob = await exportTimelineMp4({ document });
      const filename = `${(document.name || '成片').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}-成片.mp4`;
      const savedFile = await saveBlobToUserChoice(blob, filename);
      const file = new File([blob], filename, { type: 'video/mp4' });
      const meta = await inspectLocalMedia(file).catch(() => null);
      const asset = await uploadLocalProjectAsset({
        projectId,
        file,
        assetClass: 'derived',
        width: meta?.width ?? undefined,
        height: meta?.height ?? undefined,
        durationMs: document.duration * 1000,
        metadata: { operation: 'episode_render', timelineId: document.id },
      });
      await apiJsonPost(`/api/app/projects/${projectId}/drama`, {
        action: 'record-episode-render',
        assetId: asset.id,
        publicUrl: asset.publicUrl,
      });
      setRunMessage(
        savedFile.method === 'picker'
          ? `整集 MP4 已保存到你选择的位置（${savedFile.filename}），并在这台电脑的项目目录里留了一份本机副本。`
          : `整集 MP4 已开始下载（${savedFile.filename}）。浏览器会把它放到默认下载目录；同时这台电脑的项目目录里也留了一份本机副本。`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setRunMessage('已取消选择保存位置。');
        return;
      }
      try {
        const fallback = await apiJsonPost<{
          message?: string
          asset?: { localPath?: string }
          error?: string
        }>(`/api/app/projects/${projectId}/drama`, { action: 'export-episode' });
        if (fallback.asset?.localPath || fallback.message) {
          setRunMessage(fallback.message || `整集已写到这台电脑：${fallback.asset?.localPath}`);
          return;
        }
        throw new Error(fallback.error || '导出失败');
      } catch (nested) {
        setRunMessage(
          error instanceof Error
            ? `导出失败：${error.message}${nested instanceof Error && nested.message !== error.message ? `；${nested.message}` : ''}`
            : '导出失败'
        );
      }
    } finally {
      setExporting(false);
    }
  }

  async function queueBackup() {
    try {
      const data = await apiJsonPost<{ draft: Draft }>(
        `/api/app/projects/${projectId}/drama`,
        { action: 'settings', cloudBackupStatus: 'queued' }
      );
      if (data.draft) applyDraft(data.draft, { keepStep: true });
      setStatus('已记下云端备份意向。备份尚未开通，请同时导出项目包。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法记下备份意向');
    }
  }

  if (missing) {
    return (
      <BeatApiProductShell active="drama" locale={locale} layout="workbench">
        <main className="mx-auto max-w-xl px-6 py-16">
          <h1 className="text-2xl font-semibold">找不到项目。</h1>
          <Link className="mt-6 inline-block text-sm underline" to="/drama">
            返回短剧列表
          </Link>
        </main>
      </BeatApiProductShell>
    );
  }

  const insufficient = Boolean(session) && balanceNumber(session?.balance) <= 0;
  const assembleComplete = steps.some((item) => item.id === 'assemble_episode' && item.state === 'complete');
  const scriptReady = Boolean(body.trim());

  function updateAsset(kind: 'characters' | 'scenes' | 'props', index: number, next: EditableAsset) {
    const setter = kind === 'characters' ? setCharacters : kind === 'scenes' ? setScenes : setProps;
    setter((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  return (
    <BeatApiProductShell active="drama" locale={locale} layout="workbench">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <Link className="text-sm text-white/60" to="/drama">
            返回短剧列表
          </Link>
          <h1 className="text-lg font-semibold">{title || '做一集'}</h1>
          {locked ? (
            <span className="text-xs text-white/45">画面比例已锁定为 {aspectRatio}</span>
          ) : (
            <span className="text-xs text-white/45">第一次保存后将锁定画面比例</span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void save()}>
              保存到本机
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void runAction('sync-canvas')}
            >
              同步到画布
            </Button>
          </div>
        </div>

        {!session ? (
          <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-50 sm:px-6">
            登录后才能生成形象和视频。写剧本、编辑资产和保存不需要登录。
            <Link className="ml-2 underline" to="/cloud-account">
              去登录
            </Link>
          </div>
        ) : insufficient ? (
          <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-sm text-amber-50 sm:px-6">
            积分不足（当前 {formatCredits(session.balance)}）。已写的稿还在。
            <Link className="ml-2 underline" to="/cloud-account">
              查看积分
            </Link>
          </div>
        ) : (
          <p className="border-b border-white/5 px-4 py-2 text-xs text-white/45 sm:px-6">
            已登录，积分 {formatCredits(session.balance)}。生成走开镜薄云，不必先选厂商模型。
          </p>
        )}

        <div className="flex min-h-0 flex-1">
          <DramaStageNav
            current={step}
            draft={draftLike}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            onSelect={setStep}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <form
              className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6"
              onSubmit={(event) => void save(event)}
            >
              {step === 'raw' ? (
                <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                  <h2 className="text-xl font-semibold">原始内容</h2>
                  <p className="text-sm text-white/60">写下小说、一句话或大纲。这是改写和提取资产的起点。</p>
                  <label className="flex flex-col gap-1 text-sm">
                    集标题
                    <Input className="border-white/15 bg-black/30" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-sm">
                      来源
                      <select
                        className="h-8 rounded-md border border-white/15 bg-black/30 px-3 text-sm"
                        value={sourceKind}
                        onChange={(event) => setSourceKind(event.target.value)}
                      >
                        <option value="one_liner">一句话</option>
                        <option value="novel">小说</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      画质
                      <select
                        className="h-8 rounded-md border border-white/15 bg-black/30 px-3 text-sm"
                        value={quality}
                        onChange={(event) => setQuality(event.target.value)}
                      >
                        <option value="fast">快速</option>
                        <option value="standard">标准</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      画面比例
                      <select
                        className="h-8 rounded-md border border-white/15 bg-black/30 px-3 text-sm disabled:opacity-60"
                        value={aspectRatio}
                        disabled={locked}
                        onChange={(event) => setAspectRatio(event.target.value as '9:16' | '16:9')}
                      >
                        <option value="9:16">竖屏 9:16（默认）</option>
                        <option value="16:9">横屏 16:9</option>
                      </select>
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    原始输入
                    <Textarea
                      className="min-h-64 border-white/15 bg-black/30"
                      value={sourceText}
                      onChange={(event) => setSourceText(event.target.value)}
                      placeholder="用一句话描述这一集，或粘贴小说、大纲"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline">
                      保存到本机
                    </Button>
                    <Button type="button" disabled={busy || !sourceText.trim()} onClick={() => void runAction('rewrite-script', {}, 'rewrite')}>
                      开始改写
                    </Button>
                    <Button type="button" variant="outline" disabled={busy || !sourceText.trim()} onClick={() => void runAction('skip-rewrite', {}, 'rewrite')}>
                      跳过改写
                    </Button>
                  </div>
                </section>
              ) : null}

              {step === 'rewrite' ? (
                <section className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-semibold">AI 改写</h2>
                      {revision ? <p className="text-xs text-white/45">当前稿 revision {revision}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" disabled={busy || !sourceText.trim()} onClick={() => void runAction('rewrite-script')}>
                        {body.trim() ? '重新改写' : '开始改写'}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runAction('skip-rewrite')}>
                        跳过改写
                      </Button>
                    </div>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    集标题
                    <Input className="border-white/15 bg-black/30" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <Textarea
                    className="min-h-0 flex-1 border-white/15 bg-black/30 font-mono text-sm"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="改写后的剧本会出现在这里，也可以自己写。导演改写走开镜薄云，不会在页面里直接调模型。"
                  />
                </section>
              ) : null}

              {step === 'assets' ? (
                <section className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
                  {!scriptReady ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-sm leading-6 text-white/70">
                      <p>还没有可用剧本，不能提取角色、场景和道具。</p>
                      <Button type="button" className="mt-3" size="sm" onClick={() => setStep(sourceText.trim() ? 'rewrite' : 'raw')}>
                        去完成剧本
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-xl font-semibold">资产制作</h2>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" disabled={busy} onClick={() => void runAction('extract-entities')}>
                            {characters.length + scenes.length + props.length ? '重新提取' : '开始提取'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void runAction('generate-entity-image', { kind: 'character', onlyMissing: true })}
                          >
                            批量生成角色
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void runAction('generate-entity-image', { kind: 'scene', onlyMissing: true })}
                          >
                            批量生成场景
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void runAction('generate-entity-image', { kind: 'prop', onlyMissing: true })}
                          >
                            批量生成道具
                          </Button>
                        </div>
                      </div>
                      <AssetSection
                        title="角色"
                        kindLabel="角色"
                        kind="character"
                        items={characters}
                        projectId={projectId}
                        busyId={busyEntity}
                        onChange={(index, next) => updateAsset('characters', index, next)}
                        onAdd={() => setCharacters((current) => [...current, emptyAsset()])}
                        onGenerate={(item) => {
                          if (!item.id) return;
                          setBusyEntity(item.id);
                          void runAction('generate-entity-image', { kind: 'character', entityId: item.id, onlyMissing: false });
                        }}
                        onUpload={(item, file) => void uploadEntity('character', item, file)}
                      />
                      <AssetSection
                        title="场景"
                        kindLabel="场景"
                        kind="scene"
                        items={scenes}
                        projectId={projectId}
                        busyId={busyEntity}
                        onChange={(index, next) => updateAsset('scenes', index, next)}
                        onAdd={() => setScenes((current) => [...current, emptyAsset()])}
                        onGenerate={(item) => {
                          if (!item.id) return;
                          setBusyEntity(item.id);
                          void runAction('generate-entity-image', { kind: 'scene', entityId: item.id, onlyMissing: false });
                        }}
                        onUpload={(item, file) => void uploadEntity('scene', item, file)}
                      />
                      <AssetSection
                        title="道具"
                        kindLabel="道具"
                        kind="prop"
                        items={props}
                        projectId={projectId}
                        busyId={busyEntity}
                        onChange={(index, next) => updateAsset('props', index, next)}
                        onAdd={() => setProps((current) => [...current, emptyAsset()])}
                        onGenerate={(item) => {
                          if (!item.id) return;
                          setBusyEntity(item.id);
                          void runAction('generate-entity-image', { kind: 'prop', entityId: item.id, onlyMissing: false });
                        }}
                        onUpload={(item, file) => void uploadEntity('prop', item, file)}
                      />
                    </>
                  )}
                </section>
              ) : null}

              {step === 'videos' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-semibold">视频制作</h2>
                      <p className="text-sm text-white/55">在同一页拆分镜、编辑当前镜并生成视频。也可以整集跑通。</p>
                    </div>
                    <Button type="button" size="sm" disabled={busy} onClick={() => void makeEpisode()}>
                      {steps.some(
                        (item) =>
                          item.id !== 'assemble_episode' &&
                          (item.state === 'failed' || item.state === 'needs_login' || item.state === 'needs_credits')
                      )
                        ? '重试失败步骤'
                        : '做一集（整集跑通）'}
                    </Button>
                  </div>
                  {!scriptReady ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-8 text-sm text-white/70">
                      还没有剧本，不能拆分镜。
                      <Button type="button" className="ml-3" size="sm" onClick={() => setStep('raw')}>
                        去写原始内容
                      </Button>
                    </div>
                  ) : (
                    <DramaVideoStudio
                      projectId={projectId}
                      aspectRatio={aspectRatio}
                      shots={shots}
                      selectedIndex={Math.min(selectedShot, Math.max(shots.length - 1, 0))}
                      characters={characters}
                      scenes={scenes}
                      props={props}
                      busy={busy}
                      onSelect={setSelectedShot}
                      onChangeShot={(index, next) =>
                        setShots((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))
                      }
                      onAddShot={() => setShots((current) => [...current, emptyShot()])}
                      onBreakdown={() => void runAction('breakdown-storyboard')}
                      onGenerateShot={(shot) => {
                        if (!shot.id) {
                          setRunMessage('请先保存分镜，再生成这一镜。');
                          void save();
                          return;
                        }
                        void runAction('generate-shot-video', { shotId: shot.id });
                      }}
                      onGenerateMissing={() => void runAction('generate-shot-video')}
                    />
                  )}
                  {steps.length ? (
                    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {steps.map((item) => (
                        <li key={item.id} className="rounded-xl border border-white/10 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <strong>{item.label}</strong>
                            <span className="text-white/45">{item.state}</span>
                          </div>
                          <p className="mt-1 text-white/55">{item.detail}</p>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}

              {step === 'export' ? (
                <DramaExportGallery
                  projectId={projectId}
                  shots={shots}
                  selectedIds={selectedExportIds}
                  onToggle={(id) =>
                    setSelectedExportIds((current) =>
                      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
                    )
                  }
                  onSelectReady={() =>
                    setSelectedExportIds(
                      shots
                        .filter((shot) => shot.status === 'ready' && shot.videoAssetId && shot.id)
                        .map((shot) => shot.id!)
                    )
                  }
                  onClear={() => setSelectedExportIds([])}
                  onAssembleSelected={() => {
                    setHasTimeline(true);
                    void runAction('assemble-episode', { shotIds: selectedExportIds, allowPartial: true });
                  }}
                  onExport={() => void exportEpisode()}
                  exporting={exporting}
                  hasTimeline={hasTimeline}
                  assembleComplete={assembleComplete}
                />
              ) : null}
            </form>

            <div className="space-y-2 border-t border-white/10 px-4 py-3 text-xs leading-5 text-white/55 sm:px-6">
              <p>{status}</p>
              {runMessage ? <p className="text-white/80">{runMessage}</p> : null}
              {storageMessage ? <p>{storageMessage}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                <a href={`/canvas/${projectId}`}>在画布上查看</a>
                <a href={`/editor/${projectId}`}>打开本机时间线</a>
                <a href={`/studio/${projectId}`}>打开创作台</a>
                <button type="button" className="underline" onClick={() => void queueBackup()}>
                  预约云备份（占位）
                </button>
                <span>云端备份：{backup === 'queued' ? '已记下占位意向' : '默认只保存在这台电脑'}</span>
              </div>
              <ProjectPackageBar projectId={projectId} />
            </div>
          </div>
        </div>
      </div>
    </BeatApiProductShell>
  );
}

function AssetSection({
  title,
  kindLabel,
  kind: _kind,
  items,
  projectId,
  busyId,
  onChange,
  onAdd,
  onGenerate,
  onUpload,
}: {
  title: string
  kindLabel: string
  kind: 'character' | 'scene' | 'prop'
  items: EditableAsset[]
  projectId: string
  busyId?: string | null
  onChange: (index: number, next: EditableAsset) => void
  onAdd: () => void
  onGenerate: (item: EditableAsset) => void
  onUpload: (item: EditableAsset, file: File) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          添加{kindLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/45">还没有{kindLabel}。可以提取，也可以先手动添加。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item, index) => (
            <DramaAssetCard
              key={item.id || `${kindLabel}-${index}`}
              kindLabel={kindLabel}
              asset={item}
              previewUrl={item.assetId ? `/api/app/projects/${projectId}/assets/${item.assetId}` : null}
              busy={Boolean(item.id && busyId === item.id)}
              onChange={(next) => onChange(index, next)}
              onGenerate={item.id ? () => onGenerate(item) : undefined}
              onUpload={(file) => onUpload(item, file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
