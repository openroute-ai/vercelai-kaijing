import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { DramaAssetCard, type EditableAsset } from '@/components/kaijing/drama/asset-card';
import { DramaShotCard, type EditableShot } from '@/components/kaijing/drama/shot-card';
import { DramaStepRail } from '@/components/kaijing/drama/step-rail';
import {
  assetPreviewUrl,
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

type StepState = {
  id: string;
  label: string;
  state: string;
  detail: string;
};

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
  const [shots, setShots] = useState<EditableShot[]>([emptyShot()]);
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
  const [step, setStep] = useState<WorkbenchStepId>('input');
  const [hasTimeline, setHasTimeline] = useState(false);

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
      setShots(draft.storyboard.shots.length ? draft.storyboard.shots : [emptyShot()]);
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
        error?: string
        steps?: StepState[]
        storage?: { dataRoot?: string; message?: string }
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
        })),
      },
      characters,
      scenes,
      props,
    }),
    [aspectRatio, boardTitle, body, characters, props, quality, scenes, shots, sourceKind, sourceText, title]
  );

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

  async function makeEpisode() {
    setRunMessage('正在准备「做一集」…');
    try {
      await apiJsonPost(`/api/app/projects/${projectId}/drama`, workbenchPayload);
      const data = await apiJsonPost<{
        steps: StepState[];
        message: string;
        draft: Draft;
      }>(`/api/app/projects/${projectId}/drama`, {
        action: 'make-episode',
        loggedIn: Boolean(session),
        creditBalance: session ? balanceNumber(session.balance) : null,
      });
      if (data.draft) applyDraft(data.draft);
      setSteps(data.steps ?? []);
      setRunMessage(data.message);
      setStep('produce');
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : '做一集失败');
    }
  }

  async function retryAssemble() {
    setRunMessage('正在重试铺轨…');
    try {
      const data = await apiJsonPost<{ steps: StepState[]; message: string; draft: Draft }>(
        `/api/app/projects/${projectId}/drama`,
        { action: 'assemble-episode' }
      );
      if (data.draft) applyDraft(data.draft, { keepStep: true });
      setSteps(data.steps ?? []);
      setRunMessage(data.message);
      setHasTimeline(true);
      setStep('finish');
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : '铺轨失败');
    }
  }

  async function syncCanvas() {
    setStatus('正在同步到画布…');
    try {
      await apiJsonPost(`/api/app/projects/${projectId}/drama`, { action: 'sync-canvas' });
      setStatus('已把剧本、角色、场景和镜头同步到画布。打开或刷新画布即可看到节点。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '同步画布失败');
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
      const saved = await saveBlobToUserChoice(blob, filename);
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
        saved.method === 'picker'
          ? `整集 MP4 已保存到你选择的位置（${saved.filename}），并在这台电脑的项目目录里留了一份本机副本。`
          : `整集 MP4 已开始下载（${saved.filename}）。浏览器会把它放到默认下载目录；同时这台电脑的项目目录里也留了一份本机副本。`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setRunMessage('已取消选择保存位置。');
        return;
      }
      try {
        const fallback = await apiJsonPost<{
          message?: string
          asset?: { localPath?: string; filename?: string; publicUrl?: string }
          error?: string
          clientExportRequired?: boolean
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
      <BeatApiProductShell active="drama" locale={locale}>
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
  const allShotsReady =
    shots.length > 0 && shots.every((shot) => shot.status === 'ready' && shot.videoAssetId);
  const canRetryFailed = steps.some(
    (item) =>
      item.id !== 'assemble_episode' &&
      (item.state === 'failed' || item.state === 'needs_login' || item.state === 'needs_credits')
  );
  const assembleFailed = steps.some(
    (item) => item.id === 'assemble_episode' && (item.state === 'failed' || item.state === 'blocked')
  );
  const assembleComplete = steps.some((item) => item.id === 'assemble_episode' && item.state === 'complete');

  function updateAsset(kind: 'characters' | 'scenes' | 'props', index: number, next: EditableAsset) {
    const setter = kind === 'characters' ? setCharacters : kind === 'scenes' ? setScenes : setProps;
    setter((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)));
  }

  return (
    <BeatApiProductShell active="drama" locale={locale}>
      <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col gap-6 px-6 pb-16 pt-12">
        <p>
          <Link className="text-sm text-white/60" to="/drama">
            返回短剧列表
          </Link>
        </p>
        <h1 className="text-3xl font-semibold">做一集</h1>
        <p className="text-sm leading-6 text-white/70">
          按步骤完成：小说或一句话、剧本、角色与场景、分镜板、出片、再到时间线成片。项目默认保存在这台电脑。导演文本和生成都走开镜薄云；没有真实镜头视频时不会假装已经出片。画面比例创建后不能再改。
        </p>
        <ProjectPackageBar projectId={projectId} />

        {!session ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            登录后才能生成形象和视频。写剧本、编辑资产和保存不需要登录。
            <Link className="ml-2 underline" to="/cloud-account">
              去登录
            </Link>
          </div>
        ) : insufficient ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            积分不足（当前 {formatCredits(session.balance)}）。已写的稿还在，生成前请到云端账户查看礼包或套餐。
            <Link className="ml-2 underline" to="/cloud-account">
              查看积分
            </Link>
          </div>
        ) : (
          <p className="text-sm text-white/55">已登录，积分 {formatCredits(session.balance)}。</p>
        )}

        <DramaStepRail current={step} onSelect={setStep} />

        <form className="flex flex-col gap-5" onSubmit={(event) => void save(event)}>
          {step === 'input' ? (
            <section className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                集标题
                <Input
                  className="border-white/15 bg-black/30"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
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
              {locked ? (
                <p className="text-xs text-white/45">画面比例已锁定为 {aspectRatio}，创建后不能再改。</p>
              ) : (
                <p className="text-xs text-white/45">第一次保存后，画面比例会锁定。</p>
              )}
              <label className="flex flex-col gap-1 text-sm">
                原始输入
                <Textarea
                  className="min-h-32 border-white/15 bg-black/30"
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="用一句话描述这一集，或粘贴小说"
                />
              </label>
            </section>
          ) : null}

          {step === 'script' ? (
            <section className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                集标题
                <Input
                  className="border-white/15 bg-black/30"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                剧本正文
                <Textarea
                  className="min-h-64 border-white/15 bg-black/30"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="保存输入后点「做一集」，导演会把改写后的剧本写到这里，也可以自己改。"
                />
              </label>
              {revision ? <p className="text-sm text-white/60">当前稿 revision {revision}</p> : null}
            </section>
          ) : null}

          {step === 'assets' ? (
            <section className="flex flex-col gap-6">
              <AssetSection
                title="角色"
                kindLabel="角色"
                items={characters}
                projectId={projectId}
                onChange={(index, next) => updateAsset('characters', index, next)}
                onAdd={() => setCharacters((current) => [...current, emptyAsset()])}
              />
              <AssetSection
                title="场景"
                kindLabel="场景"
                items={scenes}
                projectId={projectId}
                onChange={(index, next) => updateAsset('scenes', index, next)}
                onAdd={() => setScenes((current) => [...current, emptyAsset()])}
              />
              <AssetSection
                title="道具"
                kindLabel="道具"
                items={props}
                projectId={projectId}
                onChange={(index, next) => updateAsset('props', index, next)}
                onAdd={() => setProps((current) => [...current, emptyAsset()])}
              />
            </section>
          ) : null}

          {step === 'board' ? (
            <section className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                分镜标题
                <Input
                  className="border-white/15 bg-black/30"
                  value={boardTitle}
                  onChange={(event) => setBoardTitle(event.target.value)}
                />
              </label>
              {shots.map((shot, index) => (
                <DramaShotCard
                  key={shot.id || index}
                  index={index}
                  shot={shot}
                  aspectRatio={aspectRatio}
                  previewUrl={assetPreviewUrl(projectId, shot.videoAssetId || shot.imageAssetId)}
                  onChange={(next) =>
                    setShots((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))
                  }
                />
              ))}
              <Button type="button" variant="ghost" onClick={() => setShots((current) => [...current, emptyShot()])}>
                加一镜
              </Button>
            </section>
          ) : null}

          {step === 'produce' ? (
            <section className="flex flex-col gap-4">
              <p className="text-sm leading-6 text-white/70">
                「做一集」会把导演文本和生成请求交给开镜薄云，再把剧本、角色、分镜写回这台电脑。失败的步骤可以重试，已成功的文本步骤不会重跑。没有真实视频时不会自动导出。
              </p>
              {steps.length ? (
                <ol className="flex flex-col gap-2">
                  {steps.map((item) => (
                    <li key={item.id} className="rounded-xl border border-white/10 px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <strong>{item.label}</strong>
                        <span className="text-xs text-white/50">
                          {item.state === 'complete'
                            ? '已完成'
                            : item.state === 'running'
                              ? '进行中'
                              : item.state === 'failed'
                                ? '失败，可重试'
                                : item.state === 'needs_login'
                                  ? '需要登录'
                                  : item.state === 'needs_credits'
                                    ? '积分不足'
                                    : item.state === 'blocked'
                                      ? '未完成'
                                      : item.state}
                        </span>
                      </div>
                      <p className="mt-1 leading-6 text-white/65">{item.detail}</p>
                      {item.state === 'needs_login' ? (
                        <Link className="mt-2 inline-block text-xs underline" to="/cloud-account">
                          去登录后再试
                        </Link>
                      ) : null}
                      {item.state === 'needs_credits' ? (
                        <Link className="mt-2 inline-block text-xs underline" to="/cloud-account">
                          查看积分与套餐
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-white/55">还没有跑过「做一集」。保存输入后即可开始。</p>
              )}
            </section>
          ) : null}

          {step === 'finish' ? (
            <section className="flex flex-col gap-4">
              <p className="text-sm leading-6 text-white/70">
                全部镜头就绪后，会按分镜顺序把视频和对白字幕铺进本机时间线。请打开时间线确认，再导出整集 MP4。没有真实镜头时不会出现导出入口。
              </p>
              <p className="text-sm text-white/60">
                镜头就绪 {shots.filter((shot) => shot.status === 'ready' && shot.videoAssetId).length} / {shots.length}
                {hasTimeline || assembleComplete ? ' · 时间线已有铺轨' : ' · 尚未铺进时间线'}
              </p>
              {allShotsReady && !assembleComplete ? (
                <Button type="button" variant="outline" onClick={() => void retryAssemble()}>
                  把镜头铺进时间线
                </Button>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button className="border-white/20" variant="outline" type="submit">
              保存到本机
            </Button>
            <Button type="button" onClick={() => void makeEpisode()}>
              {canRetryFailed ? '重试失败步骤' : '做一集'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void syncCanvas()}>
              同步到画布
            </Button>
            {assembleFailed ? (
              <Button type="button" variant="outline" onClick={() => void retryAssemble()}>
                重试铺轨
              </Button>
            ) : null}
            {assembleComplete ? (
              <Button type="button" variant="outline" disabled={exporting} onClick={() => void exportEpisode()}>
                {exporting ? '正在导出…' : '导出整集 MP4'}
              </Button>
            ) : null}
          </div>
        </form>

        <p className="text-sm text-white/80">{status}</p>
        {runMessage ? <p className="text-sm leading-6 text-white/80">{runMessage}</p> : null}
        {storageMessage ? <p className="text-sm leading-6 text-white/60">{storageMessage}</p> : null}

        <div className="flex flex-wrap gap-4 text-sm text-white/70">
          <a href={`/canvas/${projectId}`}>在画布上查看</a>
          <a href={`/editor/${projectId}`}>打开本机时间线</a>
          <a href={`/studio/${projectId}`}>打开创作台</a>
          <a href={`/projects`}>项目与导出</a>
        </div>
        <div className="rounded-xl border border-white/10 p-4 text-sm leading-6 text-white/65">
          <p>
            云端备份：{backup === 'queued' ? '已记下占位意向，备份尚未开通。' : '默认只保存在这台电脑。'}
          </p>
          <button className="mt-2 text-white/80 underline" type="button" onClick={() => void queueBackup()}>
            预约云备份（占位）
          </button>
        </div>
      </main>
    </BeatApiProductShell>
  );
}

function AssetSection({
  title,
  kindLabel,
  items,
  projectId,
  onChange,
  onAdd,
}: {
  title: string
  kindLabel: string
  items: EditableAsset[]
  projectId: string
  onChange: (index: number, next: EditableAsset) => void
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          添加{kindLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/45">还没有{kindLabel}。做一集后会自动提取，也可以先手动添加。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <DramaAssetCard
              key={item.id || `${kindLabel}-${index}`}
              kindLabel={kindLabel}
              asset={item}
              previewUrl={assetPreviewUrl(projectId, item.assetId)}
              onChange={(next) => onChange(index, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
