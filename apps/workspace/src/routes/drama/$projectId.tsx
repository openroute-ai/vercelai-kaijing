import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ProjectPackageBar } from '@/components/kaijing/project-package-bar';
import { BeatApiProductShell } from '@/components/marketing/beatapi-product-shell';
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

type ShotDraft = {
  description: string;
  dialogue: string;
  durationMs: number;
  status?: string;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  errorMessage?: string | null;
};
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
  storyboard: { title: string; shots: ShotDraft[] } | null;
  characters?: Array<{ name: string; description: string; assetId?: string | null }>;
};

function emptyShot(): ShotDraft {
  return { description: '', dialogue: '', durationMs: 4000 };
}

function DramaEditorPage() {
  const { locale } = Route.useLoaderData();
  const { projectId } = Route.useParams();
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState('one_liner');
  const [sourceText, setSourceText] = useState('');
  const [body, setBody] = useState('');
  const [boardTitle, setBoardTitle] = useState('分镜');
  const [shots, setShots] = useState<ShotDraft[]>([emptyShot()]);
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
  const [characters, setCharacters] = useState<Array<{ name: string; description: string; assetId?: string | null }>>([]);

  function applyDraft(draft: Draft) {
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
  }

  async function load() {
    setStatus('正在读取本机稿…');
    try {
      const data = await apiJsonGet<{ draft: Draft | null; error?: string }>(
        `/api/app/projects/${projectId}/drama`
      );
      if (!data.draft) {
        setMissing(true);
        setStatus('找不到项目。');
        return;
      }
      applyDraft(data.draft);
      setStatus(data.draft.script ? `已打开第 ${data.draft.script.revision} 稿` : '还没有剧本，写下后保存');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取失败');
    }
  }

  useEffect(() => {
    void load();
    void fetchCloudSession().then((result) => setSession(result.session));
  }, [projectId]);

  const payload = useMemo(
    () => ({
      quality,
      aspectRatio,
      script: { title, sourceKind, sourceText, body },
      storyboard: {
        title: boardTitle,
        shots: shots.map((shot) => ({
          description: shot.description,
          dialogue: shot.dialogue,
          durationMs: shot.durationMs,
        })),
      },
    }),
    [aspectRatio, boardTitle, body, quality, shots, sourceKind, sourceText, title]
  );

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setStatus('正在保存…');
    try {
      const data = await apiJsonPost<{ draft: Draft }>(
        `/api/app/projects/${projectId}/drama`,
        payload
      );
      if (data.draft) applyDraft(data.draft);
      setStatus(`已保存第 ${data.draft?.script?.revision ?? ''} 稿`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    }
  }

  async function makeEpisode() {
    setRunMessage('正在准备「做一集」…');
    try {
      await apiJsonPost(`/api/app/projects/${projectId}/drama`, payload);
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
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : '做一集失败');
    }
  }

  async function queueBackup() {
    try {
      const data = await apiJsonPost<{ draft: Draft }>(
        `/api/app/projects/${projectId}/drama`,
        { action: 'settings', cloudBackupStatus: 'queued' }
      );
      if (data.draft) applyDraft(data.draft);
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

  return (
    <BeatApiProductShell active="drama" locale={locale}>
      <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-6 px-6 pb-16 pt-12">
        <p>
          <Link className="text-sm text-white/60" to="/drama">
            返回短剧列表
          </Link>
        </p>
        <h1 className="text-3xl font-semibold">做一集</h1>
        <p className="text-sm leading-6 text-white/70">
          项目保存在这台电脑上。画面比例创建后不能再改。「做一集」会写回剧本和分镜，再经开镜薄云调用 OpenRoute 生成形象和视频。没有真实结果时不会假装出片，失败步骤可单独重试。
        </p>
        <ProjectPackageBar projectId={projectId} />

        {!session ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
            登录后才能生成。写剧本和保存不需要登录。
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

        <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
          <label className="flex flex-col gap-1 text-sm">
            集标题
            <input
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              来源
              <select
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
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
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
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
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2 disabled:opacity-60"
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
            <textarea
              className="min-h-24 rounded-md border border-white/15 bg-black/30 px-3 py-2"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="用一句话描述这一集，或粘贴小说"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            剧本正文
            <textarea
              className="min-h-40 rounded-md border border-white/15 bg-black/30 px-3 py-2"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            分镜标题
            <input
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
              value={boardTitle}
              onChange={(event) => setBoardTitle(event.target.value)}
            />
          </label>
          {shots.map((shot, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-3">
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2 sm:col-span-2"
                placeholder="这一镜发生什么"
                value={shot.description}
                onChange={(event) =>
                  setShots((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, description: event.target.value } : item
                    )
                  )
                }
              />
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
                placeholder="对白，可空"
                value={shot.dialogue}
                onChange={(event) =>
                  setShots((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, dialogue: event.target.value } : item
                    )
                  )
                }
              />
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
                type="number"
                min={1}
                value={shot.durationMs}
                onChange={(event) =>
                  setShots((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, durationMs: Number(event.target.value) }
                        : item
                    )
                  )
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              className="text-sm text-white/70"
              type="button"
              onClick={() => setShots((current) => [...current, emptyShot()])}
            >
              加一镜
            </button>
            <button className="rounded-md border border-white/20 px-4 py-2 text-sm" type="submit">
              保存到本机
            </button>
            <button
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black"
              type="button"
              onClick={() => void makeEpisode()}
            >
              {steps.some((step) => step.state === 'failed') ? '重试失败步骤' : '做一集'}
            </button>
          </div>
        </form>

        {revision ? <p className="text-sm text-white/60">当前稿 revision {revision}</p> : null}
        {characters.length ? (
          <div className="text-sm leading-6 text-white/70">
            <p className="font-medium text-white/80">角色</p>
            {characters.map((item) => (
              <p key={item.name}>
                {item.name}
                {item.assetId ? '（已有形象）' : ''}
                {item.description ? `：${item.description}` : ''}
              </p>
            ))}
          </div>
        ) : null}
        <p className="text-sm text-white/80">{status}</p>
        {runMessage ? <p className="text-sm leading-6 text-white/80">{runMessage}</p> : null}

        {steps.length ? (
          <ol className="flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.id} className="rounded-xl border border-white/10 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <strong>{step.label}</strong>
                  <span className="text-xs text-white/50">
                    {step.state === 'complete'
                      ? '已完成'
                      : step.state === 'running'
                        ? '进行中'
                        : step.state === 'failed'
                          ? '失败，可重试'
                          : step.state === 'needs_login'
                            ? '需要登录'
                            : step.state === 'needs_credits'
                              ? '积分不足'
                              : step.state === 'blocked'
                                ? '未完成'
                                : step.state}
                  </span>
                </div>
                <p className="mt-1 leading-6 text-white/65">{step.detail}</p>
                {step.state === 'needs_login' ? (
                  <Link className="mt-2 inline-block text-xs underline" to="/cloud-account">
                    去登录后再试
                  </Link>
                ) : null}
                {step.state === 'needs_credits' ? (
                  <Link className="mt-2 inline-block text-xs underline" to="/cloud-account">
                    查看积分与套餐
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="flex flex-wrap gap-4 text-sm text-white/70">
          <a href={`/canvas/${projectId}`}>在画布上查看</a>
          <a href={`/editor/${projectId}`}>打开时间线</a>
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
