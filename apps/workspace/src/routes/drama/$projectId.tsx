import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';

import { apiJsonGet, apiJsonPost } from '@/lib/api-client';

export const Route = createFileRoute('/drama/$projectId')({
  component: DramaEditorPage,
});

type ShotForm = { description: string; dialogue: string; durationMs: string };

type DraftResponse = {
  draft: {
    script: {
      title: string;
      sourceKind: string;
      sourceText: string;
      body: string;
      revision: number;
    } | null;
    storyboard: {
      title: string;
      shots: Array<{ description: string; dialogue: string; durationMs: number }>;
    } | null;
  } | null;
};

function DramaEditorPage() {
  const { projectId } = Route.useParams();
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState<'one_liner' | 'novel'>('one_liner');
  const [sourceText, setSourceText] = useState('');
  const [body, setBody] = useState('');
  const [boardTitle, setBoardTitle] = useState('分镜');
  const [shots, setShots] = useState<ShotForm[]>([
    { description: '', dialogue: '', durationMs: '4000' },
  ]);
  const [revision, setRevision] = useState<number | null>(null);
  const [status, setStatus] = useState('正在读取本机稿…');

  useEffect(() => {
    let cancelled = false;
    apiJsonGet<DraftResponse>(`/api/app/projects/${projectId}/drama`)
      .then((data) => {
        if (cancelled) return;
        const script = data.draft?.script;
        const board = data.draft?.storyboard;
        if (script) {
          setTitle(script.title);
          setSourceKind(script.sourceKind === 'novel' ? 'novel' : 'one_liner');
          setSourceText(script.sourceText);
          setBody(script.body);
          setRevision(script.revision);
        }
        if (board) {
          setBoardTitle(board.title);
          setShots(
            board.shots.length > 0
              ? board.shots.map((shot) => ({
                  description: shot.description,
                  dialogue: shot.dialogue,
                  durationMs: String(shot.durationMs),
                }))
              : [{ description: '', dialogue: '', durationMs: '4000' }]
          );
        }
        setStatus(script ? `已打开第 ${script.revision} 稿` : '还没有剧本，写下后保存');
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : '读取失败');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function updateShot(index: number, patch: Partial<ShotForm>) {
    setShots((current) => current.map((shot, shotIndex) => (shotIndex === index ? { ...shot, ...patch } : shot)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus('正在保存…');
    try {
      const data = await apiJsonPost<DraftResponse>(`/api/app/projects/${projectId}/drama`, {
        script: { title, sourceKind, sourceText, body },
        storyboard: {
          title: boardTitle,
          shots: shots
            .filter((shot) => shot.description.trim() || shot.dialogue.trim())
            .map((shot) => ({
              description: shot.description,
              dialogue: shot.dialogue,
              durationMs: Number(shot.durationMs || '4000'),
            })),
        },
      });
      setRevision(data.draft?.script?.revision ?? null);
      setStatus(`已保存第 ${data.draft?.script?.revision ?? ''} 稿`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-[#101114] px-6 py-16 text-[#f4f4f5]">
      <Link className="text-sm text-white/60" to="/drama">
        返回短剧列表
      </Link>
      <h1 className="text-3xl font-semibold">手写剧本和分镜</h1>
      <p className="text-sm text-white/70">{status}</p>
      <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
        <label className="flex flex-col gap-1 text-sm">
          集标题
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          来源
          <select
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={sourceKind}
            onChange={(event) => setSourceKind(event.target.value === 'novel' ? 'novel' : 'one_liner')}
          >
            <option value="one_liner">一句话</option>
            <option value="novel">小说</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          原始输入
          <textarea
            className="min-h-20 rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
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
          <fieldset key={index} className="flex flex-col gap-2 rounded-md border border-white/10 p-3">
            <legend className="px-1 text-sm">第 {index + 1} 镜</legend>
            <textarea
              className="min-h-16 rounded-md border border-white/15 bg-black/30 px-3 py-2"
              placeholder="这一镜发生什么"
              value={shot.description}
              onChange={(event) => updateShot(index, { description: event.target.value })}
            />
            <input
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
              placeholder="对白，可空"
              value={shot.dialogue}
              onChange={(event) => updateShot(index, { dialogue: event.target.value })}
            />
            <input
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
              inputMode="numeric"
              value={shot.durationMs}
              onChange={(event) => updateShot(index, { durationMs: event.target.value })}
            />
          </fieldset>
        ))}
        <div className="flex gap-3">
          <button
            className="rounded-md border border-white/20 px-3 py-2 text-sm"
            type="button"
            onClick={() => setShots((current) => [...current, { description: '', dialogue: '', durationMs: '4000' }])}
          >
            加一镜
          </button>
          <button className="rounded-md bg-white px-4 py-2 text-sm text-black" type="submit">
            保存到本机
          </button>
        </div>
        {revision ? <p className="text-sm text-white/60">当前稿 revision {revision}</p> : null}
      </form>
    </main>
  );
}
